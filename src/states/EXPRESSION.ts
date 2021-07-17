import { Parser, CODE, STATE, isWhitespaceCode } from "../internal";

export const EXPRESSION = Parser.createState({
  name: "EXPRESSION",

  eol(str) {
    let depth = this.currentPart.groupStack.length;

    if (depth === 0) {
      if (
        this.currentPart.parentState === STATE.ATTRIBUTE_NAME ||
        this.currentPart.parentState === STATE.ATTRIBUTE_VALUE
      ) {
        this.currentPart.endPos = this.pos;
        this.endExpression();
        // We encountered a whitespace character while parsing the attribute name. That
        // means the attribute name has ended and we should continue parsing within the
        // open tag
        this.endAttribute();

        if (this.isConcise) {
          this.openTagEOL();
        }
        return;
      } else if (this.currentPart.parentState === STATE.TAG_NAME) {
        this.currentPart.endPos = this.pos;
        this.endExpression();

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

    this.currentPart.value += str;
  },

  eof() {
    if (this.isConcise && this.currentPart.groupStack.length === 0) {
      this.currentPart.endPos = this.pos;
      this.endExpression();
      this.openTagEOF();
    } else {
      let parentState = this.currentPart.parentState;

      if (parentState === STATE.ATTRIBUTE_NAME) {
        return this.notifyError(
          this.currentPart.pos,
          "MALFORMED_OPEN_TAG",
          'EOF reached while parsing attribute name for the "' +
            this.currentOpenTag.tagName +
            '" tag'
        );
      } else if (parentState === STATE.ATTRIBUTE_VALUE) {
        return this.notifyError(
          this.currentPart.pos,
          "MALFORMED_OPEN_TAG",
          'EOF reached while parsing attribute value for the "' +
            this.currentAttribute.name +
            '" attribute'
        );
      } else if (parentState === STATE.TAG_NAME) {
        return this.notifyError(
          this.currentPart.pos,
          "MALFORMED_OPEN_TAG",
          "EOF reached while parsing tag name"
        );
      } else if (parentState === STATE.PLACEHOLDER) {
        return this.notifyError(
          this.currentPart.pos,
          "MALFORMED_PLACEHOLDER",
          "EOF reached while parsing placeholder"
        );
      }

      return this.notifyError(
        this.currentPart.pos,
        "INVALID_EXPRESSION",
        "EOF reached while parsing expression"
      );
    }
  },

  string(string) {
    if (this.currentPart.value === "") {
      this.currentPart.isStringLiteral = string.isStringLiteral === true;
    } else {
      // More than one strings means it is for sure not a string literal...
      this.currentPart.isStringLiteral = false;
    }

    this.currentPart.value += string.value;
  },

  templateString(templateString) {
    this.currentPart.isStringLiteral = false;
    this.currentPart.value += templateString.value;
  },

  return(childState, childPart) {
    switch (childState) {
      case STATE.REGULAR_EXPRESSION: {
        this.currentPart.isStringLiteral = false;
        this.currentPart.value += childPart.value;
        break;
      }
      case STATE.JS_COMMENT_LINE:
      case STATE.JS_COMMENT_BLOCK: {
        this.currentPart.isStringLiteral = false;
        this.currentPart.value += childPart.rawValue;
        break;
      }
    }
  },

  char(ch, code) {
    let depth = this.currentPart.groupStack.length;
    let parentState = this.currentPart.parentState;

    if (code === CODE.SINGLE_QUOTE) {
      return this.beginString("'", CODE.SINGLE_QUOTE);
    } else if (code === CODE.DOUBLE_QUOTE) {
      return this.beginString('"', CODE.DOUBLE_QUOTE);
    } else if (code === CODE.BACKTICK) {
      return this.beginTemplateString();
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
        this.currentPart.endPos = this.pos;
        this.endExpression();
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
        this.currentPart.groupStack.push(code);
        this.currentPart.isStringLiteral = false;
        this.currentPart.value += ch;
        return;
      } else if (depth === 1) {
        this.endExpression();
        return;
      }
    } else if (
      code === CODE.OPEN_PAREN ||
      code === CODE.OPEN_SQUARE_BRACKET ||
      code === CODE.OPEN_CURLY_BRACE
    ) {
      if (depth === 0 && code === CODE.OPEN_PAREN) {
        this.currentPart.lastLeftParenPos = this.currentPart.value.length;
      }

      this.currentPart.groupStack.push(code);
      this.currentPart.isStringLiteral = false;
      this.currentPart.value += ch;
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
            this.currentPart.endPos = this.pos + 1;
            this.endExpression();
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
            this.currentPart.pos,
            "INVALID_EXPRESSION",
            'Mismatched group. A closing "' +
              ch +
              '" character was found but it is not matched with a corresponding opening character.'
          );
        }
      }

      let matchingGroupCharCode = this.currentPart.groupStack.pop();

      if (
        (code === CODE.CLOSE_PAREN &&
          matchingGroupCharCode !== CODE.OPEN_PAREN) ||
        (code === CODE.CLOSE_SQUARE_BRACKET &&
          matchingGroupCharCode !== CODE.OPEN_SQUARE_BRACKET) ||
        (code === CODE.CLOSE_CURLY_BRACE &&
          matchingGroupCharCode !== CODE.OPEN_CURLY_BRACE)
      ) {
        return this.notifyError(
          this.currentPart.pos,
          "INVALID_EXPRESSION",
          'Mismatched group. A "' +
            ch +
            '" character was found when "' +
            String.fromCharCode(matchingGroupCharCode) +
            '" was expected.'
        );
      }

      this.currentPart.value += ch;

      if (this.currentPart.groupStack.length === 0) {
        if (code === CODE.CLOSE_PAREN) {
          this.currentPart.lastRightParenPos =
            this.currentPart.value.length - 1;
          if (
            (parentState == STATE.ATTRIBUTE_NAME ||
              parentState == STATE.TAG_ARGS ||
              parentState == STATE.WITHIN_OPEN_TAG) &&
            this.lookPastWhitespaceFor("{")
          ) {
            this.currentPart.method = true;
            this.currentPart.value += this.consumeWhitespace();
            return;
          }
        }
        var endPlaceholder =
          code === CODE.CLOSE_CURLY_BRACE && parentState === STATE.PLACEHOLDER;
        var endTagArgs =
          code === CODE.CLOSE_PAREN && parentState === STATE.TAG_ARGS;
        if (endPlaceholder || endTagArgs) {
          this.currentPart.endPos = this.pos + 1;
          this.endExpression();
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
          this.currentPart.endPos = this.pos;
          this.endExpression();
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
        this.endExpression();
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
                  this.beginHtmlComment();
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

          this.currentPart.endedWithComma = true;
        } else if (
          this.currentPart.parentState === STATE.ATTRIBUTE_NAME &&
          this.lookPastWhitespaceFor("=")
        ) {
          this.consumeWhitespace();
          return;
        } else if (parentState !== STATE.TAG_NAME) {
          var typeofExpression = this.checkForTypeofOperator();
          if (typeofExpression) {
            this.currentPart.value += typeofExpression;
            this.currentPart.isStringLiteral = false;
            this.currentPart.hasUnenclosedWhitespace = true;
            this.skip(typeofExpression.length - 1);
            return;
          }

          var operator = this.checkForOperator();

          if (operator) {
            this.currentPart.isStringLiteral = false;
            this.currentPart.hasUnenclosedWhitespace = true;
            this.currentPart.value += operator;
            return;
          }
        }

        this.currentPart.endPos = this.pos;
        this.endExpression();
        this.endAttribute();
        if (this.state !== STATE.WITHIN_OPEN_TAG) {
          // Make sure we transition into parsing within the open tag
          this.enterState(STATE.WITHIN_OPEN_TAG);
        }
        return;
      } else if (code === CODE.EQUAL && parentState === STATE.ATTRIBUTE_NAME) {
        this.currentPart.endPos = this.pos;
        this.endExpression();
        // We encountered "=" which means we need to start reading
        // the attribute value.
        this.enterState(STATE.ATTRIBUTE_VALUE);
        this.consumeWhitespace();
        return;
      }

      if (this.currentPart.value === "") {
        let typeofExpression = this.checkForTypeofOperatorAtStart();
        if (typeofExpression) {
          this.currentPart.value += typeofExpression;
          this.currentPart.isStringLiteral = false;
          this.currentPart.hasUnenclosedWhitespace = true;
          this.skip(typeofExpression.length - 1);
          return;
        }
      }

      if (this.currentPart.parentState === STATE.TAG_PARAMS) {
        if (code === CODE.PIPE) {
          this.endExpression();
          this.rewind(1);
          this.enterState(STATE.TAG_PARAMS);
          return;
        }
      }

      if (this.currentPart.parentState === STATE.TAG_VAR) {
        if (code === CODE.EQUAL || code === CODE.CLOSE_ANGLE_BRACKET) {
          this.endExpression();
          this.rewind(1);
          if (this.state !== STATE.WITHIN_OPEN_TAG) {
            // Make sure we transition into parsing within the open tag
            this.enterState(STATE.WITHIN_OPEN_TAG);
          }
          return;
        }
      }

      if (this.currentPart.parentState === STATE.TAG_NAME) {
        if (this.checkForEscapedEscapedPlaceholder(ch, code)) {
          this.currentPart.value += "\\";
          this.skip(1);
          return;
        } else if (this.checkForEscapedPlaceholder(ch, code)) {
          this.currentPart.value += "$";
          this.skip(1);
          return;
        } else if (
          code === CODE.DOLLAR &&
          this.lookAtCharCodeAhead(1) === CODE.OPEN_CURLY_BRACE
        ) {
          this.currentPart.endPos = this.pos;
          this.endExpression();
          // We expect to start a placeholder at the first curly brace (the next character)
          this.beginPlaceholder(true, true /* tag name */);
          return;
        } else if (code === CODE.PERIOD || code === CODE.NUMBER_SIGN) {
          this.endExpression();
          this.rewind(1);
          this.beginTagNameShorthand();
          return;
        } else if (code === CODE.FORWARD_SLASH) {
          this.endExpression();
          this.rewind(1);
          this.enterState(STATE.TAG_VAR);
          return;
        }
      }

      if (
        this.currentPart.parentState === STATE.TAG_NAME ||
        this.currentPart.parentState === STATE.TAG_VAR
      ) {
        if (code === CODE.PIPE) {
          this.endExpression();
          this.rewind(1);
          this.enterState(STATE.TAG_PARAMS);
          return;
        } else if (code === CODE.EQUAL) {
          this.endExpression();
          this.rewind(1);
          this.enterState(STATE.WITHIN_OPEN_TAG);
          return;
        } else if (
          this.lookAtCharCodeAhead(1) === CODE.OPEN_PAREN &&
          this.currentPart.value
        ) {
          this.currentPart.value += ch;
          this.endExpression();
          this.enterState(STATE.TAG_ARGS);
          return;
        }
      }
    }

    // If we got here then we didn't find a string part so we know
    // the current expression is not a string literal
    this.currentPart.isStringLiteral = false;
    this.currentPart.value += ch;
  },
});
