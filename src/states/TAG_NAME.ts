import {
  CODE,
  STATE,
  isWhitespaceCode,
  StateDefinition,
  peek,
  TemplateRange,
} from "../internal";

export interface TagNameRange extends TemplateRange {
  shorthandCode?: CODE.NUMBER_SIGN | CODE.PERIOD;
}

const ONLY_OPEN_TAGS = [
  "base",
  "br",
  "col",
  "hr",
  "embed",
  "img",
  "input",
  "keygen",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
];

// We enter STATE.TAG_NAME after we encounter a "<"
// followed by a non-special character
export const TAG_NAME: StateDefinition<TagNameRange> = {
  name: "TAG_NAME",

  enter(tagName) {
    tagName.expressions = [];
    tagName.quasis = [{ start: tagName.start, end: tagName.end }];
  },

  exit(tagName) {
    peek(tagName.quasis)!.end = tagName.end;

    const data = {
      start: tagName.start,
      end: tagName.end,
      quasis: tagName.quasis,
      expressions: tagName.expressions,
    };

    switch (tagName.shorthandCode) {
      case CODE.NUMBER_SIGN:
        if (this.activeTag!.hasShorthandId) {
          return this.notifyError(
            tagName,
            "INVALID_TAG_SHORTHAND",
            "Multiple shorthand ID parts are not allowed on the same tag"
          );
        }

        this.activeTag!.hasShorthandId = true;
        this.notify("tagShorthandId", data);
        break;
      case CODE.PERIOD:
        this.notify("tagShorthandClass", data);
        break;
      default:
        this.activeTag!.tagName = data;
        this.activeTag!.openTagOnly =
          tagName.expressions.length === 0 &&
          this.matchAnyAtPos(tagName, ONLY_OPEN_TAGS);
        this.notify("tagName", data);
        break;
    }
  },

  return(_, childPart, tagName) {
    if (childPart.start === childPart.end) {
      this.notifyError(
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
