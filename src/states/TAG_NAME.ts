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
  last: boolean;
}

// We enter STATE.TAG_NAME after we encounter a "<"
// followed by a non-special character
export const TAG_NAME: StateDefinition<TagNameRange> = {
  name: "TAG_NAME",

  enter(tagName) {
    tagName.last = false;
    tagName.expressions = [];
    tagName.quasis = [{ pos: tagName.pos, endPos: tagName.endPos }];
  },

  exit(tagName) {
    peek(tagName.quasis)!.endPos = tagName.endPos;
  },

  return(_, childPart, tagName) {
    if (childPart.pos === childPart.endPos) {
      this.notifyError(
        childPart,
        "PLACEHOLDER_EXPRESSION_REQUIRED",
        "Invalid placeholder, the expression cannot be missing"
      );
    }

    const interpolationStart = childPart.pos - 2; // include ${
    const interpolationEnd = this.skip(1); // include }
    const nextQuasiStart = interpolationEnd + 1;
    peek(tagName.quasis)!.endPos = interpolationStart - 1;
    tagName.expressions.push({
      pos: interpolationStart,
      endPos: interpolationEnd,
      value: {
        pos: childPart.pos,
        endPos: childPart.endPos,
      },
    });
    tagName.quasis.push({ pos: nextQuasiStart, endPos: nextQuasiStart });
  },

  eol() {
    if (this.isConcise) this.exitState(); // TODO: is concise guard needed?
  },

  eof() {
    this.exitState();
  },

  char(_, code, tagName) {
    if (
      code === CODE.DOLLAR &&
      this.lookAtCharCodeAhead(1) === CODE.OPEN_CURLY_BRACE
    ) {
      this.skip(2);
      this.enterState(STATE.EXPRESSION, { terminator: "}" });
      this.rewind(1);
    } else if (code === CODE.BACK_SLASH) {
      // Handle string escape sequence
      this.skip(1);
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
      tagName.last = true;
      this.exitState();
    } else if (code === CODE.PERIOD || code === CODE.NUMBER_SIGN) {
      this.exitState();
      this.enterState(TAG_NAME, { shorthandCode: code }); // Shorthands reuse the TAG_NAME state
      this.skip(1);
    }
  },
};
