import { Parser, CODE } from "../internal";

// We enter STATE.DECLARATION after we encounter a "<?"
// while in the STATE.HTML_CONTENT.
// We leave STATE.DECLARATION if we see a "?>" or ">".
export const DECLARATION = Parser.createState({
  name: "DECLARATION",

  eol(str) {
    this.currentPart.value += str;
  },

  eof() {
    this.notifyError(
      this.currentPart.pos,
      "MALFORMED_DECLARATION",
      "EOF reached while parsing declaration"
    );
  },

  char(ch, code) {
    if (code === CODE.QUESTION) {
      var nextCode = this.lookAtCharCodeAhead(1);
      if (nextCode === CODE.CLOSE_ANGLE_BRACKET) {
        this.currentPart.endPos = this.pos + 2;
        this.endDeclaration();
        this.skip(1);
      }
    } else if (code === CODE.CLOSE_ANGLE_BRACKET) {
      this.currentPart.endPos = this.pos + 1;
      this.endDeclaration();
    } else {
      this.currentPart.value += ch;
    }
  },
});
