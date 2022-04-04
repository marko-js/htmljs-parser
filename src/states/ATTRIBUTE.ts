import {
  STATE,
  CODE,
  isWhitespaceCode,
  StateDefinition,
  Range,
  Parser,
  Ranges,
  Meta,
  ErrorCode,
} from "../internal";

const enum ATTR_STAGE {
  UNKNOWN,
  NAME,
  VALUE,
  ARGUMENT,
  BLOCK,
}

export interface AttrMeta extends Meta {
  stage: ATTR_STAGE;
  name: undefined | Range;
  valueStart: number;
  args: boolean | Ranges.AttrMethod["params"];
  spread: boolean;
  bound: boolean;
}

const HTML_VALUE_TERMINATORS = [
  CODE.CLOSE_ANGLE_BRACKET,
  CODE.COMMA,
  [CODE.FORWARD_SLASH, CODE.CLOSE_ANGLE_BRACKET],
];

const CONCISE_VALUE_TERMINATORS = [
  CODE.CLOSE_SQUARE_BRACKET,
  CODE.SEMICOLON,
  CODE.COMMA,
];

const HTML_NAME_TERMINATORS = [
  CODE.CLOSE_ANGLE_BRACKET,
  CODE.COMMA,
  CODE.OPEN_PAREN,
  CODE.EQUAL,
  [CODE.COLON, CODE.EQUAL],
  [CODE.FORWARD_SLASH, CODE.CLOSE_ANGLE_BRACKET],
];

const CONCISE_NAME_TERMINATORS = [
  CODE.CLOSE_SQUARE_BRACKET,
  CODE.SEMICOLON,
  CODE.EQUAL,
  CODE.COMMA,
  CODE.OPEN_PAREN,
  [CODE.COLON, CODE.EQUAL],
];

// We enter STATE.ATTRIBUTE when we see a non-whitespace
// character after reading the tag name
export const ATTRIBUTE: StateDefinition<AttrMeta> = {
  name: "ATTRIBUTE",

  enter(parent, start) {
    return (this.activeAttr = {
      state: ATTRIBUTE as StateDefinition,
      parent,
      start,
      end: start,
      valueStart: start,
      stage: ATTR_STAGE.UNKNOWN,
      name: undefined,
      args: false,
      bound: false,
      spread: false,
    });
  },

  exit() {
    this.activeAttr = undefined;
  },

  char(code, attr) {
    if (isWhitespaceCode(code)) {
      return;
    } else if (
      code === CODE.EQUAL ||
      (code === CODE.COLON && this.lookAtCharCodeAhead(1) === CODE.EQUAL) ||
      (code === CODE.PERIOD && this.lookAheadFor(".."))
    ) {
      attr.valueStart = this.pos;

      if (code === CODE.COLON) {
        ensureAttrName(this, attr);
        attr.bound = true;
        this.pos += 2; // skip :=
        this.consumeWhitespace();
      } else if (code === CODE.PERIOD) {
        attr.spread = true;
        this.pos += 3; // skip ...
      } else {
        ensureAttrName(this, attr);
        this.pos++; // skip =
        this.consumeWhitespace();
      }

      attr.stage = ATTR_STAGE.VALUE;
      const expr = this.enterState(STATE.EXPRESSION);
      expr.terminatedByWhitespace = true;
      expr.terminator = this.isConcise
        ? CONCISE_VALUE_TERMINATORS
        : HTML_VALUE_TERMINATORS;

      this.pos--;
    } else if (code === CODE.OPEN_PAREN) {
      ensureAttrName(this, attr);
      attr.stage = ATTR_STAGE.ARGUMENT;
      this.pos++; // skip (
      this.enterState(STATE.EXPRESSION).terminator = CODE.CLOSE_PAREN;
      this.pos--;
    } else if (code === CODE.OPEN_CURLY_BRACE && attr.args) {
      ensureAttrName(this, attr);
      attr.stage = ATTR_STAGE.BLOCK;
      this.pos++; // skip {
      const expr = this.enterState(STATE.EXPRESSION);
      expr.terminatedByWhitespace = false;
      expr.terminator = CODE.CLOSE_CURLY_BRACE;
      this.pos--;
    } else if (attr.stage === ATTR_STAGE.UNKNOWN) {
      attr.stage = ATTR_STAGE.NAME;
      const expr = this.enterState(STATE.EXPRESSION);
      expr.terminatedByWhitespace = true;
      expr.skipOperators = true;
      expr.terminator = this.isConcise
        ? CONCISE_NAME_TERMINATORS
        : HTML_NAME_TERMINATORS;
      this.pos--;
    } else {
      this.exitState();
    }
  },

  eol() {
    if (this.isConcise) {
      this.exitState();
    }
  },

  eof(attr) {
    if (this.isConcise) {
      this.exitState();
    } else {
      this.emitError(
        attr,
        ErrorCode.MALFORMED_OPEN_TAG,
        'EOF reached while parsing attribute "' +
          (attr.name ? this.read(attr.name) : "default") +
          '" for the "' +
          this.read(this.activeTag!.tagName) +
          '" tag'
      );
    }
  },

  return(child, attr) {
    switch (attr.stage) {
      case ATTR_STAGE.NAME: {
        attr.name = {
          start: child.start,
          end: child.end,
        };

        this.options.onAttrName?.(attr.name);
        break;
      }
      case ATTR_STAGE.ARGUMENT: {
        if (attr.args) {
          this.emitError(
            child,
            ErrorCode.INVALID_ATTRIBUTE_ARGUMENT,
            "An attribute can only have one set of arguments"
          );
          return;
        }

        const start = child.start - 1; // include (
        const end = ++this.pos; // include )
        const value = {
          start: child.start,
          end: child.end,
        };

        if (this.consumeWhitespaceIfBefore("{")) {
          attr.args = {
            start,
            end,
            value,
          };
        } else {
          attr.args = true;
          this.options.onAttrArgs?.({
            start,
            end,
            value,
          });
        }

        break;
      }
      case ATTR_STAGE.BLOCK: {
        const params = attr.args as Ranges.Value;
        const start = params.start;
        const end = ++this.pos; // include }
        this.options.onAttrMethod?.({
          start,
          end,
          params,
          body: {
            start: child.start - 1, // include {
            end,
            value: {
              start: child.start,
              end: child.end,
            },
          },
        });
        this.exitState();
        break;
      }

      case ATTR_STAGE.VALUE: {
        if (child.start === child.end) {
          return this.emitError(
            child,
            ErrorCode.INVALID_ATTRIBUTE_VALUE,
            "Missing value for attribute"
          );
        }

        if (attr.spread) {
          this.options.onAttrSpread?.({
            start: attr.valueStart,
            end: child.end,
            value: {
              start: child.start,
              end: child.end,
            },
          });
        } else {
          this.options.onAttrValue?.({
            start: attr.valueStart,
            end: child.end,
            bound: attr.bound,
            value: {
              start: child.start,
              end: child.end,
            },
          });
        }

        this.exitState();
        break;
      }
    }
  },
};

function ensureAttrName(parser: Parser, attr: AttrMeta) {
  if (!attr.name) {
    parser.options.onAttrName?.({
      start: attr.start,
      end: attr.start,
    });
  }
}
