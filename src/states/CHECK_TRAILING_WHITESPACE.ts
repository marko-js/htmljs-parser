import { Parser, isWhitespaceCode } from "../internal";

export const CHECK_TRAILING_WHITESPACE = Parser.createState({
  name: "CHECK_TRAILING_WHITESPACE",

  enter(oldState, { handler }) {
    if (typeof handler !== "function") {
      throw new Error("Invalid handler");
    }
  },

  exit({ handler, err, eof }) {
    handler.call(this, err, eof);
  },

  eol: function () {
    this.exitState();
    this.forward = true;
  },

  eof: function (part) {
    part.eof = true;
    this.exitState();
  },

  char(ch, code, part) {
    if (isWhitespaceCode(code)) {
      // Just whitespace... we are still good
    } else {
      part.err = { ch };
      this.exitState();
    }
  },
});
