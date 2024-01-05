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

  char(code, str) {
    if (code === str.quoteCharCode) {
      this.startText();
      this.pos++; // skip end quote
      this.exitState();
    } else if (!STATE.checkForPlaceholder(this, code)) {
      this.startText();
    }
  },

  eof(str) {
    this.emitError(
      str,
      ErrorCode.INVALID_TEMPLATE_STRING,
      "EOF reached while parsing string expression",
    );
  },

  eol() {},

  return() {},
};
