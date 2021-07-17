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
      expression.parentState === STATE.ATTRIBUTE_VALUE &&
      expression.hasUnenclosedWhitespace
    ) {
      expression.value = "(" + expression.value + ")";
    }
  },

  eol(str, expression) {
    let depth = expression.groupStack.length;

    if (depth === 0) {
      if (
        expression.parentState === STATE.ATTRIBUTE_NAME ||
        expression.parentState === STATE.ATTRIBUTE_VALUE
      ) {
        expression.endPos = this.pos;
        this.exitState();
        // We encountered a whitespace character while parsing the attribute name. That
        // means the attribute name has ended and we should continue parsing within the
        // open tag
        this.endAttribute();

        if (this.isConcise) {
          this.openTagEOL();
        }
        return;
      } else if (expression.parentState === STATE.TAG_NAME) {
        expression.endPos = this.pos;
        this.exitState();

        // We encountered a whitespace character while parsing the attribute name. That
        // means the attribute name has ended and we should continue parsing within the
        // open tag
        if (this.state !== STATE.WITHIN_OPEN_TAG) {
          // Make sure we transition into parsing within the open tag
          this.enterState(STATE.WITHIN_OPEN_TAG);
        }

        if (this.isConcise) {
          this.openTagEOL();
        }

        return;
      }
    }

    expression.value += str;
  },

  eof(expression) {
    if (this.isConcise && expression.groupStack.length === 0) {
      expression.endPos = this.pos;
      this.exitState();
      this.openTagEOF();
    } else {
      let parentState = expression.parentState;

      if (parentState === STATE.ATTRIBUTE_NAME) {
        return this.notifyError(
          expression.pos,
          "MALFORMED_OPEN_TAG",
          'EOF reached while parsing attribute name for the "' +
            this.currentOpenTag.tagName +
            '" tag'
        );
      } else if (parentState === STATE.ATTRIBUTE_VALUE) {
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

    if (code === CODE.SINGLE_QUOTE) {
      return this.enterState(STATE.STRING, {
        quoteChar: "'",
        quoteCharCode: CODE.SINGLE_QUOTE,
      });
    } else if (code === CODE.DOUBLE_QUOTE) {
      return this.enterState(STATE.STRING, {
        quoteChar: '"',
        quoteCharCode: CODE.DOUBLE_QUOTE,
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
        depth === 0 &&
        !this.isConcise &&
        nextCode === CODE.CLOSE_ANGLE_BRACKET
      ) {
        // Let the STATE.WITHIN_OPEN_TAG state deal with the ending tag sequence
        expression.endPos = this.pos;
        this.exitState();
        this.rewind(1);

        if (this.state !== STATE.WITHIN_OPEN_TAG) {
          // Make sure we transition into parsing within the open tag
          this.enterState(STATE.WITHIN_OPEN_TAG);
        }
        return;
      } else if (
        !/[\]})A-Z0-9.<%]/i.test(this.getPreviousNonWhitespaceChar())
      ) {
        this.enterState(STATE.REGULAR_EXPRESSION);
        return;
      }
    } else if (code === CODE.PIPE && parentState === STATE.TAG_PARAMS) {
      if (depth === 0) {
        expression.groupStack.push(code);
        expression.isStringLiteral = false;
        expression.value += ch;
        return;
      } else if (depth === 1) {
        this.exitState();
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
        if (code === CODE.CLOSE_SQUARE_BRACKET) {
          // We are ending the attribute group so end this expression and let the
          // STATE.WITHIN_OPEN_TAG state deal with the ending attribute group
          if (this.currentOpenTag.withinAttrGroup) {
            expression.endPos = this.pos + 1;
            this.exitState();
            // Let the STATE.WITHIN_OPEN_TAG state deal with the ending tag sequence
            this.rewind(1);
            if (this.state !== STATE.WITHIN_OPEN_TAG) {
              // Make sure we transition into parsing within the open tag
              this.enterState(STATE.WITHIN_OPEN_TAG);
            }
            return;
          }
        } else {
          return this.notifyError(
            expression.pos,
            "INVALID_EXPRESSION",
            'Mismatched group. A closing "' +
              ch +
              '" character was found but it is not matched with a corresponding opening character.'
          );
        }
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

      if (expression.groupStack.length === 0) {
        if (code === CODE.CLOSE_PAREN) {
          expression.lastRightParenPos = expression.value.length - 1;
          if (
            (parentState == STATE.ATTRIBUTE_NAME ||
              parentState == STATE.TAG_ARGS ||
              parentState == STATE.WITHIN_OPEN_TAG) &&
            this.lookPastWhitespaceFor("{")
          ) {
            expression.method = true;
            expression.value += this.consumeWhitespace();
            return;
          }
        }
        var endPlaceholder =
          code === CODE.CLOSE_CURLY_BRACE && parentState === STATE.PLACEHOLDER;
        var endTagArgs =
          code === CODE.CLOSE_PAREN && parentState === STATE.TAG_ARGS;
        if (endPlaceholder || endTagArgs) {
          expression.endPos = this.pos + 1;
          this.exitState();
          return;
        }
      }

      return;
    }

    if (depth === 0) {
      if (!this.isConcise) {
        if (
          code === CODE.CLOSE_ANGLE_BRACKET &&
          (parentState === STATE.TAG_NAME ||
            parentState === STATE.ATTRIBUTE_NAME ||
            parentState === STATE.ATTRIBUTE_VALUE ||
            parentState === STATE.WITHIN_OPEN_TAG)
        ) {
          expression.endPos = this.pos;
          this.exitState();
          this.endAttribute();
          // Let the STATE.WITHIN_OPEN_TAG state deal with the ending tag sequence
          this.rewind(1);
          if (this.state !== STATE.WITHIN_OPEN_TAG) {
            // Make sure we transition into parsing within the open tag
            this.enterState(STATE.WITHIN_OPEN_TAG);
          }
          return;
        }
      }

      if (code === CODE.SEMICOLON) {
        this.exitState();
        this.endAttribute();
        if (this.isConcise) {
          this.finishOpenTag();
          this.enterState(STATE.CHECK_TRAILING_WHITESPACE, {
            handler(err) {
              if (err) {
                var code = err.ch.charCodeAt(0);

                if (code === CODE.FORWARD_SLASH) {
                  if (this.lookAheadFor("/")) {
                    this.enterState(STATE.JS_COMMENT_LINE);
                    this.skip(1);
                    return;
                  } else if (this.lookAheadFor("*")) {
                    this.enterState(STATE.JS_COMMENT_BLOCK);
                    this.skip(1);
                    return;
                  }
                } else if (
                  code === CODE.OPEN_ANGLE_BRACKET &&
                  this.lookAheadFor("!--")
                ) {
                  // html comment
                  this.enterState(STATE.HTML_COMMENT);
                  this.skip(3);
                  return;
                }

                this.notifyError(
                  this.pos,
                  "INVALID_CODE_AFTER_SEMICOLON",
                  "A semicolon indicates the end of a line.  Only comments may follow it."
                );
              }
            },
          });
        }
        return;
      }

      if (code === CODE.COMMA || isWhitespaceCode(code)) {
        if (code === CODE.COMMA || this.lookPastWhitespaceFor(",")) {
          if (code !== CODE.COMMA) {
            this.consumeWhitespace();
            this.skip(1);
          }

          expression.endedWithComma = true;
        } else if (
          expression.parentState === STATE.ATTRIBUTE_NAME &&
          this.lookPastWhitespaceFor("=")
        ) {
          this.consumeWhitespace();
          return;
        } else if (parentState !== STATE.TAG_NAME) {
          var typeofExpression = this.checkForTypeofOperator();
          if (typeofExpression) {
            expression.value += typeofExpression;
            expression.isStringLiteral = false;
            expression.hasUnenclosedWhitespace = true;
            this.skip(typeofExpression.length - 1);
            return;
          }

          var operator = this.checkForOperator();

          if (operator) {
            expression.isStringLiteral = false;
            expression.hasUnenclosedWhitespace = true;
            expression.value += operator;
            return;
          }
        }

        expression.endPos = this.pos;
        this.exitState();
        this.endAttribute();
        if (this.state !== STATE.WITHIN_OPEN_TAG) {
          // Make sure we transition into parsing within the open tag
          this.enterState(STATE.WITHIN_OPEN_TAG);
        }
        return;
      } else if (code === CODE.EQUAL && parentState === STATE.ATTRIBUTE_NAME) {
        expression.endPos = this.pos;
        this.exitState();
        // We encountered "=" which means we need to start reading
        // the attribute value.
        this.enterState(STATE.ATTRIBUTE_VALUE);
        this.consumeWhitespace();
        return;
      }

      if (expression.value === "") {
        let typeofExpression = this.checkForTypeofOperatorAtStart();
        if (typeofExpression) {
          expression.value += typeofExpression;
          expression.isStringLiteral = false;
          expression.hasUnenclosedWhitespace = true;
          this.skip(typeofExpression.length - 1);
          return;
        }
      }

      if (expression.parentState === STATE.TAG_PARAMS) {
        if (code === CODE.PIPE) {
          this.exitState();
          this.rewind(1);
          this.enterState(STATE.TAG_PARAMS);
          return;
        }
      }

      if (expression.parentState === STATE.TAG_VAR) {
        if (code === CODE.EQUAL || code === CODE.CLOSE_ANGLE_BRACKET) {
          this.exitState();
          this.rewind(1);
          if (this.state !== STATE.WITHIN_OPEN_TAG) {
            // Make sure we transition into parsing within the open tag
            this.enterState(STATE.WITHIN_OPEN_TAG);
          }
          return;
        }
      }

      if (expression.parentState === STATE.TAG_NAME) {
        if (this.checkForEscapedEscapedPlaceholder(ch, code)) {
          expression.value += "\\";
          this.skip(1);
          return;
        } else if (this.checkForEscapedPlaceholder(ch, code)) {
          expression.value += "$";
          this.skip(1);
          return;
        } else if (
          code === CODE.DOLLAR &&
          this.lookAtCharCodeAhead(1) === CODE.OPEN_CURLY_BRACE
        ) {
          expression.endPos = this.pos;
          debugger;
          this.exitState();
          // We expect to start a placeholder at the first curly brace (the next character)
          this.enterState(STATE.PLACEHOLDER, {
            escape: true,
            withinTagName: true,
          });
          return;
        } else if (code === CODE.PERIOD || code === CODE.NUMBER_SIGN) {
          this.exitState();
          this.rewind(1);
          this.enterState(STATE.TAG_NAME_SHORTHAND);
          return;
        } else if (code === CODE.FORWARD_SLASH) {
          this.exitState();
          this.rewind(1);
          this.enterState(STATE.TAG_VAR);
          return;
        }
      }

      if (
        expression.parentState === STATE.TAG_NAME ||
        expression.parentState === STATE.TAG_VAR
      ) {
        if (code === CODE.PIPE) {
          this.exitState();
          this.rewind(1);
          this.enterState(STATE.TAG_PARAMS);
          return;
        } else if (code === CODE.EQUAL) {
          this.exitState();
          this.rewind(1);
          this.enterState(STATE.WITHIN_OPEN_TAG);
          return;
        } else if (
          this.lookAtCharCodeAhead(1) === CODE.OPEN_PAREN &&
          expression.value
        ) {
          expression.value += ch;
          this.exitState();
          this.enterState(STATE.TAG_ARGS);
          return;
        }
      }
    }

    // If we got here then we didn't find a string part so we know
    // the current expression is not a string literal
    expression.isStringLiteral = false;
    expression.value += ch;
  },
});
