import { CODE, StateDefinition } from "../internal";

// We enter STATE.DTD after we encounter a "<!" while in the STATE.HTML_CONTENT.
// We leave STATE.DTD if we see a ">".
export const DTD: StateDefinition = {
  name: "DTD",

  enter(parent, start) {
    this.endText();
    return {
      state: DTD,
      parent,
      start,
      end: start,
    };
  },

  exit(documentType) {
    this.options.onDoctype?.({
      start: documentType.start,
      end: documentType.end,
      value: {
        start: documentType.start + 2, // strip <!
        end: documentType.end - 1, // strip >
      },
    });
  },

  char(code) {
    if (code === CODE.CLOSE_ANGLE_BRACKET) {
      this.pos++; // skip >
      this.exitState();
    }
  },

  eol() {},

  eof(documentType) {
    this.emitError(
      documentType,
      "MALFORMED_DOCUMENT_TYPE",
      "EOF reached while parsing document type"
    );
  },

  return() {},
};
