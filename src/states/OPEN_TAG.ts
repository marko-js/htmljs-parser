import { Parser, CODE, STATE, isWhitespaceCode, peek } from "../internal";

export const OPEN_TAG = Parser.createState({
  name: "OPEN_TAG",

  enter(oldState, tag) {
    this.endText();

    tag.type = "tag";
    tag.tagName = "";
    tag.tagNameParts = null;
    tag.attributes = [];
    tag.argument = undefined;
    tag.params = undefined;
    tag.pos = this.pos;
    tag.indent = this.indent;
    tag.nestedIndent = null; // This will get set when we know what the nested indent is
    tag.concise = this.isConcise;
    tag.beginMixedMode = this.beginMixedMode;

    this.withinOpenTag = true;

    if (this.beginMixedMode) {
      this.beginMixedMode = false;
    }

    this.blockStack.push(tag);

    this.currentOpenTag = tag;
  },

  exit(tag) {
    var tagName = tag.tagName;
    var attributes = tag.attributes;
    var parseOptions = tag.parseOptions;
    var selfClosed = tag.selfClosed

    var ignoreAttributes =
      parseOptions && parseOptions.ignoreAttributes === true;

    if (ignoreAttributes) {
      attributes.length = 0;
    } else {
      if (tag.requiresCommas && attributes.length > 1) {
        for (let i = 0; i < attributes.length - 1; i++) {
          if (!attributes[i].endedWithComma) {
            if (!parseOptions || parseOptions.relaxRequireCommas !== true) {
              this.notifyError(
                attributes[i].pos,
                "COMMAS_REQUIRED",
                "if commas are used, they must be used to separate all attributes for a tag"
              );
            }
          }
        }
      }
    }

    tag.expectedCloseTagName = this.expectedCloseTagName =
      this.substring(
        tag.tagNameStart,
        tag.tagNameEnd
      );

    var openTagOnly = (tag.openTagOnly =
      this.isOpenTagOnly(tagName));

    if (tag.tagNameParts) {
      tag.tagNameExpression =
        tag.tagNameParts.join("+");
    }
    tag.selfClosed = selfClosed === true;

    if (!tag.tagName && !tag.emptyTagName) {
      tagName = tag.tagName = "div";
    }

    var origState = this.state;
    this.notifiers.notifyOpenTag(tag);

    var shouldClose = false;

    if (selfClosed) {
      shouldClose = true;
    } else if (openTagOnly) {
      if (!this.isConcise) {
        // Only close the tag if we are not in concise mode. In concise mode
        // we want to keep the tag on the stack to make sure nothing is nested below it
        shouldClose = true;
      }
    }

    if (shouldClose) {
      this.closeTag(this.expectedCloseTagName);
    }

    this.withinOpenTag = false;

    if (shouldClose) {
      if (this.isConcise) {
        this.enterConciseHtmlContentState();
      } else {
        this.enterHtmlContentState();
      }
    } else {
      // Did the parser stay in the same state after
      // this.notifiers.notifying listeners about openTag?
      if (this.state === origState) {
        // The listener didn't transition the parser to a new state
        // so we use some simple rules to find the appropriate state.
        if (tagName === "script") {
          this.enterJsContentState();
        } else if (tagName === "style") {
          this.enterCssContentState();
        } else {
          if (this.isConcise) {
            this.enterConciseHtmlContentState();
          } else {
            this.enterHtmlContentState();
          }
        }
      }
    }

    // We need to record the "expected close tag name" if we transition into
    // either STATE.STATIC_TEXT_CONTENT or STATE.PARSED_TEXT_CONTENT
    this.currentOpenTag = undefined;
  },

  return(childState, childPart) {
    switch (childState) {
      case STATE.TAG_NAME: {
        this.currentOpenTag.tagName = childPart.rawValue;
        this.currentOpenTag.tagNameParts = childPart.stringParts;
        this.currentOpenTag.shorthandId = childPart.shorthandId;
        this.currentOpenTag.shorthandClassNames = childPart.shorthandClassNames;
        this.currentOpenTag.tagNameStart = childPart.pos;
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
                skipOperators: true,
                terminatedByWhitespace: true,
                terminator: [
                  this.isConcise ? ";" : ">",
                  "/",
                  "(",
                  "|",
                  ".",
                  "#",
                  "=",
                  ":="
                ]
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

  eol(linebreak) {
    if (this.isConcise && !this.currentOpenTag.withinAttrGroup) {
      // In concise mode we always end the open tag
      this.exitState();
      this.skip(linebreak.length)
    }
  },

  eof() {
    if (this.isConcise) {
      if (this.currentOpenTag.withinAttrGroup) {
        this.notifyError(
          this.currentOpenTag.pos,
          "MALFORMED_OPEN_TAG",
          'EOF reached while within an attribute group (e.g. "[ ... ]").'
        );
        return;
      }

      // If we reach EOF inside an open tag when in concise-mode
      // then we just end the tag and all other open tags on the stack
      this.exitState();
    } else {
      // Otherwise, in non-concise mode we consider this malformed input
      // since the end '>' was not found.
      this.notifyError(
        this.currentOpenTag.pos,
        "MALFORMED_OPEN_TAG",
        "EOF reached while parsing open tag"
      );
    }
  },

  char(ch, code) {
    if (this.isConcise) {
      if (code === CODE.SEMICOLON) {
        this.exitState(";");
        this.enterState(STATE.CHECK_TRAILING_WHITESPACE, {
          handler(err) {
            if (err) {
              var code = err.ch.charCodeAt(0);

              if (code === CODE.FORWARD_SLASH) {
                if (this.lookAheadFor("/")) {
                  this.enterState(STATE.JS_COMMENT_LINE);
                  this.skip(2);
                  return;
                } else if (this.lookAheadFor("*")) {
                  this.enterState(STATE.JS_COMMENT_BLOCK);
                  this.skip(2);
                  return;
                }
              } else if (
                code === CODE.OPEN_ANGLE_BRACKET &&
                this.lookAheadFor("!--")
              ) {
                // html comment
                this.enterState(STATE.HTML_COMMENT);
                this.skip(4);
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
          this.notifyError(
            this.currentOpenTag.pos,
            "MALFORMED_OPEN_TAG",
            '"-" not allowed as first character of attribute name'
          );
          return;
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
        this.exitState();

        this.htmlBlockDelimiter = "";
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
        this.exitState(">");
        return;
      } else if (code === CODE.FORWARD_SLASH) {
        let nextCode = this.lookAtCharCodeAhead(1);
        if (nextCode === CODE.CLOSE_ANGLE_BRACKET) {
          this.currentOpenTag.selfClosed = true;
          this.exitState("/>");
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
        skipOperators: true,
        terminatedByWhitespace: true,
        terminator: this.isConcise
          ? [";", "(", "|", "=", ":="]
          : [">", "/>", "(", "|", "=", ":="]
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
