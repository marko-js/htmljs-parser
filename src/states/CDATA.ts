import { Parser, type StateDefinition } from "../internal.ts";
import * as ErrorCode from "../util/error-code.ts";

// We enter STATE.CDATA after we see "<![CDATA["
export const CDATA: StateDefinition = {
  name: "CDATA",

  enter(parent, start) {
    return {
      state: CDATA,
      parent,
      start,
      end: start,
    };
  },

  exit(cdata) {
    this.options.onCDATA?.({
      start: cdata.start,
      end: cdata.end,
      value: {
        start: cdata.start + 9, // strip <![CDATA[
        end: cdata.end - 3, // strip ]]>
      },
    });
  },

  parse(data, _maxPos, cdata) {
    const idx = data.indexOf("]]>", this.pos);
    if (idx === -1) {
      return this.emitError(
        cdata,
        ErrorCode.MALFORMED_CDATA,
        "EOF reached while parsing CDATA",
      );
    }

    this.pos = idx + 3; // skip ]]>
    this.exitState();
  },

  /* node:coverage ignore next */ // never has child states
  return() {},
};

export function checkForCDATA(parser: Parser) {
  if (parser.lookAheadFor("![CDATA[")) {
    parser.endText();
    parser.enterState(CDATA);
    parser.pos += 9; // skip <![CDATA[
    return true;
  }

  return false;
}
