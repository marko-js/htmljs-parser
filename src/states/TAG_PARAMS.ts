import { Parser, STATE } from "../internal";

export const TAG_PARAMS = Parser.createState({
  name: "TAG_PARAMS",

  enter(oldState) {
    if (oldState !== STATE.EXPRESSION) {
      this.enterState(STATE.EXPRESSION);
    }
  },

  return(childState, childPart) {
    switch (childState) {
      case STATE.EXPRESSION: {
        const expression = childPart;
        var value = expression.value;
        expression.value = value.slice(1);
        expression.pos += 1;
        this.currentOpenTag.params = expression;
        this.enterState(STATE.WITHIN_OPEN_TAG);
        break;
      }
    }
  },

  eol: Parser.prototype.openTagEOL,

  eof: Parser.prototype.openTagEOF,

  char(ch, code) {
    throw new Error("Illegal state");
  },
});
