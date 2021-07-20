import { Parser, CODE, STATE, isWhitespaceCode, peek } from "../internal";

// We enter STATE.WITHIN_OPEN_TAG after we have fully
// read in the tag name and encountered a whitespace character
export const WITHIN_OPEN_TAG = Parser.createState({
  name: "WITHIN_OPEN_TAG",

  enter() {
    if (!this.currentOpenTag.notifiedOpenTagName) {
      this.currentOpenTag.notifiedOpenTagName = true;
      this.currentOpenTag.tagNameEndPos = this.pos;
      this.notifiers.notifyOpenTagName(this.currentOpenTag);
    }
  },

  return(childState, childPart) {
    switch (childState) {
      case STATE.JS_COMMENT_BLOCK: {
        /* Ignore comments within an open tag */
        break;
      }
      case STATE.PLACEHOLDER: {
        this.enterState(STATE.ATTRIBUTE)
        this.currentAttribute.value = childPart.value;
        this.exitState();

        this.enterState(STATE.AFTER_PLACEHOLDER_WITHIN_TAG);
        break;
      }
      case STATE.EXPRESSION: {
        const expression = childPart;
        var argument = this.getAndRemoveArgument(expression);
        var method = this.getAndRemoveMethod(expression);

        if (method) {
          let targetAttribute;
          if (this.currentOpenTag.attributes.length === 0) {
            this.enterState(STATE.ATTRIBUTE)
            this.currentAttribute.name = "default";
            this.currentAttribute.default = true;
          }
          targetAttribute = this.currentAttribute || peek(this.currentOpenTag.attributes);
          targetAttribute.method = true;
          targetAttribute.value = method.value;
          targetAttribute.pos = method.pos;
          targetAttribute.endPos = method.endPos;
        } else if (argument) {
          // We found an argument... the argument could be for an attribute or the tag
          if (this.currentOpenTag.attributes.length === 0) {
            if (this.currentOpenTag.argument != null) {
              this.notifyError(
                expression.endPos,
                "ILLEGAL_TAG_ARGUMENT",
                "A tag can only have one argument"
              );
              return;
            }
            this.currentOpenTag.argument = argument;
          } else {
            let targetAttribute =
              this.currentAttribute || peek(this.currentOpenTag.attributes);

            if (targetAttribute.argument != null) {
              this.notifyError(
                expression.endPos,
                "ILLEGAL_ATTRIBUTE_ARGUMENT",
                "An attribute can only have one argument"
              );
              return;
            }
            targetAttribute.argument = argument;
          }
        }
        break;
      }
    }
  },

  eol: Parser.prototype.openTagEOL,

  eof: Parser.prototype.openTagEOF,

  char(ch, code) {
    if (this.isConcise) {
      if (code === CODE.SEMICOLON) {
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
        return;
      }

      if (code === CODE.HTML_BLOCK_DELIMITER) {
        if (this.lookAtCharCodeAhead(1) !== CODE.HTML_BLOCK_DELIMITER) {
          if (this.legacyCompatibility) {
            this.outputDeprecationWarning(
              'The usage of a single hyphen in a concise line is now deprecated. Use "--" instead.\nSee: https://github.com/marko-js/htmljs-parser/issues/43'
            );
          } else {
            this.notifyError(
              this.currentOpenTag.pos,
              "MALFORMED_OPEN_TAG",
              '"-" not allowed as first character of attribute name'
            );
            return;
          }
        }

        if (this.currentOpenTag.withinAttrGroup) {
          this.notifyError(
            this.pos,
            "MALFORMED_OPEN_TAG",
            "Attribute group was not properly ended"
          );
          return;
        }

        // The open tag is complete
        this.finishOpenTag();

        this.htmlBlockDelimiter = ch;
        var nextIndent = this.getNextIndent();
        if (nextIndent > this.indent) {
          this.indent = nextIndent;
        }
        this.enterState(STATE.BEGIN_DELIMITED_HTML_BLOCK);
        return;
      } else if (code === CODE.OPEN_SQUARE_BRACKET) {
        if (this.currentOpenTag.withinAttrGroup) {
          this.notifyError(
            this.pos,
            "MALFORMED_OPEN_TAG",
            'Unexpected "[" character within open tag.'
          );
          return;
        }

        this.currentOpenTag.withinAttrGroup = true;
        return;
      } else if (code === CODE.CLOSE_SQUARE_BRACKET) {
        if (!this.currentOpenTag.withinAttrGroup) {
          this.notifyError(
            this.pos,
            "MALFORMED_OPEN_TAG",
            'Unexpected "]" character within open tag.'
          );
          return;
        }

        this.currentOpenTag.withinAttrGroup = false;
        return;
      }
    } else {
      if (code === CODE.CLOSE_ANGLE_BRACKET) {
        this.finishOpenTag();
        return;
      } else if (code === CODE.FORWARD_SLASH) {
        let nextCode = this.lookAtCharCodeAhead(1);
        if (nextCode === CODE.CLOSE_ANGLE_BRACKET) {
          this.finishOpenTag(true /* self closed */);
          this.skip(1);
          return;
        }
      }
    }

    if (this.checkForPlaceholder(ch, code)) {
      return;
    }

    if (code === CODE.OPEN_ANGLE_BRACKET) {
      return this.notifyError(
        this.pos,
        "ILLEGAL_ATTRIBUTE_NAME",
        'Invalid attribute name. Attribute name cannot begin with the "<" character.'
      );
    }

    if (
      code === CODE.FORWARD_SLASH &&
      this.lookAtCharCodeAhead(1) === CODE.ASTERISK
    ) {
      // Skip over code inside a JavaScript block comment
      this.enterState(STATE.JS_COMMENT_BLOCK);
      this.skip(1);
      return;
    }

    if (isWhitespaceCode(code)) {
      // ignore whitespace within element...
    } else if (code === CODE.COMMA) {
      this.consumeWhitespace();
    } else if (code === CODE.OPEN_PAREN) {
      this.rewind(1);
      this.enterState(STATE.EXPRESSION);
      // encountered something like:
      // <for (var i = 0; i < len; i++)>
    } else {
      this.rewind(1);
      // attribute name is initially the first non-whitespace
      // character that we found
      this.enterState(STATE.ATTRIBUTE)
    }
  },
});
