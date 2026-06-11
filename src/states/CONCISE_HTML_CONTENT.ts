import {
  CODE,
  STATE,
  isWhitespaceCode,
  type StateDefinition,
  TagType,
  htmlEOF,
  ErrorCode,
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

  /* c8 ignore next -- the root state never exits */
  exit() {},

  parse(data, maxPos) {
    if (this.pos === maxPos) {
      htmlEOF.call(this);
      this.pos++;
      return;
    }

    while (this.pos < maxPos) {
      const code = data.charCodeAt(this.pos);

      if (code === CODE.NEWLINE || code === CODE.CARRIAGE_RETURN) {
        this.indent = "";
        this.pos +=
          code === CODE.CARRIAGE_RETURN &&
          data.charCodeAt(this.pos + 1) === CODE.NEWLINE
            ? 2
            : 1;
        continue;
      }

      if (isWhitespaceCode(code)) {
        // Eagerly consume the indent up to the end of the line.
        const start = this.pos;
        let next: number;
        do {
          this.pos++;
        } while (
          this.pos < maxPos &&
          isWhitespaceCode((next = data.charCodeAt(this.pos))) &&
          next !== CODE.NEWLINE &&
          next !== CODE.CARRIAGE_RETURN
        );
        this.indent += data.slice(start, this.pos);
        continue;
      }

      // Non-whitespace character: dispatch based on current indent level
      const curIndent = this.indent.length;
      const indentStart = this.pos - curIndent - 1;
      let parentTag = this.activeTag;

      while (parentTag && parentTag.indent.length >= curIndent) {
        this.closeTagEnd(indentStart, indentStart, undefined);
        parentTag = this.activeTag;
      }

      if (!parentTag && curIndent) {
        if (code !== CODE.FORWARD_SLASH) {
          this.emitError(
            this.pos,
            ErrorCode.INVALID_INDENTATION,
            "Line has extra indentation at the beginning",
          );
          return;
        }
      }

      if (parentTag) {
        if (parentTag.type === TagType.text && code !== CODE.HYPHEN) {
          this.emitError(
            this.pos,
            ErrorCode.INVALID_LINE_START,
            'A line within a tag that only allows text content must begin with a "-" character',
          );
          return;
        }

        if (parentTag.nestedIndent === undefined) {
          parentTag.nestedIndent = this.indent;
        } else if (parentTag.nestedIndent !== this.indent) {
          this.emitError(
            this.pos,
            ErrorCode.INVALID_INDENTATION,
            "Line indentation does match indentation of previous line",
          );
          return;
        }
      }

      switch (code) {
        case CODE.OPEN_ANGLE_BRACKET:
          this.beginMixedMode = true;
          this.beginHtmlBlock(undefined, false); // pos stays at <
          return;
        case CODE.DOLLAR:
          if (isWhitespaceCode(data.charCodeAt(this.pos + 1))) {
            this.pos++; // skip $, INLINE_SCRIPT starts at space
            this.enterState(STATE.INLINE_SCRIPT);
            return;
          }
          break; // fall through to enter OPEN_TAG
        case CODE.HYPHEN:
          if (data.charCodeAt(this.pos + 1) === CODE.HYPHEN) {
            this.enterState(STATE.BEGIN_DELIMITED_HTML_BLOCK);
            return; // pos stays at the first -, BEGIN_DELIMITED_HTML_BLOCK parses it
          } else {
            this.emitError(
              this.pos,
              ErrorCode.INVALID_LINE_START,
              'A line in concise mode cannot start with a single hyphen. Use "--" instead. See: https://github.com/marko-js/htmljs-parser/issues/43',
            );
            return;
          }
        case CODE.FORWARD_SLASH:
          switch (data.charCodeAt(this.pos + 1)) {
            case CODE.FORWARD_SLASH:
              this.enterState(STATE.JS_COMMENT_LINE);
              this.pos += 2; // skip //
              return;
            case CODE.ASTERISK:
              this.enterState(STATE.JS_COMMENT_BLOCK);
              this.pos += 2; // skip /*
              return;
            default:
              this.emitError(
                this.pos,
                ErrorCode.INVALID_LINE_START,
                'A line in concise mode cannot start with "/" unless it starts a "//" or "/*" comment',
              );
              return;
          }
      }

      this.enterState(STATE.OPEN_TAG);
      return; // pos stays at current char, OPEN_TAG sees it
    }
  },

  return(child) {
    this.indent = "";
    this.isConcise = true;

    switch (child.state) {
      case STATE.JS_COMMENT_LINE:
        this.options.onComment?.({
          start: child.start,
          end: child.end,
          value: {
            start: child.start + 2, // strip //
            end: child.end,
          },
        });
        break;
      case STATE.JS_COMMENT_BLOCK: {
        this.options.onComment?.({
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
            ErrorCode.INVALID_CHARACTER,
            "In concise mode a javascript comment block can only be followed by whitespace characters and a newline.",
          );
        }

        break;
      }
    }
  },
};
