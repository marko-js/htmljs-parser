import { Parser, CODE, STATE, isWhitespaceCode } from "../internal";

export const EXPRESSION = Parser.createState({
  name: "EXPRESSION",

  enter(oldState, expression) {
    expression.value = "";
    expression.groupStack = [];
    expression.allowEscapes = expression.allowEscapes === true;
    expression.skipOperators = expression.skipOperators === true;
    expression.terminatedByWhitespace = expression.terminatedByWhitespace === true;
  },

  eol(str, expression) {
    let depth = expression.groupStack.length;

    if (depth === 0 && expression.terminatedByWhitespace) {
      this.exitState();
      return;
    }

    expression.value += str;
  },

  eof(expression) {
    if (this.isConcise && expression.groupStack.length === 0) {
      this.exitState();
    } else {
      let parentState = expression.parentState;

      if (parentState === STATE.ATTRIBUTE) {
        if (!this.currentAttribute.name) {
          return this.notifyError(
            expression.pos,
            "MALFORMED_OPEN_TAG",
            'EOF reached while parsing attribute name for the "' +
              this.currentOpenTag.tagName.value +
              '" tag'
          );
        }

        return this.notifyError(
          expression.pos,
          "MALFORMED_OPEN_TAG",
          'EOF reached while parsing attribute value for the "' +
            this.currentAttribute.name.value +
            '" attribute'
        );
      } else if (parentState === STATE.TAG_NAME) {
        return this.notifyError(
          expression.pos,
          "MALFORMED_OPEN_TAG",
          "EOF reached while parsing tag name"
        );
      } else if (parentState === STATE.PLACEHOLDER) {
        return this.notifyError(
          expression.pos,
          "MALFORMED_PLACEHOLDER",
          "EOF reached while parsing placeholder"
        );
      }

      return this.notifyError(
        expression.pos,
        "INVALID_EXPRESSION",
        "EOF reached while parsing expression"
      );
    }
  },

  return(childState, childPart, expression) {
    switch (childState) {
      case STATE.STRING: {
        expression.value += childPart.value;
        break;
      }
      case STATE.TEMPLATE_STRING:
      case STATE.REGULAR_EXPRESSION: {
        expression.value += childPart.value;
        break;
      }
      case STATE.JS_COMMENT_LINE:
      case STATE.JS_COMMENT_BLOCK: {
        expression.value += childPart.value;
        break;
      }
    }
  },

  char(ch, code, expression) {
    let depth = expression.groupStack.length;

    if (depth === 0) {
      if (expression.terminatedByWhitespace && isWhitespaceCode(code)) {
        var operator = !expression.skipOperators && this.checkForOperator();

        if (operator) {
          expression.value += operator;
        } else {
          this.exitState();
        }

        return;
      }
      
      if (expression.terminator && this.checkForTerminator(expression.terminator, ch)) {
        this.exitState();
        return;
      }
      
      if (expression.allowEscapes && code === CODE.BACK_SLASH) {
        expression.value += this.lookAtCharAhead(1);
        this.skip(1);
        return;
      }
    }

    if (code === CODE.SINGLE_QUOTE || code === CODE.DOUBLE_QUOTE) {
      return this.enterState(STATE.STRING, {
        quoteChar: ch,
        quoteCharCode: code,
      });
    } else if (code === CODE.BACKTICK) {
      return this.enterState(STATE.TEMPLATE_STRING);
    } else if (code === CODE.FORWARD_SLASH) {
      // Check next character to see if we are in a comment or regexp
      var nextCode = this.lookAtCharCodeAhead(1);
      if (nextCode === CODE.FORWARD_SLASH) {
        this.enterState(STATE.JS_COMMENT_LINE);
        this.skip(1);
        return;
      } else if (nextCode === CODE.ASTERISK) {
        this.enterState(STATE.JS_COMMENT_BLOCK);
        this.skip(1);
        return;
      } else if (
        !/[\]})A-Z0-9.<%]/i.test(this.getPreviousNonWhitespaceChar())
      ) {
        this.enterState(STATE.REGULAR_EXPRESSION);
        return;
      }
    } else if (
      code === CODE.OPEN_PAREN ||
      code === CODE.OPEN_SQUARE_BRACKET ||
      code === CODE.OPEN_CURLY_BRACE
    ) {
      expression.groupStack.push(code);
      expression.value += ch;
      return;
    } else if (
      code === CODE.CLOSE_PAREN ||
      code === CODE.CLOSE_SQUARE_BRACKET ||
      code === CODE.CLOSE_CURLY_BRACE
    ) {
      if (depth === 0) {
        return this.notifyError(
          expression.pos,
          "INVALID_EXPRESSION",
          'Mismatched group. A closing "' +
            ch +
            '" character was found but it is not matched with a corresponding opening character.'
        );
      }

      let matchingGroupCharCode = expression.groupStack.pop();

      if (
        (code === CODE.CLOSE_PAREN &&
          matchingGroupCharCode !== CODE.OPEN_PAREN) ||
        (code === CODE.CLOSE_SQUARE_BRACKET &&
          matchingGroupCharCode !== CODE.OPEN_SQUARE_BRACKET) ||
        (code === CODE.CLOSE_CURLY_BRACE &&
          matchingGroupCharCode !== CODE.OPEN_CURLY_BRACE)
      ) {
        return this.notifyError(
          expression.pos,
          "INVALID_EXPRESSION",
          'Mismatched group. A "' +
            ch +
            '" character was found when "' +
            String.fromCharCode(matchingGroupCharCode) +
            '" was expected.'
        );
      }

      expression.value += ch;
      return;
    }

    expression.value += ch;
  },
});
