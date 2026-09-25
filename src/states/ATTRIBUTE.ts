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
  /** A pending `async`, held until the args close reveals what it modifies. */
  async: undefined | Range;
  /** Range of an `async` keyword already confirmed to modify a method. */
  asyncMethod: undefined | Range;
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
      async: undefined,
      asyncMethod: undefined,
    });
  },

  exit(attr) {
    // Catches the paths that leave the attribute without resolving a pending
    // `async`, notably EOF part way through typing `<div async onCl`.
    flushPendingAsync(this, attr);
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

      if (code === CODE.OPEN_ANGLE_BRACKET && this.lookAheadFor("!--")) {
        this.exitState();
        return; // the open tag reports the html comment
      }

      if (
        code === CODE.EQUAL ||
        (code === CODE.COLON && data.charCodeAt(this.pos + 1) === CODE.EQUAL) ||
        (code === CODE.PERIOD && this.lookAheadFor(".."))
      ) {
        attr.valueStart = this.pos;
        flushPendingAsync(this, attr); // a value means no method follows

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
        // With a pending `async` the name is emitted once we know whether this
        // is a method, since `<foo async(1)/>` is an attribute named `async`.
        if (!attr.async) ensureAttrName(this, attr);
        attr.stage = ATTR_STAGE.ARGUMENT;
        this.pos++; // skip (
        this.enterState(STATE.EXPRESSION).shouldTerminate = matchesCloseParen;
        return;
      } else if (
        code === CODE.OPEN_ANGLE_BRACKET &&
        // A pending `async` leaves the stage UNKNOWN, but type params can
        // still follow it for a default attribute method.
        (attr.stage === ATTR_STAGE.NAME || attr.async)
      ) {
        if (STATE.checkForConciseCloseTag(this)) return;
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
          if (STATE.checkForConciseCloseTag(this)) return;
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
        flushPendingAsync(this, attr);
        this.exitState();
        return;
      }
    }

    // EOF
    flushPendingAsync(this, attr);
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
        const name = {
          start: child.start,
          end: child.end,
        };

        if (!attr.async && !attr.name && isAsyncMethodPrefix(this, name)) {
          // Both names stay unemitted until a method is confirmed or
          // flushPendingAsync replays them as ordinary attributes.
          attr.async = name;
          attr.stage = ATTR_STAGE.UNKNOWN;
          return;
        }

        attr.name = name;

        // With a pending `async` this name is emitted later, once we know
        // which attribute it belongs to.
        if (!attr.async) this.options.onAttrName?.(attr.name);

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
          // A shorthand method: any pending `async` is a modifier on this
          // method rather than an attribute, so only the name is emitted.
          if (attr.async) {
            // A default attribute method has no name to emit here; the "{"
            // branch of parse emits its empty name range.
            if (attr.name) this.options.onAttrName?.(attr.name);
            attr.asyncMethod = attr.async;
            attr.async = undefined;
          }

          attr.args = {
            start,
            end,
            value,
          };
        } else if (attr.typeParams) {
          flushPendingAsync(this, attr);
          this.emitError(
            child,
            ErrorCode.INVALID_ATTRIBUTE_ARGUMENT,
            "An attribute cannot have both type parameters and arguments",
          );
        } else {
          flushPendingAsync(this, attr); // args without a body is not a method
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
        const { typeParams, asyncMethod } = attr;
        const start = asyncMethod
          ? asyncMethod.start
          : typeParams
            ? typeParams.start
            : params.start;

        this.options.onAttrMethod?.({
          start,
          end,
          params,
          typeParams,
          async: asyncMethod !== undefined,
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
          flushPendingAsync(this, attr);
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

        if ((child as STATE.ExpressionMeta).leadingCommentsEnd === child.end) {
          return this.emitError(
            child,
            ErrorCode.INVALID_ATTRIBUTE_VALUE,
            `The ${
              attr.spread
                ? "spread"
                : attr.name
                  ? `"${this.read(attr.name)}"`
                  : "default"
            } attribute value is only a comment; add a value after it.`,
          );
        }

        if (
          !this.isConcise &&
          (detectAmbiguousCloseAngleBracket(this, child) ||
            detectSplitTypeArgument(this, child as STATE.ExpressionMeta))
        ) {
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

/**
 * An html tag ends at the ">" meant to close a lone type argument, eg in
 * `<let/s=new Set<string>()>`. It misfires only on a body like `(c)>` after `a<b`.
 */
function detectSplitTypeArgument(parser: Parser, value: STATE.ExpressionMeta) {
  const { data, maxPos } = parser;
  const tagEnd = value.end;
  if (
    data.charCodeAt(tagEnd) !== CODE.CLOSE_ANGLE_BRACKET ||
    data.charCodeAt(tagEnd + 1) !== CODE.OPEN_PAREN
  ) {
    return false;
  }

  // Leading comments, eg `/* @__PURE__ */`, may precede the call.
  const callStart = value.leadingCommentsEnd;
  const typeStart = lookBehindForName(data, callStart, tagEnd);
  if (data.charCodeAt(typeStart - 1) !== CODE.OPEN_ANGLE_BRACKET) return false;

  const calleeStart = lookBehindForName(data, callStart, typeStart - 1);
  if (calleeStart === -1) return false;

  // Only `new` may come before the callee.
  if (calleeStart !== callStart) {
    let newEnd = calleeStart;
    while (isWhitespaceCode(data.charCodeAt(newEnd - 1))) newEnd--;
    if (
      newEnd === calleeStart ||
      newEnd - 3 !== callStart ||
      !parser.lookAheadFor("new", callStart)
    ) {
      return false;
    }
  }

  // The call's arguments, then the ">" or "/>" meant to end the tag.
  let groupEnd = tagEnd + 1;
  let depth = 0;
  do {
    const code = data.charCodeAt(groupEnd);
    switch (code) {
      case CODE.OPEN_PAREN:
        depth++;
        break;
      case CODE.CLOSE_PAREN:
        depth--;
        break;
      case CODE.DOUBLE_QUOTE:
      case CODE.SINGLE_QUOTE:
      case CODE.BACKTICK:
        while (++groupEnd < maxPos && data.charCodeAt(groupEnd) !== code) {
          if (data.charCodeAt(groupEnd) === CODE.BACK_SLASH) groupEnd++;
        }
        break;
    }
    groupEnd++;
  } while (depth && groupEnd < maxPos);

  let pos = groupEnd;
  while (isIndentCode(data.charCodeAt(pos))) pos++;
  if (
    depth ||
    !(
      data.charCodeAt(pos) === CODE.CLOSE_ANGLE_BRACKET ||
      (data.charCodeAt(pos) === CODE.FORWARD_SLASH &&
        data.charCodeAt(pos + 1) === CODE.CLOSE_ANGLE_BRACKET)
    )
  ) {
    return false;
  }

  const call = data.slice(value.start, groupEnd);
  parser.emitError(
    { start: value.start, end: groupEnd },
    ErrorCode.AMBIGUOUS_ATTRIBUTE_VALUE,
    'The ">" closing this type argument ends the tag, leaving a "<" comparison. Wrap the value in parentheses: "(' +
      (call.includes("\n")
        ? data.slice(value.start, tagEnd + 2) + "…)"
        : call) +
      ')".',
  );
  return true;
}

/**
 * The start of the identifier or dotted member name, eg `Foo.Bar`, that ends at
 * `end` and starts no earlier than `min`, or -1 if there is none.
 */
function lookBehindForName(data: string, min: number, end: number) {
  let pos = end;
  for (;;) {
    const segmentEnd = pos;
    while (pos > min && isWordCode(data.charCodeAt(pos - 1))) pos--;
    const code = data.charCodeAt(pos);
    if (
      pos === segmentEnd ||
      (code >= CODE.NUMBER_0 && code <= CODE.NUMBER_9)
    ) {
      return -1;
    }
    if (pos === min || data.charCodeAt(pos - 1) !== CODE.PERIOD) return pos;
    pos--; // skip .
  }
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

/**
 * Whether a method name, or a default attribute method's params, follows the
 * keyword. Anything else keeps `async` ordinary, eg `<script async src=x>`.
 */
function isAsyncMethodPrefix(parser: Parser, name: Range) {
  const { data } = parser;
  if (
    name.end - name.start !== 5 ||
    // Cheap reject for the many five character attribute names, eg
    // "class", "style", "value", before comparing the rest.
    data.charCodeAt(name.start) !== CODE.LOWER_A ||
    !parser.lookAheadFor("async", name.start)
  ) {
    return false;
  }

  // In concise mode a newline ends the attribute, so a name on the following
  // line belongs to a separate attribute and cannot be this method's name.
  const skip = parser.isConcise ? isIndentCode : isWhitespaceCode;
  let pos = parser.pos;
  while (skip(data.charCodeAt(pos))) pos++;

  const code = data.charCodeAt(pos);
  return (
    isWordCode(code) || // the method name
    code === CODE.OPEN_PAREN || // a default attribute method's params
    // a default attribute method's type params, but not a close tag
    (code === CODE.OPEN_ANGLE_BRACKET &&
      data.charCodeAt(pos + 1) !== CODE.FORWARD_SLASH)
  );
}

/**
 * Replays a deferred `async`, and the name held behind it, as attribute names
 * once the attribute turns out not to be a shorthand method.
 */
function flushPendingAsync(parser: Parser, attr: AttrMeta) {
  if (attr.async) {
    parser.options.onAttrName?.(attr.async);
    attr.async = undefined;
    if (attr.name) parser.options.onAttrName?.(attr.name);
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
