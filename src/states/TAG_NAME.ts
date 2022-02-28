import {
  CODE,
  STATE,
  isWhitespaceCode,
  StateDefinition,
  peek,
  TemplateRange,
  EventTypes,
} from "../internal";

export interface TagNameMeta extends TemplateRange {
  shorthandCode?: CODE.NUMBER_SIGN | CODE.PERIOD;
}

const ONLY_OPEN_TAGS = [
  "area",
  "base",
  "br",
  "col",
  "hr",
  "embed",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
];

const EXPRESSION_TAGS = ["import", "export", "static", "class"];

// We enter STATE.TAG_NAME after we encounter a "<"
// followed by a non-special character
export const TAG_NAME: StateDefinition<TagNameMeta> = {
  name: "TAG_NAME",

  enter(tagName) {
    tagName.expressions = [];
    tagName.quasis = [{ start: tagName.start, end: tagName.end }];
  },

  exit(tagName) {
    const { start, end, quasis, expressions } = tagName;
    peek(quasis)!.end = end;

    switch (tagName.shorthandCode) {
      case CODE.NUMBER_SIGN:
        if (this.activeTag!.hasShorthandId) {
          return this.emitError(
            tagName,
            "INVALID_TAG_SHORTHAND",
            "Multiple shorthand ID parts are not allowed on the same tag"
          );
        }

        this.activeTag!.hasShorthandId = true;
        this.emit({
          type: EventTypes.TagShorthandId,
          start,
          end,
          quasis,
          expressions,
        });
        break;
      case CODE.PERIOD:
        this.emit({
          type: EventTypes.TagShorthandClass,
          start,
          end,
          quasis,
          expressions,
        });
        break;
      default: {
        const tag = this.activeTag!;
        tag.tagName = tagName;

        if (tagName.expressions.length === 0) {
          if (this.matchAnyAtPos(tagName, ONLY_OPEN_TAGS)) {
            tag.openTagOnly = true;
          } else if (
            tag.concise &&
            this.blockStack[0] === tag &&
            this.matchAnyAtPos(tagName, EXPRESSION_TAGS)
          ) {
            tag.statement = true;
            tag.openTagOnly = true;
            this.enterState(STATE.EXPRESSION, { terminatedByEOL: true });
          }
        }

        this.emit({
          type: EventTypes.TagName,
          start,
          end,
          quasis,
          expressions,
        });

        break;
      }
    }
  },

  return(_, childPart, tagName) {
    if ((childPart as STATE.ExpressionMeta).terminatedByEOL) return;
    if (childPart.start === childPart.end) {
      this.emitError(
        childPart,
        "PLACEHOLDER_EXPRESSION_REQUIRED",
        "Invalid placeholder, the expression cannot be missing"
      );
    }

    const interpolationStart = childPart.start - 2; // include ${
    const interpolationEnd = this.skip(1); // include }
    const nextQuasiStart = interpolationEnd + 1;
    peek(tagName.quasis)!.end = interpolationStart - 1;
    tagName.expressions.push({
      start: interpolationStart,
      end: interpolationEnd,
      value: {
        start: childPart.start,
        end: childPart.end,
      },
    });
    tagName.quasis.push({ start: nextQuasiStart, end: nextQuasiStart });
  },

  eol() {
    if (this.isConcise) this.exitState(); // TODO: is concise guard needed?
  },

  eof() {
    this.exitState();
  },

  char(code) {
    if (
      code === CODE.DOLLAR &&
      this.lookAtCharCodeAhead(1) === CODE.OPEN_CURLY_BRACE
    ) {
      this.skip(2); // skip ${
      this.enterState(STATE.EXPRESSION, { terminator: "}" });
      this.rewind(1);
    } else if (
      isWhitespaceCode(code) ||
      code === CODE.EQUAL ||
      (code === CODE.COLON && this.lookAtCharCodeAhead(1) === CODE.EQUAL) ||
      code === CODE.OPEN_PAREN ||
      code === CODE.FORWARD_SLASH ||
      code === CODE.PIPE ||
      (this.isConcise
        ? code === CODE.SEMICOLON
        : code === CODE.CLOSE_ANGLE_BRACKET)
    ) {
      this.activeTag!.shorthandEnd = this.pos;
      this.exitState();
    } else if (code === CODE.PERIOD || code === CODE.NUMBER_SIGN) {
      this.exitState();
      this.enterState(TAG_NAME, { shorthandCode: code }); // Shorthands reuse the TAG_NAME state
      this.skip(1); // skip . or #
    }
  },
};
