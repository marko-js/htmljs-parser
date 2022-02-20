import { CODE, Parser, StateDefinition } from "../internal";

// We enter STATE.CDATA after we see "<![CDATA["
export const CDATA: StateDefinition = {
  name: "CDATA",

  enter() {
    this.textParseMode = "cdata";
  },

  exit(cdata) {
    this.notifiers.notifyCDATA({
      start: cdata.start,
      end: cdata.end,
      value: {
        start: cdata.start + 9, // strip <![CDATA[
        end: cdata.end - 3, // strip ]]>
      },
    });
  },

  eof(cdata) {
    this.notifyError(
      cdata,
      "MALFORMED_CDATA",
      "EOF reached while parsing CDATA"
    );
  },

  char(_, code) {
    if (code === CODE.CLOSE_SQUARE_BRACKET && this.lookAheadFor("]>")) {
      this.exitState("]]>");
      return;
    }
  },
};

export function checkForCDATA(parser: Parser) {
  if (parser.lookAheadFor("![CDATA[")) {
    parser.endText();
    parser.enterState(CDATA);
    parser.skip(8);
    return true;
  }

  return false;
}
