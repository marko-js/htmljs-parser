import { Parser, STATE } from "../internal";

export const PLACEHOLDER = Parser.createState({
  name: "PLACEHOLDER",

  expression(expression) {
    this.currentPart.value = expression.value.slice(1, -1); // Chop off the curly braces
    this.currentPart.endPos = expression.endPos;
    this.endPlaceholder();
  },

  eol(str) {
    throw new Error("Illegal state. EOL not expected");
  },

  eof() {
    throw new Error("Illegal state. EOF not expected");
  },

  enter(oldState) {
    if (oldState !== STATE.EXPRESSION) {
      this.beginExpression();
    }
  },
});
