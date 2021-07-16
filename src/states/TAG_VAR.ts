import { Parser, CODE, STATE } from "../internal";

export const TAG_VAR = Parser.createState({
  name: "TAG_VAR",

  eol: Parser.prototype.openTagEOL,

  eof: Parser.prototype.openTagEOF,

  expression(expression) {
    var value = expression.value;
    expression.value = value.slice(1);
    expression.pos += 1;
    this.currentOpenTag.var = expression;
    if (this.lookAtCharCodeAhead(1) === CODE.PIPE) {
      this.enterState(STATE.TAG_PARAMS);
    } else if (this.lookAtCharCodeAhead(1) === CODE.OPEN_PAREN) {
      this.enterState(STATE.TAG_ARGS);
    } else {
      this.enterState(STATE.WITHIN_OPEN_TAG);
    }
  },

  enter(oldState) {
    if (oldState !== STATE.EXPRESSION) {
      this.beginExpression();
    }
  },

  char(ch, code) {
    throw new Error("Illegal state");
  },
});
