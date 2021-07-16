import { Parser, CODE } from "../internal";

// We enter STATE.HTML_COMMENT after we encounter a "<--"
// while in the STATE.HTML_CONTENT.
// We leave STATE.HTML_COMMENT when we see a "-->".
export const HTML_COMMENT = Parser.createState({
  name: "HTML_COMMENT",

  eol(newLineChars) {
    this.currentPart.value += newLineChars;
  },

  eof() {
    this.notifyError(
      this.currentPart.pos,
      "MALFORMED_COMMENT",
      "EOF reached while parsing comment"
    );
  },

  char(ch, code) {
    if (code === CODE.HYPHEN) {
      var match = this.lookAheadFor("->");
      if (match) {
        this.currentPart.endPos = this.pos + 3;
        this.endHtmlComment();
        this.skip(match.length);
      } else {
        this.currentPart.value += ch;
      }
    } else {
      this.currentPart.value += ch;
    }
  },
});
