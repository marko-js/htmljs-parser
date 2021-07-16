import { Parser, CODE, STATE } from "../internal";

// We enter STATE.CLOSE_TAG after we see "</"
export const CLOSE_TAG = Parser.createState({
  name: "CLOSE_TAG",
  eof() {
    this.notifyError(
      this.closeTagPos,
      "MALFORMED_CLOSE_TAG",
      "EOF reached while parsing closing tag"
    );
  },

  enter() {
    this.closeTagName = "";
  },

  char(ch, code) {
    if (code === CODE.CLOSE_ANGLE_BRACKET) {
      if (this.closeTagName.length > 0) {
        this.closeTag(this.closeTagName, this.closeTagPos, this.pos + 1);
      } else {
        this.closeTag(
          this.expectedCloseTagName,
          this.closeTagPos,
          this.pos + 1
        );
      }

      this.enterState(STATE.HTML_CONTENT);
    } else {
      this.closeTagName += ch;
    }
  },
});
