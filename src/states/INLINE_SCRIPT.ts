import { CODE, Part, STATE, StateDefinition } from "../internal";

export interface InlineScriptPart extends Part {
  value: string;
  block: boolean;
}

export const INLINE_SCRIPT: StateDefinition<InlineScriptPart> = {
  name: "INLINE_SCRIPT",

  enter(inlineScript) {
    this.endText();
    inlineScript.value = "";
    inlineScript.block = false;
  },

  exit(inlineScript) {
    this.notifiers.notifyScriptlet(inlineScript);
  },

  return(_, childPart, inlineScript) {
    inlineScript.value += (childPart as STATE.ExpressionPart).value;
    if (inlineScript.block) this.skip(1);
    this.exitState();
  },

  char(_, code, inlineScript) {
    if (code === CODE.OPEN_CURLY_BRACE) {
      inlineScript.block = true;
      inlineScript.value += this.consumeWhitespace();
      this.enterState(STATE.EXPRESSION, {
        terminator: "}",
        skipOperators: true,
      });
    } else {
      this.rewind(1);
      this.enterState(STATE.EXPRESSION, { terminatedByEOL: true });
    }
  },
};
