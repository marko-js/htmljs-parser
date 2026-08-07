import {
  isIndentCode,
  isWhitespaceCode,
  isWordCode,
  matchesCloseAngleBracket,
  matchesCloseCurlyBrace,
  matchesCloseParen,
  type Meta,
  Parser,
  type Range,
  type Ranges,
  STATE,
  type StateDefinition,
} from "../internal.ts";
import * as CODE from "../util/codes.ts";
import * as ErrorCode from "../util/error-code.ts";
import * as ATTR_STAGE from "./attr-stage.ts";
import * as TAG_STAGE from "./tag-stage.ts";

export interface AttrMeta extends Meta {
  stage: ATTR_STAGE.AttrStage;
  name: undefined | Range;
  valueStart: number;
  args: boolean | Ranges.AttrMethod["params"];
  typeParams: undefined | Ranges.Value;
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
      typeParams: undefined,
      bound: false,
      spread: false,
    });
  },

  exit() {
    this.activeAttr = undefined;
  },

  parse(data, maxPos, attr) {
    while (this.pos < maxPos) {
      const code = data.charCodeAt(this.pos);

      if (code === CODE.NEWLINE || code === CODE.CARRIAGE_RETURN) {
        if (this.isConcise) {
          this.exitState();
          return; // parent handles newline
        }
        this.pos +=
          code === CODE.CARRIAGE_RETURN &&
          data.charCodeAt(this.pos + 1) === CODE.NEWLINE
            ? 2
            : 1;
        continue;
      }

      if (isWhitespaceCode(code)) {
        this.pos++;
        continue;
      }

      if (
        code === CODE.EQUAL ||
        (code === CODE.COLON && data.charCodeAt(this.pos + 1) === CODE.EQUAL) ||
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
        expr.operators = true;
        expr.terminatedByWhitespace = true;
        expr.shouldTerminate = this.isConcise
          ? this.activeTag!.stage === TAG_STAGE.ATTR_GROUP
            ? shouldTerminateConciseGroupedAttrValue
            : shouldTerminateConciseAttrValue
          : shouldTerminateHtmlAttrValue;
        return;
      } else if (code === CODE.OPEN_PAREN) {
        ensureAttrName(this, attr);
        attr.stage = ATTR_STAGE.ARGUMENT;
        this.pos++; // skip (
        this.enterState(STATE.EXPRESSION).shouldTerminate = matchesCloseParen;
        return;
      } else if (
        code === CODE.OPEN_ANGLE_BRACKET &&
        attr.stage === ATTR_STAGE.NAME
      ) {
        attr.stage = ATTR_STAGE.TYPE_PARAMS;
        this.pos++; // skip <
        const expr = this.enterState(STATE.EXPRESSION);
        expr.inType = true;
        expr.forceType = true;
        expr.shouldTerminate = matchesCloseAngleBracket;
        return;
      } else if (code === CODE.OPEN_CURLY_BRACE && attr.args) {
        ensureAttrName(this, attr);
        attr.stage = ATTR_STAGE.BLOCK;
        this.pos++; // skip {
        this.enterState(STATE.EXPRESSION).shouldTerminate =
          matchesCloseCurlyBrace;
        return;
      } else if (attr.stage === ATTR_STAGE.UNKNOWN) {
        if (code === CODE.OPEN_ANGLE_BRACKET) {
          if (data.charCodeAt(this.pos + 1) === CODE.FORWARD_SLASH) {
            return this.emitError(
              this.pos,
              ErrorCode.MALFORMED_OPEN_TAG,
              'A close tag was found before the "' +
                this.read(this.activeTag!.tagName) +
                '" open tag was closed. If the "</" was intended as part of an attribute expression (eg a less-than comparison), wrap the value in parentheses.',
            );
          }
          return this.emitError(
            this.pos,
            ErrorCode.INVALID_ATTRIBUTE_NAME,
            'Invalid attribute name. Attribute name cannot begin with the "<" character.',
          );
        }

        attr.stage = ATTR_STAGE.NAME;
        // Don't advance pos: EXPRESSION starts at current char
        const expr = this.enterState(STATE.EXPRESSION);
        expr.terminatedByWhitespace = true;
        expr.shouldTerminate = this.isConcise
          ? this.activeTag!.stage === TAG_STAGE.ATTR_GROUP
            ? shouldTerminateConciseGroupedAttrName
            : shouldTerminateConciseAttrName
          : shouldTerminateHtmlAttrName;
        return;
      } else {
        this.exitState();
        return;
      }
    }

    // EOF
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
          '" tag',
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

        if (!this.isConcise && detectAmbiguousCloseAngleBracket(this, child)) {
          return;
        }
        break;
      }
      case ATTR_STAGE.ARGUMENT: {
        if (attr.args) {
          this.emitError(
            child,
            ErrorCode.INVALID_ATTRIBUTE_ARGUMENT,
            "An attribute can only have one set of arguments",
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
        } else if (attr.typeParams) {
          this.emitError(
            child,
            ErrorCode.INVALID_ATTRIBUTE_ARGUMENT,
            "An attribute cannot have both type parameters and arguments",
          );
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
        const end = ++this.pos; // include }
        const { typeParams } = attr;
        const start = typeParams ? typeParams.start : params.start;

        this.options.onAttrMethod?.({
          start,
          end,
          params,
          typeParams,
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

      case ATTR_STAGE.TYPE_PARAMS: {
        const start = child.start - 1; // include <
        const end = ++this.pos; // include >

        if (!this.consumeWhitespaceIfBefore("(")) {
          return this.emitError(
            child,
            ErrorCode.INVALID_ATTR_TYPE_PARAMS,
            "Attribute cannot contain type parameters unless it is a shorthand method",
          );
        }

        attr.typeParams = {
          start,
          end,
          value: {
            start: child.start,
            end: child.end,
          },
        };

        break;
      }

      case ATTR_STAGE.VALUE: {
        if (child.start === child.end) {
          return this.emitError(
            child,
            ErrorCode.INVALID_ATTRIBUTE_VALUE,
            "Missing value for attribute",
          );
        }

        if (!this.isConcise && detectAmbiguousCloseAngleBracket(this, child)) {
          return;
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

/**
 * In HTML mode a ">" after an unenclosed attribute always ends the tag, but a
 * whitespace preceded ">" is often intended as a comparison operator, eg
 * `<if=count > 10>` which actually parses as `<if=count>` followed by the
 * body content " 10>". Both interpretations are valid so this is truly
 * ambiguous; rather than silently picking one, when the attribute is
 * followed by whitespace and a ">" this looks ahead for the telltale tail of
 * a split expression — operator connected operands ending in a second ">"
 * (or "/>") on the same line — and reports an error that shows how to
 * disambiguate. Anything else (including anything this lookahead does not
 * understand, such as string literals) keeps the existing tag-end behavior.
 */
function detectAmbiguousCloseAngleBracket(parser: Parser, child: Meta) {
  const { data, maxPos } = parser;
  let pos = parser.pos;

  // Only an expression that stopped at horizontal whitespace followed by ">"
  // on the same line is ambiguous.
  if (!isIndentCode(data.charCodeAt(pos))) return false;
  do pos++;
  while (isIndentCode(data.charCodeAt(pos)));
  if (data.charCodeAt(pos) !== CODE.CLOSE_ANGLE_BRACKET) return false;

  let sawOperand = false;
  // Set when an operand ended and another operand would need an operator
  // between them, eg text like "10 items>" is not a split expression.
  let operatorPending = false;
  // Tracks "(" and "[" nesting; the tag can only end at the top level.
  let groupDepth = 0;
  // A whitespace preceded ">=" is always continued as a comparison by
  // shouldTerminateHtmlAttrValue, so the ">" here is never part of a ">=".
  let lookPos = pos + 1;

  for (; lookPos < maxPos; lookPos++) {
    const code = data.charCodeAt(lookPos);

    // A ">=" (anywhere) or a grouped ">" is a comparison, not the tag end.
    if (
      code === CODE.CLOSE_ANGLE_BRACKET &&
      (groupDepth || data.charCodeAt(lookPos + 1) === CODE.EQUAL)
    ) {
      if (data.charCodeAt(lookPos + 1) === CODE.EQUAL) lookPos++; // skip =
      operatorPending = false;
      continue;
    }

    if (
      !groupDepth &&
      (code === CODE.CLOSE_ANGLE_BRACKET ||
        (code === CODE.FORWARD_SLASH &&
          data.charCodeAt(lookPos + 1) === CODE.CLOSE_ANGLE_BRACKET))
    ) {
      // Ignore horizontal whitespace between the final operand and the ">".
      let exprEnd = lookPos;
      while (isIndentCode(data.charCodeAt(exprEnd - 1))) exprEnd--;
      if (sawOperand && isOperandEndCode(data.charCodeAt(exprEnd - 1))) {
        const expression = data.slice(child.start, exprEnd);
        const tail = data
          .slice(pos + 1, lookPos + (code === CODE.FORWARD_SLASH ? 2 : 1))
          .trim();
        parser.emitError(
          { start: child.start, end: exprEnd },
          ErrorCode.AMBIGUOUS_ATTRIBUTE_VALUE,
          'Ambiguous ">" in attribute. A ">" preceded by whitespace ends the tag. If "' +
            expression +
            '" was intended as a single expression, wrap it in parentheses, eg "=(' +
            expression +
            ')". If the tag was instead meant to end at the first ">", leaving "' +
            tail +
            '" as body content, remove the whitespace before that ">".',
        );
        return true;
      }
      return false;
    }

    if (isWordCode(code)) {
      if (operatorPending) return false;
      sawOperand = true;
      continue;
    }

    if (isIndentCode(code)) {
      if (sawOperand && isOperandEndCode(data.charCodeAt(lookPos - 1))) {
        operatorPending = true;
      }
      continue;
    }

    switch (code) {
      case CODE.EQUAL:
        // An "=>" arrow connects operands; a bare "=" is not understood.
        if (data.charCodeAt(lookPos + 1) !== CODE.CLOSE_ANGLE_BRACKET) {
          return false;
        }
        lookPos++; // skip the ">" of "=>"
        operatorPending = false;
        continue;
      case CODE.FORWARD_SLASH: {
        // A "/" is only understood as division; where a regex could start
        // (no operand before it) this does not look like a split expression.
        let prevPos = lookPos - 1;
        while (isIndentCode(data.charCodeAt(prevPos))) prevPos--;
        if (!isOperandEndCode(data.charCodeAt(prevPos))) return false;
        operatorPending = false;
        continue;
      }
      case CODE.OPEN_PAREN:
        groupDepth++;
        operatorPending = false;
        continue;
      case CODE.OPEN_SQUARE_BRACKET:
        groupDepth++;
        operatorPending = false;
        continue;
      case CODE.CLOSE_PAREN:
      case CODE.CLOSE_SQUARE_BRACKET:
        // An unmatched closer means this is not a split expression.
        if (!groupDepth) return false;
        groupDepth--;
        operatorPending = false;
        continue;
      case CODE.AMPERSAND:
      case CODE.ASTERISK:
      case CODE.CARET:
      case CODE.COLON:
      case CODE.EXCLAMATION:
      case CODE.HYPHEN:
      case CODE.PERCENT:
      case CODE.PERIOD:
      case CODE.PIPE:
      case CODE.PLUS:
      case CODE.QUESTION:
      case CODE.TILDE:
        operatorPending = false;
        continue;
      default:
        // Newlines, "<", quotes, and anything else not recognized above
        // means this does not look like a split expression.
        return false;
    }
  }

  return false;
}

function isOperandEndCode(code: number) {
  switch (code) {
    case CODE.CLOSE_PAREN:
    case CODE.CLOSE_SQUARE_BRACKET:
      return true;
    default:
      return isWordCode(code);
  }
}

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

export function shouldTerminateHtmlAttrValue(
  this: STATE.ExpressionMeta,
  code: number,
  data: string,
  pos: number,
) {
  switch (code) {
    case CODE.COMMA:
      return true;
    case CODE.FORWARD_SLASH:
      return data.charCodeAt(pos + 1) === CODE.CLOSE_ANGLE_BRACKET;
    case CODE.CLOSE_ANGLE_BRACKET: {
      // We only look around the ">" if we're not at the start of the expression
      // otherwise this would match something like "<span class=>".
      if (pos === this.start) return true;
      // Add special case for =>
      if (data.charCodeAt(pos - 1) === CODE.EQUAL) return false;
      // A whitespace preceded ">" immediately followed by "=" is always a ">="
      // comparison operator, since a closed tag would instead put the "=" in
      // its body content, eg `<if=count >= 10>`.
      return !(
        isWhitespaceCode(data.charCodeAt(pos - 1)) &&
        data.charCodeAt(pos + 1) === CODE.EQUAL
      );
    }
    default:
      return false;
  }
}

function shouldTerminateConciseAttrName(
  code: number,
  data: string,
  pos: number,
) {
  switch (code) {
    case CODE.COMMA:
    case CODE.EQUAL:
    case CODE.OPEN_PAREN:
    case CODE.SEMICOLON:
    case CODE.OPEN_ANGLE_BRACKET:
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

export function shouldTerminateConciseAttrValue(
  code: number,
  data: string,
  pos: number,
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
  pos: number,
) {
  switch (code) {
    case CODE.COMMA:
    case CODE.EQUAL:
    case CODE.OPEN_PAREN:
    case CODE.CLOSE_SQUARE_BRACKET:
    case CODE.OPEN_ANGLE_BRACKET:
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
