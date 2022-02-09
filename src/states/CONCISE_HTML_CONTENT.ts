import {
  Parser,
  CODE,
  STATE,
  isWhitespaceCode,
  StateDefinition,
  ValuePart,
  BODY_MODE,
} from "../internal";

// In STATE.CONCISE_HTML_CONTENT we are looking for concise tags and text blocks based on indent
export const CONCISE_HTML_CONTENT: StateDefinition = {
  name: "CONCISE_HTML_CONTENT",

  eol(newLine) {
    this.addText(newLine);
    this.indent = "";
  },

  eof: Parser.prototype.htmlEOF,

  enter() {
    this.isConcise = true;
    this.indent = "";
  },

  return(childState, childPart) {
    this.indent = "";

    switch (childState) {
      case STATE.JS_COMMENT_LINE:
        this.notifiers.notifyComment({
          pos: childPart.pos,
          endPos: childPart.endPos,
          value: {
            pos: childPart.pos + 2, // strip //
            endPos: childPart.endPos,
          },
        });
        break;
      case STATE.JS_COMMENT_BLOCK: {
        this.notifiers.notifyComment({
          pos: childPart.pos,
          endPos: childPart.endPos,
          value: {
            pos: childPart.pos + 2, // strip /*
            endPos: childPart.endPos - 2, // strip */,
          },
        });

        if (childState === STATE.JS_COMMENT_BLOCK) {
          // Make sure there is only whitespace on the line
          // after the ending "*/" sequence
          this.enterState(STATE.CHECK_TRAILING_WHITESPACE, {
            handler(err) {
              if (err) {
                // This is a non-whitespace! We don't allow non-whitespace
                // after matching two or more hyphens. This is user error...
                this.notifyError(
                  this.pos,
                  "INVALID_CHARACTER",
                  'A non-whitespace of "' +
                    err.ch +
                    '" was found after a JavaScript block comment.'
                );
              }
            },
          });
        }

        break;
      }
    }
  },

  char(ch, code) {
    if (isWhitespaceCode(code)) {
      this.indent += ch;
    } else {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const len = this.blockStack.length;
        if (len) {
          const curBlock = this.blockStack[len - 1];
          if (curBlock.indent.length >= this.indent.length) {
            this.closeTag();
          } else {
            // Indentation is greater than the last tag so we are starting a
            // nested tag and there are no more tags to end
            break;
          }
        } else {
          if (this.indent) {
            this.notifyError(
              this.pos,
              "BAD_INDENTATION",
              "Line has extra indentation at the beginning"
            );
            return;
          }
          break;
        }
      }

      const parent =
        this.blockStack.length && this.blockStack[this.blockStack.length - 1];
      let body: BODY_MODE | undefined;

      if (parent) {
        body = parent.body;
        if (parent.type === "tag" && parent.openTagOnly) {
          this.notifyError(
            this.pos,
            "INVALID_BODY",
            'The "' +
              this.read(parent.tagName) +
              '" tag does not allow nested body content'
          );
          return;
        }

        if (parent.nestedIndent) {
          if (parent.nestedIndent.length !== this.indent.length) {
            this.notifyError(
              this.pos,
              "BAD_INDENTATION",
              "Line indentation does match indentation of previous line"
            );
            return;
          }
        } else {
          parent.nestedIndent = this.indent;
        }
      }

      if (body && code !== CODE.HTML_BLOCK_DELIMITER) {
        this.notifyError(
          this.pos,
          "ILLEGAL_LINE_START",
          'A line within a tag that only allows text content must begin with a "-" character'
        );
        return;
      }

      if (code === CODE.OPEN_ANGLE_BRACKET) {
        this.beginMixedMode = true;
        this.rewind(1);
        this.beginHtmlBlock();
        return;
      }

      if (
        code === CODE.DOLLAR &&
        isWhitespaceCode(this.lookAtCharCodeAhead(1))
      ) {
        this.skip(1);
        this.enterState(STATE.INLINE_SCRIPT);
        return;
      }

      if (code === CODE.HTML_BLOCK_DELIMITER) {
        if (this.lookAtCharCodeAhead(1) !== CODE.HTML_BLOCK_DELIMITER) {
          this.notifyError(
            this.pos,
            "ILLEGAL_LINE_START",
            'A line in concise mode cannot start with a single hyphen. Use "--" instead. See: https://github.com/marko-js/htmljs-parser/issues/43'
          );
          return;
        }

        this.htmlBlockDelimiter = ch;
        return this.enterState(STATE.BEGIN_DELIMITED_HTML_BLOCK);
      } else if (code === CODE.FORWARD_SLASH) {
        // Check next character to see if we are in a comment
        const nextCode = this.lookAtCharCodeAhead(1);
        if (nextCode === CODE.FORWARD_SLASH) {
          this.enterState(STATE.JS_COMMENT_LINE);
          this.skip(1);
          return;
        } else if (nextCode === CODE.ASTERISK) {
          this.enterState(STATE.JS_COMMENT_BLOCK);
          this.skip(1);
          return;
        } else {
          this.notifyError(
            this.pos,
            "ILLEGAL_LINE_START",
            'A line in concise mode cannot start with "/" unless it starts a "//" or "/*" comment'
          );
          return;
        }
      } else {
        this.enterState(STATE.OPEN_TAG);
        this.rewind(1); // START_TAG_NAME expects to start at the first character
      }
    }
  },
};
