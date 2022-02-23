import { CODE, Events, Parser, StateDefinition } from "../internal";

// We enter STATE.CDATA after we see "<![CDATA["
export const CDATA: StateDefinition = {
  name: "CDATA",

  enter() {
    this.textParseMode = "cdata";
  },

  exit(cdata) {
    this.emit({
      type: Events.Types.CDATA,
      start: cdata.start,
      end: cdata.end,
      value: {
        start: cdata.start + 9, // strip <![CDATA[
        end: cdata.end - 3, // strip ]]>
      },
    });
  },

  eof(cdata) {
    this.emitError(cdata, "MALFORMED_CDATA", "EOF reached while parsing CDATA");
  },

  char(code) {
    if (code === CODE.CLOSE_SQUARE_BRACKET && this.lookAheadFor("]>")) {
      this.skip(3); // skip ]]>
      this.exitState();
      return;
    }
  },
};

export function checkForCDATA(parser: Parser) {
  if (parser.lookAheadFor("![CDATA[")) {
    parser.endText();
    parser.enterState(CDATA);
    parser.skip(8); // skip ![CDATA[
    return true;
  }

  return false;
}
