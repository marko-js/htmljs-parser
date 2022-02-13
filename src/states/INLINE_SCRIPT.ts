import { CODE, Part, STATE, StateDefinition } from "../internal";

export interface InlineScriptPart extends Part {
  value: Part;
  block: boolean;
}

export const INLINE_SCRIPT: StateDefinition<InlineScriptPart> = {
  name: "INLINE_SCRIPT",

  enter(inlineScript) {
    inlineScript.block = false;
  },

  exit(inlineScript) {
    this.notifiers.notifyScriptlet({
      pos: inlineScript.pos,
      endPos: inlineScript.endPos,
      block: inlineScript.block,
      value: {
        pos: inlineScript.value.pos,
        endPos: inlineScript.value.endPos,
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
