import { Parser, CODE, STATE } from "../internal";

// We enter STATE.TAG_NAME after we encounter a "<"
// followed by a non-special character
export const TAG_NAME = Parser.createState({
  name: "TAG_NAME",

  enter(oldState) {
    if (oldState !== STATE.EXPRESSION) {
      this.enterState(STATE.EXPRESSION);
    }
  },

  return(childState, childPart) {
    switch (childState) {
      case STATE.EXPRESSION: {
        const expression = childPart;
        this.currentOpenTag.tagNameEnd = expression.endPos;

        if (expression.value) {
          this.currentOpenTag.tagName += expression.value;

          if (this.currentOpenTag.tagNameParts) {
            this.currentOpenTag.tagNameParts.push(
              JSON.stringify(expression.value)
            );
          }
        }
        break;
      }
      case STATE.PLACEHOLDER: {
        // TODO: why do we need to do this?
        this.enterState(STATE.EXPRESSION);

        const placeholder = childPart;
        if (!this.currentOpenTag.tagNameParts) {
          this.currentOpenTag.tagNameParts = [];

          if (this.currentOpenTag.tagName) {
            this.currentOpenTag.tagNameParts.push(
              JSON.stringify(this.currentOpenTag.tagName)
            );
          }
        }

        this.currentOpenTag.tagName += this.substring(
          placeholder.pos,
          placeholder.endPos
        );
        this.currentOpenTag.tagNameParts.push("(" + placeholder.value + ")");
        this.currentOpenTag.tagNameEnd = placeholder.endPos;
        var nextCode = this.lookAtCharCodeAhead(1);
        if (nextCode === CODE.OPEN_PAREN) {
          // TODO: figure out if this is needed
          this.exitState(/* STATE.EXPRESSION */);
          this.enterState(STATE.TAG_ARGS);
        }
      }
    }
  },

  eol: Parser.prototype.openTagEOL,

  eof: Parser.prototype.openTagEOF,

  char(ch, code) {
    throw new Error("Illegal state");
  },
});
