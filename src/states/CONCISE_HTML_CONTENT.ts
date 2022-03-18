import {
  CODE,
  STATE,
  isWhitespaceCode,
  StateDefinition,
  BODY_MODE,
  OpenTagEnding,
  htmlEOF,
} from "../internal";

// In STATE.CONCISE_HTML_CONTENT we are looking for concise tags and text blocks based on indent
export const CONCISE_HTML_CONTENT: StateDefinition = {
  name: "CONCISE_HTML_CONTENT",

  enter(parent, start) {
    this.isConcise = true;
    this.indent = "";
    return {
      state: CONCISE_HTML_CONTENT,
      parent,
      start,
      end: start,
    };
  },

  exit() {},

  char(code) {
    if (isWhitespaceCode(code)) {
      this.indent += this.data[this.pos];
    } else {
      const curIndent = this.indent.length;
      const indentStart = this.pos - curIndent - 1;
      let parentTag = this.activeTag;

      while (parentTag && parentTag.indent.length >= curIndent) {
        this.closeTag(indentStart, indentStart, undefined);
        parentTag = this.activeTag;
      }

      if (!parentTag && curIndent) {
        this.emitError(
          this.pos,
          "BAD_INDENTATION",
          "Line has extra indentation at the beginning"
        );
        return;
      }

      if (parentTag) {
        if (parentTag.ending !== OpenTagEnding.tag) {
          this.emitError(
            this.pos,
            "INVALID_BODY",
            `The "${this.read(
              parentTag.tagName
            )}" tag does not allow nested body content`
          );
          return;
        }

        if (
          parentTag.bodyMode === BODY_MODE.PARSED_TEXT &&
          code !== CODE.HTML_BLOCK_DELIMITER
        ) {
          this.emitError(
            this.pos,
            "ILLEGAL_LINE_START",
            'A line within a tag that only allows text content must begin with a "-" character'
          );
          return;
        }

        if (parentTag.nestedIndent === undefined) {
          parentTag.nestedIndent = this.indent;
        } else if (parentTag.nestedIndent !== this.indent) {
          this.emitError(
            this.pos,
            "BAD_INDENTATION",
            "Line indentation does match indentation of previous line"
          );
          return;
        }
      }

      switch (code) {
        case CODE.OPEN_ANGLE_BRACKET:
          this.beginMixedMode = true;
          this.pos--;
          this.beginHtmlBlock(undefined, false);
          return;
        case CODE.DOLLAR:
          if (isWhitespaceCode(this.lookAtCharCodeAhead(1))) {
            this.pos++; // skip space after $
            this.enterState(STATE.INLINE_SCRIPT);
            return;
          }
          break;
        case CODE.HTML_BLOCK_DELIMITER:
          if (this.lookAtCharCodeAhead(1) === CODE.HTML_BLOCK_DELIMITER) {
            this.enterState(STATE.BEGIN_DELIMITED_HTML_BLOCK);
            this.pos--;
          } else {
            this.emitError(
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
              this.pos++; // skip /
              return;
            case CODE.ASTERISK:
              this.enterState(STATE.JS_COMMENT_BLOCK);
              this.pos++; // skip *
              return;
            default:
              this.emitError(
                this.pos,
                "ILLEGAL_LINE_START",
                'A line in concise mode cannot start with "/" unless it starts a "//" or "/*" comment'
              );
              return;
          }
      }

      this.enterState(STATE.OPEN_TAG);
      this.pos--; // START_TAG_NAME expects to start at the first character
    }
  },

  eol() {
    this.indent = "";
  },

  eof: htmlEOF,

  return(child) {
    this.indent = "";
    this.isConcise = true;

    switch (child.state) {
      case STATE.JS_COMMENT_LINE:
        this.handlers.onComment?.({
          start: child.start,
          end: child.end,
          value: {
            start: child.start + 2, // strip //
            end: child.end,
          },
        });
        break;
      case STATE.JS_COMMENT_BLOCK: {
        this.handlers.onComment?.({
          start: child.start,
          end: child.end,
          value: {
            start: child.start + 2, // strip /*
            end: child.end - 2, // strip */,
          },
        });

        if (!this.consumeWhitespaceOnLine(0)) {
          // Make sure there is only whitespace on the line
          // after the ending "*/" sequence
          this.emitError(
            this.pos,
            "INVALID_CHARACTER",
            "In concise mode a javascript comment block can only be followed by whitespace characters and a newline."
          );
        }

        break;
      }
    }
  },
};
