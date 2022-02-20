import {
  Parser,
  CODE,
  STATE,
  isWhitespaceCode,
  StateDefinition,
  peek,
} from "../internal";

// In STATE.CONCISE_HTML_CONTENT we are looking for concise tags and text blocks based on indent
export const CONCISE_HTML_CONTENT: StateDefinition = {
  name: "CONCISE_HTML_CONTENT",

  eol() {
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
          start: childPart.start,
          end: childPart.end,
          value: {
            start: childPart.start + 2, // strip //
            end: childPart.end,
          },
        });
        break;
      case STATE.JS_COMMENT_BLOCK: {
        this.notifiers.notifyComment({
          start: childPart.start,
          end: childPart.end,
          value: {
            start: childPart.start + 2, // strip /*
            end: childPart.end - 2, // strip */,
          },
        });

        if (
          childState === STATE.JS_COMMENT_BLOCK &&
          !this.consumeWhitespaceOnLine(0)
        ) {
          // Make sure there is only whitespace on the line
          // after the ending "*/" sequence
          this.notifyError(
            this.pos,
            "INVALID_CHARACTER",
            "In concise mode a javascript comment block can only be followed by whitespace characters and a newline."
          );
        }

        break;
      }
    }
  },

  char(code) {
    if (isWhitespaceCode(code)) {
      this.indent += " "; // TODO: can just be a length?
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

      const parentBlock = peek(this.blockStack);

      if (parentBlock) {
        if (parentBlock.type === "tag" && parentBlock.openTagOnly) {
          this.notifyError(
            this.pos,
            "INVALID_BODY",
            `The "${this.read(
              parentBlock.tagName
            )}" tag does not allow nested body content`
          );
          return;
        }

        if (parentBlock.body && code !== CODE.HTML_BLOCK_DELIMITER) {
          this.notifyError(
            this.pos,
            "ILLEGAL_LINE_START",
            'A line within a tag that only allows text content must begin with a "-" character'
          );
          return;
        }

        if (parentBlock.nestedIndent) {
          if (parentBlock.nestedIndent.length !== this.indent.length) {
            this.notifyError(
              this.pos,
              "BAD_INDENTATION",
              "Line indentation does match indentation of previous line"
            );
            return;
          }
        } else {
          parentBlock.nestedIndent = this.indent;
        }
      }

      switch (code) {
        case CODE.OPEN_ANGLE_BRACKET:
          this.beginMixedMode = true;
          this.rewind(1);
          this.beginHtmlBlock();
          return;
        case CODE.DOLLAR:
          if (isWhitespaceCode(this.lookAtCharCodeAhead(1))) {
            this.skip(1);
            this.enterState(STATE.INLINE_SCRIPT);
            return;
          }
          break;
        case CODE.HTML_BLOCK_DELIMITER:
          if (this.lookAtCharCodeAhead(1) === CODE.HTML_BLOCK_DELIMITER) {
            this.htmlBlockDelimiter = "-";
            this.enterState(STATE.BEGIN_DELIMITED_HTML_BLOCK);
          } else {
            this.notifyError(
              this.pos,
              "ILLEGAL_LINE_START",
              'A line in concise mode cannot start with a single hyphen. Use "--" instead. See: https://github.com/marko-js/htmljs-parser/issues/43'
            );
          }
          return;
        case CODE.FORWARD_SLASH:
          // Check next character to see if we are in a comment
          switch (this.lookAtCharCodeAhead(1)) {
            case CODE.FORWARD_SLASH:
              this.enterState(STATE.JS_COMMENT_LINE);
              this.skip(1);
              return;
            case CODE.ASTERISK:
              this.enterState(STATE.JS_COMMENT_BLOCK);
              this.skip(1);
              return;
            default:
              this.notifyError(
                this.pos,
                "ILLEGAL_LINE_START",
                'A line in concise mode cannot start with "/" unless it starts a "//" or "/*" comment'
              );
              return;
          }
      }

      this.enterState(STATE.OPEN_TAG);
      this.rewind(1); // START_TAG_NAME expects to start at the first character
    }
  },
};
