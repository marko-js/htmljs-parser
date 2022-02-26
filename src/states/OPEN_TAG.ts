import {
  CODE,
  STATE,
  isWhitespaceCode,
  StateDefinition,
  TemplateRange,
  Range,
  BODY_MODE,
  EventTypes,
} from "../internal";

const enum TAG_STATE {
  VAR,
  ARGUMENT,
  PARAMS,
}

export interface OpenTagMeta extends Range {
  type: "tag";
  body: BODY_MODE;
  state: TAG_STATE | undefined;
  concise: boolean;
  beginMixedMode?: boolean;
  tagName: TemplateRange;
  shorthandEnd: number;
  hasArgs: boolean;
  hasAttrs: boolean;
  hasShorthandId: boolean;
  selfClosed: boolean;
  openTagOnly: boolean;
  indent: string;
  nestedIndent?: string;
}
const PARSED_TEXT_TAGS = ["script", "style", "textarea", "html-comment"];

export const OPEN_TAG: StateDefinition<OpenTagMeta> = {
  name: "OPEN_TAG",

  enter(tag) {
    tag.type = "tag";
    tag.state = undefined;
    tag.hasAttrs = false;
    tag.selfClosed = false;
    tag.openTagOnly = false;
    tag.hasShorthandId = false;
    tag.indent = this.indent;
    tag.concise = this.isConcise;
    tag.beginMixedMode = this.beginMixedMode || this.endingMixedModeAtEOL;

    this.activeTag = tag;
    this.beginMixedMode = false;
    this.endingMixedModeAtEOL = false;
    this.blockStack.push(tag);
    this.endText();

    this.emit({
      type: EventTypes.OpenTagStart,
      start: tag.start,
      end: tag.start + (this.isConcise ? 0 : 1),
    });
  },

  exit(tag) {
    const { tagName, selfClosed, openTagOnly } = tag;

    this.emit({
      type: EventTypes.OpenTagEnd,
      start: this.pos - (this.isConcise ? 0 : selfClosed ? 2 : 1),
      end: this.pos,
      selfClosed,
      openTagOnly,
    });

    if (!this.isConcise && (selfClosed || openTagOnly)) {
      this.closeTag(this.pos, this.pos, undefined);
    } else if (
      tagName.expressions.length === 0 &&
      this.matchAnyAtPos(tagName, PARSED_TEXT_TAGS)
    ) {
      this.enterParsedTextContentState();
    }
  },

  return(childState, childPart, tag) {
    switch (childState) {
      case STATE.JS_COMMENT_BLOCK: {
        /* Ignore comments within an open tag */
        break;
      }
      case STATE.EXPRESSION: {
        switch (tag.state) {
          case TAG_STATE.VAR: {
            if (childPart.start === childPart.end) {
              return this.emitError(
                childPart,
                "MISSING_TAG_VARIABLE",
                "A slash was found that was not followed by a variable name or lhs expression"
              );
            }

            this.emit({
              type: EventTypes.TagVar,
              start: childPart.start - 1, // include /,
              end: childPart.end,
              value: {
                start: childPart.start,
                end: childPart.end,
              },
            });
            break;
          }
          case TAG_STATE.ARGUMENT: {
            const start = childPart.start - 1; // include (
            const end = this.skip(1); // include )
            const value = {
              start: childPart.start,
              end: childPart.end,
            };

            if (this.consumeWhitespaceIfBefore("{")) {
              const attr = this.enterState(STATE.ATTRIBUTE);
              attr.start = start;
              attr.args = { start, end, value };
              tag.hasAttrs = true;
              this.rewind(1);
            } else {
              tag.hasArgs = true;
              this.emit({
                type: EventTypes.TagArgs,
                start,
                end,
                value,
              });
            }
            break;
          }
          case TAG_STATE.PARAMS: {
            this.emit({
              type: EventTypes.TagParams,
              start: childPart.start - 1, // include leading |
              end: this.skip(1), // include closing |
              value: {
                start: childPart.start,
                end: childPart.end,
              },
            });
            break;
          }
        }
        break;
      }
    }
  },

  eol() {
    if (this.isConcise && !this.isInAttrGroup) {
      // In concise mode we always end the open tag
      this.exitState();
    }
  },

  eof(tag) {
    if (this.isConcise) {
      if (this.isInAttrGroup) {
        this.emitError(
          tag,
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
      this.emitError(
        tag,
        "MALFORMED_OPEN_TAG",
        "EOF reached while parsing open tag"
      );
    }
  },

  char(code, tag) {
    if (this.isConcise) {
      if (code === CODE.SEMICOLON) {
        this.skip(1); // skip ;
        this.exitState();
        if (!this.consumeWhitespaceOnLine(0)) {
          switch (this.lookAtCharCodeAhead(0)) {
            case CODE.FORWARD_SLASH:
              switch (this.lookAtCharCodeAhead(1)) {
                case CODE.FORWARD_SLASH:
                  this.enterState(STATE.JS_COMMENT_LINE);
                  this.skip(2); // skip //
                  return;
                case CODE.ASTERISK:
                  this.enterState(STATE.JS_COMMENT_BLOCK);
                  this.skip(2); // skip /*
                  return;
              }
              break;
            case CODE.OPEN_ANGLE_BRACKET:
              if (this.lookAheadFor("!--")) {
                // html comment
                this.enterState(STATE.HTML_COMMENT);
                this.skip(4); // <!--
                return;
              }
              break;
          }

          this.emitError(
            this.pos,
            "INVALID_CODE_AFTER_SEMICOLON",
            "A semicolon indicates the end of a line. Only comments may follow it."
          );
        }

        return;
      }

      if (code === CODE.HTML_BLOCK_DELIMITER) {
        if (this.lookAtCharCodeAhead(1) !== CODE.HTML_BLOCK_DELIMITER) {
          this.emitError(
            tag,
            "MALFORMED_OPEN_TAG",
            '"-" not allowed as first character of attribute name'
          );
          return;
        }

        if (this.isInAttrGroup) {
          this.emitError(
            this.pos,
            "MALFORMED_OPEN_TAG",
            "Attribute group was not properly ended"
          );
          return;
        }

        // The open tag is complete
        this.exitState();

        this.htmlBlockDelimiter = "";

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
        if (this.isInAttrGroup) {
          this.emitError(
            this.pos,
            "MALFORMED_OPEN_TAG",
            'Unexpected "[" character within open tag.'
          );
          return;
        }

        this.isInAttrGroup = true;
        return;
      } else if (code === CODE.CLOSE_SQUARE_BRACKET) {
        if (!this.isInAttrGroup) {
          this.emitError(
            this.pos,
            "MALFORMED_OPEN_TAG",
            'Unexpected "]" character within open tag.'
          );
          return;
        }

        this.isInAttrGroup = false;
        return;
      }
    } else if (code === CODE.CLOSE_ANGLE_BRACKET) {
      this.skip(1); // skip >
      this.exitState();
      return;
    } else if (
      code === CODE.FORWARD_SLASH &&
      this.lookAtCharCodeAhead(1) === CODE.CLOSE_ANGLE_BRACKET
    ) {
      tag.selfClosed = true;
      this.skip(2); // skip />
      this.exitState();
      return;
    }

    if (code === CODE.OPEN_ANGLE_BRACKET) {
      return this.emitError(
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
      this.skip(1); // skip *
      return;
    }

    if (isWhitespaceCode(code)) {
      // ignore whitespace within element...
    } else if (code === CODE.COMMA) {
      this.skip(1); // skip ,
      this.consumeWhitespace();
      this.rewind(1);
    } else if (code === CODE.FORWARD_SLASH && !tag.hasAttrs) {
      tag.state = TAG_STATE.VAR;
      this.skip(1); // skip /
      this.enterState(STATE.EXPRESSION, {
        skipOperators: true,
        terminatedByWhitespace: true,
        terminator: this.isConcise
          ? [";", "(", "|", "=", ":="]
          : [">", "/>", "(", "|", "=", ":="],
      });
      this.rewind(1);
    } else if (code === CODE.OPEN_PAREN && !tag.hasAttrs) {
      if (tag.hasArgs) {
        this.emitError(
          this.pos,
          "ILLEGAL_TAG_ARGUMENT",
          "A tag can only have one argument"
        );
        return;
      }
      tag.state = TAG_STATE.ARGUMENT;
      this.skip(1); // skip (
      this.enterState(STATE.EXPRESSION, {
        skipOperators: true,
        terminator: ")",
      });
      this.rewind(1);
    } else if (code === CODE.PIPE && !tag.hasAttrs) {
      tag.state = TAG_STATE.PARAMS;
      this.skip(1); // skip |
      this.enterState(STATE.EXPRESSION, {
        skipOperators: true,
        terminator: "|",
      });
      this.rewind(1);
    } else {
      if (tag.tagName) {
        this.enterState(STATE.ATTRIBUTE);
        tag.hasAttrs = true;
      } else {
        this.enterState(STATE.TAG_NAME);
      }

      this.rewind(1);
    }
  },
};
