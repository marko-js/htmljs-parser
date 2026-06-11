import {
  CODE,
  ErrorCode,
  STATE,
  type StateDefinition,
  type Meta,
} from "../internal";

interface ParsedStringMeta extends Meta {
  quoteCharCode: number;
}

export const PARSED_STRING: StateDefinition<ParsedStringMeta> = {
  name: "PARSED_STRING",

  enter(parent, start) {
    return {
      state: PARSED_STRING,
      parent,
      start,
      end: start,
      quoteCharCode: CODE.DOUBLE_QUOTE,
    } as ParsedStringMeta;
  },

  exit() {},

  parse(data, maxPos, str) {
    while (this.pos < maxPos) {
      const code = data.charCodeAt(this.pos);
      if (code === str.quoteCharCode) {
        this.startText();
        this.pos++; // skip end quote
        this.exitState();
        return;
      } else if (
        (code === CODE.DOLLAR || code === CODE.BACK_SLASH) &&
        STATE.checkForPlaceholder(this, code)
      ) {
        return;
      } else {
        this.startText();
        // Eagerly consume the run of chars that cannot match a branch above.
        let next: number;
        do {
          this.pos++;
        } while (
          this.pos < maxPos &&
          (next = data.charCodeAt(this.pos)) !== str.quoteCharCode &&
          next !== CODE.DOLLAR &&
          next !== CODE.BACK_SLASH
        );
      }
    }
    this.emitError(
      str,
      ErrorCode.INVALID_TEMPLATE_STRING,
      "EOF reached while parsing string expression",
    );
  },

  return() {},
};
