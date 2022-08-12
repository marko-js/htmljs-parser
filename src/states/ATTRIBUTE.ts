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
  matchesCloseCurlyBrace,
  matchesCloseParen,
} from "../internal";
import { TAG_STAGE } from "./OPEN_TAG";

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
      this.forward = 0;

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
      expr.operators = true;
      expr.terminatedByWhitespace = true;
      expr.shouldTerminate = this.isConcise
        ? this.activeTag!.stage === TAG_STAGE.ATTR_GROUP
          ? shouldTerminateConciseGroupedAttrValue
          : shouldTerminateConciseAttrValue
        : shouldTerminateHtmlAttrValue;
    } else if (code === CODE.OPEN_PAREN) {
      ensureAttrName(this, attr);
      attr.stage = ATTR_STAGE.ARGUMENT;
      this.pos++; // skip (
      this.forward = 0;
      this.enterState(STATE.EXPRESSION).shouldTerminate = matchesCloseParen;
    } else if (code === CODE.OPEN_CURLY_BRACE && attr.args) {
      ensureAttrName(this, attr);
      attr.stage = ATTR_STAGE.BLOCK;
      this.pos++; // skip {
      this.forward = 0;
      this.enterState(STATE.EXPRESSION).shouldTerminate =
        matchesCloseCurlyBrace;
    } else if (attr.stage === ATTR_STAGE.UNKNOWN) {
      attr.stage = ATTR_STAGE.NAME;
      this.forward = 0;
      const expr = this.enterState(STATE.EXPRESSION);
      expr.terminatedByWhitespace = true;
      expr.shouldTerminate = this.isConcise
        ? this.activeTag!.stage === TAG_STAGE.ATTR_GROUP
          ? shouldTerminateConciseGroupedAttrName
          : shouldTerminateConciseAttrName
        : shouldTerminateHtmlAttrName;
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

function shouldTerminateHtmlAttrName(code: number, data: string, pos: number) {
  switch (code) {
    case CODE.COMMA:
    case CODE.EQUAL:
    case CODE.OPEN_PAREN:
    case CODE.CLOSE_ANGLE_BRACKET:
      return true;
    case CODE.COLON:
      return data.charCodeAt(pos + 1) === CODE.EQUAL;
    case CODE.FORWARD_SLASH:
      return data.charCodeAt(pos + 1) === CODE.CLOSE_ANGLE_BRACKET;
    default:
      return false;
  }
}

function shouldTerminateHtmlAttrValue(
  this: STATE.ExpressionMeta,
  code: number,
  data: string,
  pos: number
) {
  switch (code) {
    case CODE.COMMA:
      return true;
    case CODE.FORWARD_SLASH:
      return data.charCodeAt(pos + 1) === CODE.CLOSE_ANGLE_BRACKET;
    case CODE.CLOSE_ANGLE_BRACKET:
      // Add special case for =>
      // We only look behind to match => if we're not at the start of the expression
      // otherwise this would match something like "<span class=>".
      return pos === this.start || data.charCodeAt(pos - 1) !== CODE.EQUAL;
    default:
      return false;
  }
}

function shouldTerminateConciseAttrName(
  code: number,
  data: string,
  pos: number
) {
  switch (code) {
    case CODE.COMMA:
    case CODE.EQUAL:
    case CODE.OPEN_PAREN:
    case CODE.SEMICOLON:
      return true;
    case CODE.COLON:
      return data.charCodeAt(pos + 1) === CODE.EQUAL;
    case CODE.HYPHEN:
      return (
        data.charCodeAt(pos + 1) === CODE.HYPHEN &&
        isWhitespaceCode(data.charCodeAt(pos - 1))
      );
    default:
      return false;
  }
}

function shouldTerminateConciseAttrValue(
  code: number,
  data: string,
  pos: number
) {
  switch (code) {
    case CODE.COMMA:
    case CODE.SEMICOLON:
      return true;
    case CODE.HYPHEN:
      return (
        data.charCodeAt(pos + 1) === CODE.HYPHEN &&
        isWhitespaceCode(data.charCodeAt(pos - 1))
      );
    default:
      return false;
  }
}

function shouldTerminateConciseGroupedAttrName(
  code: number,
  data: string,
  pos: number
) {
  switch (code) {
    case CODE.COMMA:
    case CODE.EQUAL:
    case CODE.OPEN_PAREN:
    case CODE.CLOSE_SQUARE_BRACKET:
      return true;
    case CODE.COLON:
      return data.charCodeAt(pos + 1) === CODE.EQUAL;
    default:
      return false;
  }
}

function shouldTerminateConciseGroupedAttrValue(code: number) {
  switch (code) {
    case CODE.COMMA:
    case CODE.CLOSE_SQUARE_BRACKET:
      return true;
    default:
      return false;
  }
}
