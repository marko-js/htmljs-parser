import { CODE, ScriptletRange, STATE, StateDefinition } from "../internal";

export const INLINE_SCRIPT: StateDefinition<ScriptletRange> = {
  name: "INLINE_SCRIPT",

  enter(inlineScript) {
    inlineScript.block = false;
  },

  exit(inlineScript) {
    this.notifiers.notifyScriptlet({
      start: inlineScript.start,
      end: inlineScript.end,
      block: inlineScript.block,
      value: {
        start: inlineScript.value.start,
        end: inlineScript.value.end,
      },
    });
  },

  return(_, childPart, inlineScript) {
    if (inlineScript.block) this.skip(1); // skip }
    inlineScript.value = childPart;
    this.exitState();
  },

  char(_, code, inlineScript) {
    if (code === CODE.OPEN_CURLY_BRACE) {
      inlineScript.block = true;
      this.skip(1);
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
};
