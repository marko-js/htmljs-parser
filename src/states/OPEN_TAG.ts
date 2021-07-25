import { Parser, CODE, STATE, isWhitespaceCode, peek } from "../internal";

export const OPEN_TAG = Parser.createState({
  name: "OPEN_TAG",

  enter() {
    
  },

  return(childState, childPart) {
    switch (childState) {
      case STATE.TAG_NAME: {
        this.currentOpenTag.tagName = childPart.rawValue;
        this.currentOpenTag.tagNameParts = childPart.stringParts;
        this.currentOpenTag.shorthandId = childPart.shorthandId;
        this.currentOpenTag.shorthandClassNames = childPart.shorthandClassNames;
        this.currentOpenTag.tagNameStart = childPart.pos;
        // TODO: why both?
        this.currentOpenTag.tagNameEnd = this.currentOpenTag.tagNameEndPos = childPart.endPos;


        if (!this.currentOpenTag.notifiedOpenTagName) {
          this.currentOpenTag.notifiedOpenTagName = true;
          this.notifiers.notifyOpenTagName(this.currentOpenTag);
        }

        break;
      }
      case STATE.ATTRIBUTE: {
        const attr = childPart;
        if (this.currentOpenTag.argument && childPart.block && !this.currentOpenTag.attributes.length) {
          attr.name = "default";
          attr.default = true;
          attr.method = true;
          attr.pos = this.currentOpenTag.argument.pos;
          attr.value = "function" + this.data.substring(attr.pos, attr.endPos);
          this.currentOpenTag.argument = undefined;
        } 
        this.currentOpenTag.attributes.push(attr);
        this.currentOpenTag.requiresCommas ||= attr.endedWithComma;
        break;
      }
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
        switch (childPart.part) {
          case "NAME": {
            this.currentOpenTag.tagNameEnd = childPart.endPos;
            this.currentOpenTag.tagName = childPart.value;

            if (!this.currentOpenTag.notifiedOpenTagName) {
              this.currentOpenTag.notifiedOpenTagName = true;
              this.currentOpenTag.tagNameEndPos = this.pos;
              this.notifiers.notifyOpenTagName(this.currentOpenTag);
            }

            const nextCharCode = this.lookAtCharCodeAhead(1);
            if (nextCharCode === CODE.PERIOD || nextCharCode === CODE.NUMBER_SIGN) {
              this.enterState(STATE.EXPRESSION, {
                part: "NAME",
                terminatedByWhitespace: true,
                terminator: [this.isConcise ? ";" : ">", "/>", "(", "|", ".", "#"] 
              });
            }
            break;
          }
          case "VARIABLE": {
            if (!childPart.value) {
              return this.notifyError(
                this.pos,
                "MISSING_TAG_VARIABLE",
                "A slash was found that was not followed by a variable name or lhs expression"
              );
            }
            this.currentOpenTag.var = childPart;
            break;
          }
          case "ARGUMENT": {
            this.currentOpenTag.argument = childPart;
            this.skip(1); // skip closing )
            break;
          }
          case "PARAMETERS": {
            this.currentOpenTag.params = childPart;
            this.skip(1); // skip closing |
            break;
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
    } else if (code === CODE.FORWARD_SLASH && !this.currentOpenTag.attributes.length) {
      this.enterState(STATE.EXPRESSION, {
        part: "VARIABLE",
        terminatedByWhitespace: true,
        terminator: [this.isConcise ? ";" : ">", "/>", "(", "|", "="] 
      });
    } else if (code === CODE.OPEN_PAREN && !this.currentOpenTag.attributes.length) {
      if (this.currentOpenTag.argument != null) {
        this.notifyError(
          this.pos,
          "ILLEGAL_TAG_ARGUMENT",
          "A tag can only have one argument"
        );
        return;
      }
      this.enterState(STATE.EXPRESSION, {
        part: "ARGUMENT",
        terminator: ")" 
      });
    } else if (code === CODE.PIPE && !this.currentOpenTag.attributes.length) {
      this.enterState(STATE.EXPRESSION, {
        part: "PARAMETERS",
        terminator: "|" 
      });
    } else {
      // attribute name is initially the first non-whitespace
      // character that we found
      if (!this.currentOpenTag.notifiedOpenTagName) {
        this.enterState(STATE.TAG_NAME);
        this.rewind(1);
      } else if (!this.checkForPlaceholder(ch, code)) {
        this.enterState(STATE.ATTRIBUTE);
        this.rewind(1);
      }
    }
  },
});
