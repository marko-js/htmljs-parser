import {
  CODE,
  STATE,
  isWhitespaceCode,
  StateDefinition,
  Ranges,
  Meta,
  TagType,
  ErrorCode,
} from "../internal";

const enum TAG_STAGE {
  UNKNOWN,
  VAR,
  ARGUMENT,
  PARAMS,
  ATTR_GROUP,
}

export interface OpenTagMeta extends Meta {
  type: TagType;
  stage: TAG_STAGE;
  concise: boolean;
  beginMixedMode?: boolean;
  tagName: Ranges.Template;
  shorthandEnd: number;
  hasArgs: boolean;
  hasAttrs: boolean;
  hasShorthandId: boolean;
  selfClosed: boolean;
  indent: string;
  nestedIndent: string | undefined;
  parentTag: OpenTagMeta | undefined;
}
const CONCISE_TAG_VAR_TERMINATORS = [
  CODE.SEMICOLON,
  CODE.OPEN_PAREN,
  CODE.PIPE,
  CODE.EQUAL,
  [CODE.COLON, CODE.EQUAL],
];

const HTML_TAG_VAR_TERMINATORS = [
  CODE.CLOSE_ANGLE_BRACKET,
  CODE.OPEN_PAREN,
  CODE.PIPE,
  CODE.EQUAL,
  [CODE.COLON, CODE.EQUAL],
  [CODE.FORWARD_SLASH, CODE.CLOSE_ANGLE_BRACKET],
];

export const OPEN_TAG: StateDefinition<OpenTagMeta> = {
  name: "OPEN_TAG",

  enter(parent, start) {
    const tag = (this.activeTag = {
      state: OPEN_TAG as StateDefinition,
      type: TagType.html,
      parent,
      start,
      end: start,
      stage: TAG_STAGE.UNKNOWN,
      parentTag: this.activeTag,
      nestedIndent: undefined,
      indent: this.indent,
      hasShorthandId: false,
      hasArgs: false,
      hasAttrs: false,
      selfClosed: false,
      shorthandEnd: -1,
      tagName: undefined!,
      concise: this.isConcise,
      beginMixedMode: this.beginMixedMode || this.endingMixedModeAtEOL,
    });

    this.beginMixedMode = false;
    this.endingMixedModeAtEOL = false;
    this.endText();
    return tag;
  },

  exit(tag) {
    const { selfClosed } = tag;

    this.options.onOpenTagEnd?.({
      start: this.pos - (this.isConcise ? 0 : selfClosed ? 2 : 1),
      end: this.pos,
      selfClosed,
    });

    switch (selfClosed ? TagType.void : tag.type) {
      case TagType.void:
      case TagType.statement: {
        // Close the tag, but don't also emit the onCloseTag event.
        if (tag.beginMixedMode) this.endingMixedModeAtEOL = true;
        this.activeTag = tag.parentTag;
        break;
      }
      case TagType.text:
        if (this.isConcise) {
          this.enterState(STATE.CONCISE_HTML_CONTENT);
        } else {
          this.enterState(STATE.PARSED_TEXT_CONTENT);
        }
        break;
    }
  },

  eol(_, tag) {
    if (this.isConcise && tag.stage !== TAG_STAGE.ATTR_GROUP) {
      // In concise mode we always end the open tag
      this.exitState();
    }
  },

  eof(tag) {
    if (this.isConcise) {
      if (tag.stage === TAG_STAGE.ATTR_GROUP) {
        this.emitError(
          tag,
          ErrorCode.MALFORMED_OPEN_TAG,
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
      this.emitError(
        tag,
        ErrorCode.MALFORMED_OPEN_TAG,
        "EOF reached while parsing open tag"
      );
    }
  },

  char(code, tag) {
    if (this.isConcise) {
      if (code === CODE.SEMICOLON) {
        this.pos++; // skip ;
        this.exitState();
        if (!this.consumeWhitespaceOnLine(0)) {
          switch (this.lookAtCharCodeAhead(0)) {
            case CODE.FORWARD_SLASH:
              switch (this.lookAtCharCodeAhead(1)) {
                case CODE.FORWARD_SLASH:
                  this.enterState(STATE.JS_COMMENT_LINE);
                  this.pos += 2; // skip //
                  return;
                case CODE.ASTERISK:
                  this.enterState(STATE.JS_COMMENT_BLOCK);
                  this.pos += 2; // skip /*
                  return;
              }
              break;
            case CODE.OPEN_ANGLE_BRACKET:
              if (this.lookAheadFor("!--")) {
                // html comment
                this.enterState(STATE.HTML_COMMENT);
                this.pos += 4; // <!--
                return;
              }
              break;
          }

          this.emitError(
            this.pos,
            ErrorCode.INVALID_CODE_AFTER_SEMICOLON,
            "A semicolon indicates the end of a line. Only comments may follow it."
          );
        }

        return;
      }

      if (code === CODE.HTML_BLOCK_DELIMITER) {
        if (this.lookAtCharCodeAhead(1) !== CODE.HTML_BLOCK_DELIMITER) {
          this.emitError(
            tag,
            ErrorCode.MALFORMED_OPEN_TAG,
            '"-" not allowed as first character of attribute name'
          );
          return;
        }

        if (tag.stage === TAG_STAGE.ATTR_GROUP) {
          this.emitError(
            this.pos,
            ErrorCode.MALFORMED_OPEN_TAG,
            "Attribute group was not properly ended"
          );
          return;
        }

        // The open tag is complete
        this.exitState();

        const maxPos = this.maxPos;
        let curPos = this.pos + 1;
        // Skip until the next newline.
        while (
          curPos < maxPos &&
          this.data.charCodeAt(++curPos) !== CODE.NEWLINE
        );
        // Skip the newline itself.
        const indentStart = ++curPos;

        // Count how many spaces/tabs we have after the newline.
        while (curPos < maxPos) {
          const nextCode = this.data.charCodeAt(curPos);
          if (nextCode === CODE.SPACE || nextCode === CODE.TAB) {
            curPos++;
          } else {
            break;
          }
        }

        const indentSize = curPos - indentStart;
        if (indentSize > this.indent.length) {
          this.indent = this.data.slice(indentStart, curPos);
        }

        this.enterState(STATE.BEGIN_DELIMITED_HTML_BLOCK);
        return;
      } else if (code === CODE.OPEN_SQUARE_BRACKET) {
        if (tag.stage === TAG_STAGE.ATTR_GROUP) {
          this.emitError(
            this.pos,
            ErrorCode.MALFORMED_OPEN_TAG,
            'Unexpected "[" character within open tag.'
          );
          return;
        }

        tag.stage = TAG_STAGE.ATTR_GROUP;
        return;
      } else if (code === CODE.CLOSE_SQUARE_BRACKET) {
        if (tag.stage !== TAG_STAGE.ATTR_GROUP) {
          this.emitError(
            this.pos,
            ErrorCode.MALFORMED_OPEN_TAG,
            'Unexpected "]" character within open tag.'
          );
          return;
        }

        tag.stage = TAG_STAGE.UNKNOWN;
        return;
      }
    } else if (code === CODE.CLOSE_ANGLE_BRACKET) {
      this.pos++; // skip >
      this.exitState();
      return;
    } else if (
      code === CODE.FORWARD_SLASH &&
      this.lookAtCharCodeAhead(1) === CODE.CLOSE_ANGLE_BRACKET
    ) {
      tag.selfClosed = true;
      this.pos += 2; // skip />
      this.exitState();
      return;
    }

    if (code === CODE.OPEN_ANGLE_BRACKET) {
      return this.emitError(
        this.pos,
        ErrorCode.INVALID_ATTRIBUTE_NAME,
        'Invalid attribute name. Attribute name cannot begin with the "<" character.'
      );
    }

    if (
      code === CODE.FORWARD_SLASH &&
      this.lookAtCharCodeAhead(1) === CODE.ASTERISK
    ) {
      // Skip over code inside a JavaScript block comment
      this.enterState(STATE.JS_COMMENT_BLOCK);
      this.pos++; // skip *
      return;
    }

    if (isWhitespaceCode(code)) {
      // ignore whitespace within element...
    } else if (code === CODE.COMMA) {
      this.pos++; // skip ,
      this.consumeWhitespace();
      this.pos--;
    } else if (code === CODE.FORWARD_SLASH && !tag.hasAttrs) {
      tag.stage = TAG_STAGE.VAR;
      this.pos++; // skip /

      if (isWhitespaceCode(this.lookAtCharCodeAhead(0))) {
        return this.emitError(
          this.pos,
          ErrorCode.MISSING_TAG_VARIABLE,
          "A slash was found that was not followed by a variable name or lhs expression"
        );
      }

      const expr = this.enterState(STATE.EXPRESSION);
      expr.terminatedByWhitespace = true;
      expr.terminator = this.isConcise
        ? CONCISE_TAG_VAR_TERMINATORS
        : HTML_TAG_VAR_TERMINATORS;
      this.pos--;
    } else if (code === CODE.OPEN_PAREN && !tag.hasAttrs) {
      if (tag.hasArgs) {
        this.emitError(
          this.pos,
          ErrorCode.INVALID_TAG_ARGUMENT,
          "A tag can only have one argument"
        );
        return;
      }
      tag.stage = TAG_STAGE.ARGUMENT;
      this.pos++; // skip (
      const expr = this.enterState(STATE.EXPRESSION);
      expr.skipOperators = true;
      expr.terminator = CODE.CLOSE_PAREN;
      this.pos--;
    } else if (code === CODE.PIPE && !tag.hasAttrs) {
      tag.stage = TAG_STAGE.PARAMS;
      this.pos++; // skip |
      const expr = this.enterState(STATE.EXPRESSION);
      expr.skipOperators = true;
      expr.terminator = CODE.PIPE;
      this.pos--;
    } else {
      if (tag.tagName) {
        this.enterState(STATE.ATTRIBUTE);
        tag.hasAttrs = true;
      } else {
        this.enterState(STATE.TAG_NAME);
      }

      this.pos--;
    }
  },

  return(child, tag) {
    switch (child.state) {
      case STATE.JS_COMMENT_BLOCK: {
        /* Ignore comments within an open tag */
        break;
      }
      case STATE.EXPRESSION: {
        switch (tag.stage) {
          case TAG_STAGE.VAR: {
            if (child.start === child.end) {
              return this.emitError(
                child,
                ErrorCode.MISSING_TAG_VARIABLE,
                "A slash was found that was not followed by a variable name or lhs expression"
              );
            }

            this.options.onTagVar?.({
              start: child.start - 1, // include /,
              end: child.end,
              value: {
                start: child.start,
                end: child.end,
              },
            });
            break;
          }
          case TAG_STAGE.ARGUMENT: {
            const start = child.start - 1; // include (
            const end = ++this.pos; // include )
            const value = {
              start: child.start,
              end: child.end,
            };

            if (this.consumeWhitespaceIfBefore("{")) {
              const attr = this.enterState(STATE.ATTRIBUTE);
              attr.start = start;
              attr.args = { start, end, value };
              tag.hasAttrs = true;
              this.pos--;
            } else {
              tag.hasArgs = true;
              this.options.onTagArgs?.({
                start,
                end,
                value,
              });
            }
            break;
          }
          case TAG_STAGE.PARAMS: {
            const end = ++this.pos; // include closing |
            this.options.onTagParams?.({
              start: child.start - 1, // include leading |
              end,
              value: {
                start: child.start,
                end: child.end,
              },
            });
            break;
          }
        }
        break;
      }
    }
  },
};
