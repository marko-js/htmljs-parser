import {
  CODE,
  STATE,
  isWhitespaceCode,
  StateDefinition,
  Ranges,
  Meta,
  TagType,
  ErrorCode,
  matchesPipe,
  matchesCloseParen,
  matchesCloseAngleBracket,
} from "../internal";

export enum TAG_STAGE {
  UNKNOWN,
  VAR,
  ARGUMENT,
  TYPES,
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
  hasParams: boolean;
  typeParams: undefined | Ranges.Value;
  hasShorthandId: boolean;
  selfClosed: boolean;
  indent: string;
  nestedIndent: string | undefined;
  parentTag: OpenTagMeta | undefined;
}

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
      hasParams: false,
      typeParams: undefined,
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
    if (
      this.isConcise &&
      tag.stage !== TAG_STAGE.ATTR_GROUP &&
      !this.consumeWhitespaceIfBefore(",")
    ) {
      // In concise mode we always end the open tag unless we're in an attr group or the next line starts with ",".
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

    if (code === CODE.FORWARD_SLASH) {
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
      }
    }

    if (isWhitespaceCode(code)) {
      // ignore whitespace within element...
    } else if (code === CODE.COMMA) {
      this.pos++; // skip ,
      this.forward = 0;
      this.consumeWhitespace();
    } else {
      this.forward = 0;

      if (tag.hasAttrs) {
        this.enterState(STATE.ATTRIBUTE);
      } else if (tag.tagName) {
        switch (code) {
          case CODE.FORWARD_SLASH: {
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
            expr.operators = true;
            expr.terminatedByWhitespace = true;
            expr.shouldTerminate = this.isConcise
              ? shouldTerminateConciseTagVar
              : shouldTerminateHtmlTagVar;
            break;
          }

          case CODE.OPEN_PAREN:
            if (tag.hasArgs) {
              this.emitError(
                this.pos,
                ErrorCode.INVALID_TAG_ARGUMENT,
                "A tag can only have one argument"
              );
              return;
            }

            tag.hasArgs = true;
            tag.stage = TAG_STAGE.ARGUMENT;
            this.pos++; // skip (
            this.enterState(STATE.EXPRESSION).shouldTerminate =
              matchesCloseParen;
            break;

          case CODE.PIPE:
            if (tag.hasParams) {
              this.emitError(
                this.pos,
                ErrorCode.INVALID_TAG_PARAMS,
                "A tag can only specify parameters once"
              );
              return;
            }

            tag.hasParams = true;
            tag.stage = TAG_STAGE.PARAMS;
            this.pos++; // skip |
            this.enterState(STATE.EXPRESSION).shouldTerminate = matchesPipe;
            break;

          case CODE.OPEN_ANGLE_BRACKET:
            tag.stage = TAG_STAGE.TYPES;
            this.pos++; // skip <
            this.enterState(STATE.EXPRESSION).shouldTerminate =
              matchesCloseAngleBracket;
            break;

          default:
            tag.hasAttrs = true;
            this.enterState(STATE.ATTRIBUTE);
        }
      } else {
        this.enterState(STATE.TAG_NAME);
      }
    }
  },

  return(child, tag) {
    if (child.state !== STATE.EXPRESSION) return;

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
        const { typeParams } = tag;
        const start = child.start - 1; // include (
        const end = ++this.pos; // include )
        const value = {
          start: child.start,
          end: child.end,
        };

        if (this.consumeWhitespaceIfBefore("{")) {
          const attr = this.enterState(STATE.ATTRIBUTE);

          if (typeParams) {
            attr.start = typeParams.start;
            attr.typeParams = typeParams;
          } else {
            attr.start = start;
          }

          attr.args = { start, end, value };
          this.forward = 0;
          tag.hasAttrs = true;
        } else {
          if (typeParams) {
            this.emitError(
              child,
              ErrorCode.INVALID_TAG_TYPES,
              "Unexpected types. Type arguments must directly follow a tag name and type paremeters must precede a method or tag parameters."
            );
            break;
          }

          this.options.onTagArgs?.({
            start,
            end,
            value,
          });
        }
        break;
      }
      case TAG_STAGE.TYPES: {
        const { typeParams, hasParams, hasArgs } = tag;
        const end = ++this.pos; // include >
        const types: Ranges.Value = {
          start: child.start - 1, // include <
          end,
          value: {
            start: child.start,
            end: child.end,
          },
        };

        if (tag.tagName.end === types.start) {
          // When we match types just after the tag name then we are dealing with a type argument.
          this.options.onTagTypeArgs?.(types);
          break;
        }

        this.consumeWhitespace();
        const nextCode = this.lookAtCharCodeAhead(0);

        if (nextCode === CODE.PIPE && !hasParams) {
          this.options.onTagTypeParams?.(types);
        } else if (
          nextCode === CODE.OPEN_PAREN &&
          !(typeParams || hasParams || hasArgs)
        ) {
          tag.typeParams = types;
        } else {
          this.emitError(
            child,
            ErrorCode.INVALID_TAG_TYPES,
            "Unexpected types. Type arguments must directly follow a tag name and type paremeters must precede a method or tag parameters."
          );
        }

        break;
      }
      case TAG_STAGE.PARAMS: {
        const end = ++this.pos; // include closing |
        this.options.onTagParams?.({
          start: child.start - 1,
          end,
          value: {
            start: child.start,
            end: child.end,
          },
        });
        break;
      }
    }
  },
};

function shouldTerminateConciseTagVar(code: number, data: string, pos: number) {
  switch (code) {
    case CODE.COMMA:
    case CODE.EQUAL:
    case CODE.PIPE:
    case CODE.OPEN_PAREN:
    case CODE.SEMICOLON:
    case CODE.OPEN_ANGLE_BRACKET:
      return true;
    case CODE.HYPHEN:
      return data.charCodeAt(pos + 1) === CODE.HYPHEN;
    case CODE.COLON:
      return data.charCodeAt(pos + 1) === CODE.EQUAL;
    default:
      return false;
  }
}

function shouldTerminateHtmlTagVar(code: number, data: string, pos: number) {
  switch (code) {
    case CODE.PIPE:
    case CODE.COMMA:
    case CODE.EQUAL:
    case CODE.OPEN_PAREN:
    case CODE.CLOSE_ANGLE_BRACKET:
    case CODE.OPEN_ANGLE_BRACKET:
      return true;
    case CODE.COLON:
      return data.charCodeAt(pos + 1) === CODE.EQUAL;
    case CODE.FORWARD_SLASH:
      return data.charCodeAt(pos + 1) === CODE.CLOSE_ANGLE_BRACKET;
    default:
      return false;
  }
}
