import { CODE, Range, STATE, StateDefinition } from "../internal";

interface ScriptletMeta extends Range {
  block: boolean;
  value: Range;
}
export const INLINE_SCRIPT: StateDefinition<ScriptletMeta> = {
  name: "INLINE_SCRIPT",

  enter(inlineScript) {
    inlineScript.block = false;
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
      this.enterState(STATE.EXPRESSION, {
        terminator: "}",
        skipOperators: true,
      });
      this.rewind(1);
    } else {
      this.enterState(STATE.EXPRESSION, { terminatedByEOL: true });
      this.rewind(1);
    }
  },

  return(_, childPart, inlineScript) {
    if (inlineScript.block) this.skip(1); // skip }
    inlineScript.value = childPart;
    this.exitState();
  },
};
