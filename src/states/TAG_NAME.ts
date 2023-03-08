import {
  CODE,
  STATE,
  isWhitespaceCode,
  StateDefinition,
  Ranges,
  Meta,
  TagType,
  ErrorCode,
  matchesCloseCurlyBrace,
} from "../internal";

export interface TagNameMeta extends Meta, Ranges.Template {
  shorthandCode: -1 | CODE.NUMBER_SIGN | CODE.PERIOD;
}

// We enter STATE.TAG_NAME after we encounter a "<"
// followed by a non-special character
export const TAG_NAME: StateDefinition<TagNameMeta> = {
  name: "TAG_NAME",

  enter(parent, start) {
    return {
      state: TAG_NAME as StateDefinition,
      parent,
      start,
      end: start,
      shorthandCode: -1,
      expressions: [],
      quasis: [{ start, end: start }],
    };
  },

  exit(tagName) {
    const { start, end, quasis, expressions } = tagName;
    const last = quasis[quasis.length - 1];
    if (last.end < end) last.end = end;

    switch (tagName.shorthandCode) {
      case CODE.NUMBER_SIGN:
        if (this.activeTag!.hasShorthandId) {
          return this.emitError(
            tagName,
            ErrorCode.INVALID_TAG_SHORTHAND,
            "Multiple shorthand ID parts are not allowed on the same tag"
          );
        }

        this.activeTag!.hasShorthandId = true;
        this.options.onTagShorthandId?.({
          start,
          end,
          quasis,
          expressions,
        });
        break;
      case CODE.PERIOD:
        this.options.onTagShorthandClass?.({
          start,
          end,
          quasis,
          expressions,
        });
        break;
      default: {
        const tag = this.activeTag!;
        const tagType = this.options.onOpenTagName?.({
          start,
          end,
          quasis,
          expressions,
        });
        tag.tagName = tagName;

        if (tagType) {
          tag.type = tagType;

          if (tagType === TagType.statement) {
            if (!tag.concise) {
              return this.emitError(
                tagName,
                ErrorCode.RESERVED_TAG_NAME,
                `The "${this.read(
                  tagName
                )}" tag is reserved and cannot be used as an HTML tag.`
              );
            }

            if (tag.parentTag) {
              return this.emitError(
                tagName,
                ErrorCode.ROOT_TAG_ONLY,
                `"${this.read(
                  tagName
                )}" can only be used at the root of the template.`
              );
            }

            const expr = this.enterState(STATE.EXPRESSION);
            expr.operators = true;
            expr.terminatedByEOL = true;
          }
        }

        break;
      }
    }
  },

  char(code) {
    if (
      code === CODE.DOLLAR &&
      this.lookAtCharCodeAhead(1) === CODE.OPEN_CURLY_BRACE
    ) {
      this.pos += 2; // skip ${
      this.forward = 0;
      this.enterState(STATE.EXPRESSION).shouldTerminate =
        matchesCloseCurlyBrace;
    } else if (
      isWhitespaceCode(code) ||
      code === CODE.EQUAL ||
      (code === CODE.COLON && this.lookAtCharCodeAhead(1) === CODE.EQUAL) ||
      code === CODE.OPEN_PAREN ||
      code === CODE.FORWARD_SLASH ||
      code === CODE.PIPE ||
      code === CODE.OPEN_ANGLE_BRACKET ||
      code === CODE.COMMA ||
      (this.isConcise
        ? code === CODE.SEMICOLON
        : code === CODE.CLOSE_ANGLE_BRACKET)
    ) {
      this.activeTag!.shorthandEnd = this.pos;
      this.exitState();
    } else if (code === CODE.PERIOD || code === CODE.NUMBER_SIGN) {
      this.exitState();
      const shorthand = this.enterState(TAG_NAME);
      shorthand.shorthandCode = code;
      shorthand.quasis[0].start = ++this.pos; // skip . or #
    }
  },

  eol() {
    this.activeTag!.shorthandEnd = this.pos;
    this.exitState();
  },

  eof() {
    this.exitState();
  },

  return(child, tagName) {
    if ((child as STATE.ExpressionMeta).terminatedByEOL) return;
    if (child.start === child.end) {
      this.emitError(
        child,
        ErrorCode.MALFORMED_PLACEHOLDER,
        "Invalid placeholder, the expression cannot be missing"
      );
    }

    const { quasis, expressions } = tagName;
    const start = child.start - 2; // include ${
    const end = ++this.pos; // include }
    const nextStart = end;
    expressions.push({
      start,
      end,
      value: {
        start: child.start,
        end: child.end,
      },
    });

    quasis[quasis.length - 1].end = start;
    quasis.push({ start: nextStart, end: nextStart });
  },
};
