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
      start: documentType.start,
      end: documentType.end,
      value: {
        start: documentType.start + 2, // strip <!
        end: documentType.end - 1, // strip >
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
