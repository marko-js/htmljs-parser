import {
  CODE,
  STATE,
  isWhitespaceCode,
  StateDefinition,
  BODY_MODE,
  OpenTagEnding,
  Ranges,
  Meta,
} from "../internal";

const enum TAG_STAGE {
  UNKNOWN,
  VAR,
  ARGUMENT,
  PARAMS,
  ATTR_GROUP,
}

export interface OpenTagMeta extends Meta {
  bodyMode: BODY_MODE;
  stage: TAG_STAGE;
  concise: boolean;
  beginMixedMode?: boolean;
  tagName: Ranges.Template;
  shorthandEnd: number;
  hasArgs: boolean;
  hasAttrs: boolean;
  hasShorthandId: boolean;
  ending: OpenTagEnding;
  indent: string;
  nestedIndent: string | undefined;
  parentTag: OpenTagMeta | undefined;
}
const PARSED_TEXT_TAGS = ["script", "style", "textarea", "html-comment"];
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
      shorthandEnd: -1,
      tagName: undefined!,
      ending: OpenTagEnding.tag,
      concise: this.isConcise,
      bodyMode: BODY_MODE.HTML,
      beginMixedMode: this.beginMixedMode || this.endingMixedModeAtEOL,
    });

    this.beginMixedMode = false;
    this.endingMixedModeAtEOL = false;
    this.endText();
    return tag;
  },

  exit(tag) {
    const { tagName, ending } = tag;

    this.handlers.onOpenTagEnd?.({
      start:
        this.pos - (this.isConcise ? 0 : ending & OpenTagEnding.self ? 2 : 1),
      end: this.pos,
      ending,
    });

    if (!this.isConcise && ending !== OpenTagEnding.tag) {
      this.closeTag(this.pos, this.pos, undefined);
    } else if (
      tagName.expressions.length === 0 &&
      this.matchAnyAtPos(tagName, PARSED_TEXT_TAGS)
    ) {
      tag.bodyMode = BODY_MODE.PARSED_TEXT;
      if (this.isConcise) {
        this.enterState(STATE.CONCISE_HTML_CONTENT);
      } else {
        this.enterState(STATE.PARSED_TEXT_CONTENT);
      }
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

        if (tag.stage === TAG_STAGE.ATTR_GROUP) {
          this.emitError(
            this.pos,
            "MALFORMED_OPEN_TAG",
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
            "MALFORMED_OPEN_TAG",
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
            "MALFORMED_OPEN_TAG",
            'Unexpected "]" character within open tag.'
          );
          return;
        }

        tag.stage = TAG_STAGE.UNKNOWN;
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
      tag.ending |= OpenTagEnding.self;
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
      tag.stage = TAG_STAGE.VAR;
      this.skip(1); // skip /
      const expr = this.enterState(STATE.EXPRESSION);
      expr.skipOperators = true;
      expr.terminatedByWhitespace = true;
      expr.terminator = this.isConcise
        ? CONCISE_TAG_VAR_TERMINATORS
        : HTML_TAG_VAR_TERMINATORS;
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
      tag.stage = TAG_STAGE.ARGUMENT;
      this.skip(1); // skip (
      const expr = this.enterState(STATE.EXPRESSION);
      expr.skipOperators = true;
      expr.terminator = CODE.CLOSE_PAREN;
      this.rewind(1);
    } else if (code === CODE.PIPE && !tag.hasAttrs) {
      tag.stage = TAG_STAGE.PARAMS;
      this.skip(1); // skip |
      const expr = this.enterState(STATE.EXPRESSION);
      expr.skipOperators = true;
      expr.terminator = CODE.PIPE;
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
                "MISSING_TAG_VARIABLE",
                "A slash was found that was not followed by a variable name or lhs expression"
              );
            }

            this.handlers.onTagVar?.({
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
            const end = this.skip(1); // include )
            const value = {
              start: child.start,
              end: child.end,
            };

            if (this.consumeWhitespaceIfBefore("{")) {
              const attr = this.enterState(STATE.ATTRIBUTE);
              attr.start = start;
              attr.args = { start, end, value };
              tag.hasAttrs = true;
              this.rewind(1);
            } else {
              tag.hasArgs = true;
              this.handlers.onTagArgs?.({
                start,
                end,
                value,
              });
            }
            break;
          }
          case TAG_STAGE.PARAMS: {
            const end = this.skip(1); // include closing |
            this.handlers.onTagParams?.({
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
