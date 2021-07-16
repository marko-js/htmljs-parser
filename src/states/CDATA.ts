import { Parser, CODE } from "../internal";

// We enter STATE.CDATA after we see "<![CDATA["
export const CDATA = Parser.createState({
  name: "CDATA",

  enter() {
    this.textParseMode = "cdata";
  },

  eof() {
    this.notifyError(
      this.currentPart.pos,
      "MALFORMED_CDATA",
      "EOF reached while parsing CDATA"
    );
  },

  char(ch, code) {
    if (code === CODE.CLOSE_SQUARE_BRACKET) {
      var match = this.lookAheadFor("]>");
      if (match) {
        this.endCDATA();
        this.skip(match.length);
        return;
      }
    }

    this.currentPart.value += ch;
  },
});
