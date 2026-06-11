import { ErrorCode, type StateDefinition } from "../internal";

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

  parse(data, maxPos, documentType) {
    const idx = data.indexOf(">", this.pos);
    if (idx === -1) {
      return this.emitError(
        documentType,
        ErrorCode.MALFORMED_DOCUMENT_TYPE,
        "EOF reached while parsing document type",
      );
    }

    this.pos = idx + 1; // skip >
    this.exitState();
  },

  return() {},
};
