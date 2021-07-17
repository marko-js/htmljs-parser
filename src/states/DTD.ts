import { Parser, CODE } from "../internal";

// We enter STATE.DTD after we encounter a "<!" while in the STATE.HTML_CONTENT.
// We leave STATE.DTD if we see a ">".
export const DTD = Parser.createState({
  name: "DTD",

  enter(oldState, documentType) {
    this.endText();
    documentType.value = "";
  },

  exit(documentType) {
    this.notifiers.notifyDocumentType(documentType);
  },

  eol(str) {
    this.currentPart.value += str;
  },

  eof(documentType) {
    this.notifyError(
      documentType.pos,
      "MALFORMED_DOCUMENT_TYPE",
      "EOF reached while parsing document type"
    );
  },

  char(ch, code, documentType) {
    if (code === CODE.CLOSE_ANGLE_BRACKET) {
      documentType.endPos = this.pos + 1;
      this.exitState();
    } else {
      documentType.value += ch;
    }
  },
});
