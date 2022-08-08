import {
  CODE,
  Range,
  STATE,
  StateDefinition,
  Meta,
  matchesCloseCurlyBrace,
} from "../internal";

interface ScriptletMeta extends Meta {
  block: boolean;
  value: Range;
}
export const INLINE_SCRIPT: StateDefinition<ScriptletMeta> = {
  name: "INLINE_SCRIPT",

  enter(parent, start) {
    this.endText();
    return {
      state: INLINE_SCRIPT as StateDefinition,
      parent,
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
    this.options.onScriptlet?.({
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
    this.forward = 0;

    if (code === CODE.OPEN_CURLY_BRACE) {
      inlineScript.block = true;
      this.pos++; // skip {
      const expr = this.enterState(STATE.EXPRESSION);
      expr.shouldTerminate = matchesCloseCurlyBrace;
      expr.skipOperators = true;
    } else {
      const expr = this.enterState(STATE.EXPRESSION);
      expr.terminatedByEOL = true;
    }
  },

  return(child, inlineScript) {
    if (inlineScript.block) this.pos++; // skip }
    inlineScript.value.start = child.start;
    inlineScript.value.end = child.end;
    this.exitState();
  },
};
