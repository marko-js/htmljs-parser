import { Parser, CODE, STATE } from "../internal";

export const REGULAR_EXPRESSION = Parser.createState({
  name: "REGULAR_EXPRESSION",

  enter(oldState, regularExpression) {
    regularExpression.value = "/";
    regularExpression.inCharacterSet = false;
  },

  eol() {
    this.notifyError(
      this.pos,
      "INVALID_REGULAR_EXPRESSION",
      "EOL reached while parsing regular expression"
    );
  },

  eof() {
    this.notifyError(
      this.pos,
      "INVALID_REGULAR_EXPRESSION",
      "EOF reached while parsing regular expression"
    );
  },

  char(ch, code, regularExpression) {
    var nextCh;
    regularExpression.value += ch;
    if (code === CODE.BACK_SLASH) {
      // Handle escape sequence
      nextCh = this.lookAtCharAhead(1);
      this.skip(1);
      regularExpression.value += nextCh;
    } else if (
      code === CODE.OPEN_SQUARE_BRACKET &&
      regularExpression.inCharacterSet
    ) {
      regularExpression.inCharacterSet = true;
    } else if (
      code === CODE.CLOSE_SQUARE_BRACKET &&
      regularExpression.inCharacterSet
    ) {
      regularExpression.inCharacterSet = false;
    } else if (
      code === CODE.FORWARD_SLASH &&
      !regularExpression.inCharacterSet
    ) {
      this.exitState("/");
    }
  },
});
