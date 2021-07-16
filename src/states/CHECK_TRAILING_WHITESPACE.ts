import { Parser, isWhitespaceCode } from "../internal";

export const CHECK_TRAILING_WHITESPACE = Parser.createState({
  name: "CHECK_TRAILING_WHITESPACE",

  eol: function () {
    this.endCheckTrailingWhitespace(null /* no error */, false /* not EOF */);
  },

  eof: function () {
    this.endCheckTrailingWhitespace(null /* no error */, true /* EOF */);
  },

  char(ch, code) {
    if (isWhitespaceCode(code)) {
      // Just whitespace... we are still good
    } else {
      debugger;
      this.endCheckTrailingWhitespace(
        {
          ch: ch,
        },
        false
      );
    }
  },
});
