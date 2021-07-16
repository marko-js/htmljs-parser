import { Parser, STATE } from "../internal";

export const TAG_PARAMS = Parser.createState({
  name: "TAG_PARAMS",

  eol: Parser.prototype.openTagEOL,

  eof: Parser.prototype.openTagEOF,

  expression(expression) {
    var value = expression.value;
    expression.value = value.slice(1);
    expression.pos += 1;
    this.currentOpenTag.params = expression;
    this.enterState(STATE.WITHIN_OPEN_TAG);
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
