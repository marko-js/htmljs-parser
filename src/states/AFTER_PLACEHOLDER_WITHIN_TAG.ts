import { Parser, CODE, isWhitespaceCode } from "../internal";

// We return to STATE.OPEN_TAG after we have fully
// read in the tag name and encountered a whitespace character
export const AFTER_PLACEHOLDER_WITHIN_TAG = Parser.createState({
  name: "AFTER_PLACEHOLDER_WITHIN_TAG",

  eol: Parser.prototype.openTagEOL,

  eof: Parser.prototype.openTagEOF,

  char(ch, code) {
    if (!this.isConcise) {
      if (code === CODE.CLOSE_ANGLE_BRACKET) {
        this.finishOpenTag();
        return;
      } else if (code === CODE.FORWARD_SLASH) {
        let nextCode = this.lookAtCharCodeAhead(1);
        if (nextCode === CODE.CLOSE_ANGLE_BRACKET) {
          this.finishOpenTag(true /* self closed */);
          this.skip(1);
          return;
        }
      }
    }

    if (isWhitespaceCode(code)) {
      this.exitState();
    } else {
      this.notifyError(
        this.pos,
        "UNEXPECTED_TEXT_AFTER_PLACEHOLDER_IN_TAG",
        `An unexpected "${ch}" character was found after a placeoholder within the open tag.`
      );
      return;
    }
  },
});
