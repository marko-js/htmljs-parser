import { Parser, CODE } from "../internal";

// We enter STATE.DTD after we encounter a "<!" while in the STATE.HTML_CONTENT.
// We leave STATE.DTD if we see a ">".
export const DTD = Parser.createState({
  name: "DTD",

  eol(str) {
    this.currentPart.value += str;
  },

  eof() {
    this.notifyError(
      this.currentPart.pos,
      "MALFORMED_DOCUMENT_TYPE",
      "EOF reached while parsing document type"
    );
  },

  char(ch, code) {
    if (code === CODE.CLOSE_ANGLE_BRACKET) {
      this.currentPart.endPos = this.pos + 1;
      this.endDocumentType();
    } else {
      this.currentPart.value += ch;
    }
  },
});
