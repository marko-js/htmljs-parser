import { Parser, CODE, STATE, isWhitespaceCode } from "../internal";

export const EXPRESSION = Parser.createState({
  name: "EXPRESSION",

  // { endAfterGroup }
  enter(oldState, expression) {
    expression.value = "";
    expression.groupStack = [];
    expression.endAfterGroup = expression.endAfterGroup === true;
    expression.isStringLiteral = null;
  },

  exit(expression) {
    // TODO: Probably shouldn't do this, but it makes it easier to test!
    if (
      expression.parentState === STATE.ATTRIBUTE &&
      expression.hasUnenclosedWhitespace
    ) {
      expression.value = "(" + expression.value + ")";
    }
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

      if (parentState === STATE.ATTRIBUTE && !this.currentAttribute.name) {
        return this.notifyError(
          expression.pos,
          "MALFORMED_OPEN_TAG",
          'EOF reached while parsing attribute name for the "' +
            this.currentOpenTag.tagName +
            '" tag'
        );
      } else if (parentState === STATE.ATTRIBUTE) {
        return this.notifyError(
          expression.pos,
          "MALFORMED_OPEN_TAG",
          'EOF reached while parsing attribute value for the "' +
            this.currentAttribute.name +
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
        if (expression.value === "") {
          expression.isStringLiteral = childPart.isStringLiteral === true;
        } else {
          // More than one strings means it is for sure not a string literal...
          expression.isStringLiteral = false;
        }

        expression.value += childPart.value;
        break;
      }
      case STATE.TEMPLATE_STRING:
      case STATE.REGULAR_EXPRESSION: {
        expression.isStringLiteral = false;
        expression.value += childPart.value;
        break;
      }
      case STATE.JS_COMMENT_LINE:
      case STATE.JS_COMMENT_BLOCK: {
        expression.isStringLiteral = false;
        expression.value += childPart.rawValue;
        break;
      }
    }
  },

  char(ch, code, expression) {
    let depth = expression.groupStack.length;
    let parentState = expression.parentState;

    if (depth === 0) {
      if (expression.terminatedByWhitespace && isWhitespaceCode(code)) {
        var operator = this.checkForOperator();

        if (operator) {
          expression.isStringLiteral = false;
          expression.hasUnenclosedWhitespace = true;
          expression.value += operator;
          return;
        } else {
          this.exitState();
          return;
        }
      } else if (
        expression.terminator &&
          this.checkForTerminator(expression.terminator, ch)
      ) {
        this.exitState();
        return;
      } else if (expression.allowEscapes && code === CODE.BACK_SLASH) {
        // TODO: this is kinda stupid
        expression.isStringLiteral = false;
        expression.value += this.src[this.pos+1];
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
      // Check next character to see if we are in a comment
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
      if (depth === 0 && code === CODE.OPEN_PAREN) {
        expression.lastLeftParenPos = expression.value.length;
      }

      expression.groupStack.push(code);
      expression.isStringLiteral = false;
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

    // If we got here then we didn't find a string part so we know
    // the current expression is not a string literal
    expression.isStringLiteral = false;
    expression.value += ch;
  },
});
