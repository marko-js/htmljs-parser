import {
  Parser,
  STATE,
  NUMBER_REGEX,
  evaluateStringExpression,
} from "../internal";

// We enter STATE.ATTRIBUTE_VALUE when we see a "=" while in
// the ATTRIBUTE_NAME state.
export const ATTRIBUTE_VALUE = Parser.createState({
  name: "ATTRIBUTE_VALUE",

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

        if (value === "") {
          return this.notifyError(
            expression.pos,
            "ILLEGAL_ATTRIBUTE_VALUE",
            'No attribute value found after "="'
          );
        }

        if (expression.endedWithComma) {
          // consume all following whitespace,
          // including new lines (which allows attributes to
          // span multiple lines in concise mode)
          this.consumeWhitespace();
          this.currentOpenTag.requiresCommas = true;
          this.currentAttribute.endedWithComma = true;
        } else {
          this.currentOpenTag.lastAttrNoComma = true;
        }

        if (expression.hasUnenclosedWhitespace) {
          this.currentOpenTag.hasUnenclosedWhitespace = true;
        }

        this.currentAttribute.value = value;
        this.currentAttribute.pos = expression.pos;
        this.currentAttribute.endPos = expression.endPos;

        // If the expression evaluates to a literal value then add the
        // `literalValue` property to the attribute
        if (expression.isStringLiteral) {
          this.currentAttribute.literalValue = evaluateStringExpression(
            value,
            expression.pos,
            this
          );
        } else if (value === "true") {
          this.currentAttribute.literalValue = true;
        } else if (value === "false") {
          this.currentAttribute.literalValue = false;
        } else if (value === "null") {
          this.currentAttribute.literalValue = null;
        } else if (value === "undefined") {
          this.currentAttribute.literalValue = undefined;
        } else if (NUMBER_REGEX.test(value)) {
          this.currentAttribute.literalValue = Number(value);
        }

        // We encountered a whitespace character while parsing the attribute name. That
        // means the attribute name has ended and we should continue parsing within the
        // open tag
        this.endAttribute();
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
