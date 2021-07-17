import { Parser, CODE, STATE } from "../internal";

export const TAG_ARGS = Parser.createState({
  name: "TAG_ARGS",

  enter(oldState) {
    if (oldState !== STATE.EXPRESSION) {
      this.enterState(STATE.EXPRESSION);
    }
  },

  eol: Parser.prototype.openTagEOL,

  eof: Parser.prototype.openTagEOF,

  return(childState, childPart) {
    switch (childState) {
      case STATE.EXPRESSION: {
        const expression = childPart;
        var method = this.getAndRemoveMethod(expression);
        if (method) {
          this.beginAttribute();
          this.currentAttribute.name = "default";
          this.currentAttribute.default = true;
          this.currentAttribute.method = true;
          this.currentAttribute.value = method.value;
          this.currentAttribute.pos = method.pos;
          this.currentAttribute.endPos = method.endPos;
          this.endAttribute();
          if (STATE.WITHIN_OPEN_TAG !== this.state) {
            this.enterState(STATE.WITHIN_OPEN_TAG);
          }
        } else {
          var value = expression.value;
          if (value.charCodeAt(value.length - 1) !== CODE.CLOSE_PAREN) {
            throw new Error("Invalid argument");
          }
          expression.value = value.slice(1, value.length - 1);
          expression.pos += 1;
          expression.endPos -= 1;
          this.currentOpenTag.argument = expression;

          if (this.lookAtCharCodeAhead(1) === CODE.PIPE) {
            this.enterState(STATE.TAG_PARAMS);
          } else {
            this.enterState(STATE.WITHIN_OPEN_TAG);
          }
        }
        break;
      }
    }
  },

  char(ch, code) {
    throw new Error("Illegal state");
  },
});
