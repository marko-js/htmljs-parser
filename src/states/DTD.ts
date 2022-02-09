import { CODE, StateDefinition, ValuePart } from "../internal";

// We enter STATE.DTD after we encounter a "<!" while in the STATE.HTML_CONTENT.
// We leave STATE.DTD if we see a ">".
export const DTD: StateDefinition<ValuePart> = {
  name: "DTD",

  enter(documentType) {
    this.endText();
    documentType.value = "";
  },

  exit(documentType) {
    this.notifiers.notifyDocumentType(documentType);
  },

  eol(str, documentType) {
    documentType.value += str;
  },

  eof(documentType) {
    this.notifyError(
      documentType,
      "MALFORMED_DOCUMENT_TYPE",
      "EOF reached while parsing document type"
    );
  },

  char(ch, code, documentType) {
    if (code === CODE.CLOSE_ANGLE_BRACKET) {
      this.exitState(">");
    } else {
      documentType.value += ch;
    }
  },
};
