import { CODE, StateDefinition } from "../internal";

// We enter STATE.DTD after we encounter a "<!" while in the STATE.HTML_CONTENT.
// We leave STATE.DTD if we see a ">".
export const DTD: StateDefinition = {
  name: "DTD",

  enter() {
    this.endText();
  },

  exit(documentType) {
    this.notifiers.notifyDocumentType({
      pos: documentType.pos,
      endPos: documentType.endPos,
      value: {
        pos: documentType.pos + 2, // strip <!
        endPos: documentType.endPos - 1, // strip >
      },
    });
  },

  eof(documentType) {
    this.notifyError(
      documentType,
      "MALFORMED_DOCUMENT_TYPE",
      "EOF reached while parsing document type"
    );
  },

  char(_, code) {
    if (code === CODE.CLOSE_ANGLE_BRACKET) {
      this.exitState(">");
    }
  },
};
