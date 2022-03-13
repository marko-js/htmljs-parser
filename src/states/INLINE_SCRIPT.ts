import { CODE, Range, STATE, StateDefinition } from "../internal";

interface ScriptletMeta extends Range {
  block: boolean;
  value: Range;
}
export const INLINE_SCRIPT: StateDefinition<ScriptletMeta> = {
  name: "INLINE_SCRIPT",

  enter(start) {
    this.endText();
    return {
      start,
      end: start,
      block: false,
      value: {
        start,
        end: start,
      },
    };
  },

  exit(inlineScript) {
    this.handlers.onScriptlet?.({
      start: inlineScript.start,
      end: inlineScript.end,
      block: inlineScript.block,
      value: {
        start: inlineScript.value.start,
        end: inlineScript.value.end,
      },
    });
  },

  eol() {},
  eof() {},

  char(code, inlineScript) {
    if (code === CODE.OPEN_CURLY_BRACE) {
      inlineScript.block = true;
      this.skip(1); // skip {
      const expr = this.enterState(STATE.EXPRESSION);
      expr.terminator = "}";
      expr.skipOperators = true;
      this.rewind(1);
    } else {
      const expr = this.enterState(STATE.EXPRESSION);
      expr.terminatedByEOL = true;
      this.rewind(1);
    }
  },

  return(_, childPart, inlineScript) {
    if (inlineScript.block) this.skip(1); // skip }
    inlineScript.value.start = childPart.start;
    inlineScript.value.end = childPart.end;
    this.exitState();
  },
};
