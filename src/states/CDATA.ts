import { Parser, CODE } from "../internal";

// We enter STATE.CDATA after we see "<![CDATA["
export const CDATA = Parser.createState({
  name: "CDATA",

  enter(oldState, cdata) {
    this.endText();
    this.textParseMode = "cdata";
    cdata.value = "";
  },

  exit(cdata) {
    this.notifiers.notifyCDATA(cdata.value, cdata.pos, this.pos);
  },

  eof(cdata) {
    this.notifyError(
      cdata.pos,
      "MALFORMED_CDATA",
      "EOF reached while parsing CDATA"
    );
  },

  char(ch, code, cdata) {
    if (code === CODE.CLOSE_SQUARE_BRACKET && this.lookAheadFor("]>")) {
      this.exitState("]]>");
      return;
    }

    cdata.value += ch;
  },
});
