import { Parser, CODE, STATE } from "../internal";

// We enter STATE.TAG_NAME after we encounter a "<"
// followed by a non-special character
export const TAG_NAME = Parser.createState({
  name: "TAG_NAME",

  eol: Parser.prototype.openTagEOL,

  eof: Parser.prototype.openTagEOF,

  expression(expression) {
    this.currentOpenTag.tagNameEnd = expression.endPos;

    if (expression.value) {
      this.currentOpenTag.tagName += expression.value;

      if (this.currentOpenTag.tagNameParts) {
        this.currentOpenTag.tagNameParts.push(JSON.stringify(expression.value));
      }
    }
  },

  placeholder(placeholder) {
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
      this.endExpression();
      this.enterState(STATE.TAG_ARGS);
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
