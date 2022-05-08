import {
  CODE,
  STATE,
  isWhitespaceCode,
  StateDefinition,
  Parser,
  Meta,
  ErrorCode,
} from "../internal";

export interface ExpressionMeta extends Meta {
  groupStack: number[];
  terminator: number | (number | number[])[];
  skipOperators: boolean;
  terminatedByEOL: boolean;
  terminatedByWhitespace: boolean;
}

const conciseOperatorPattern = buildOperatorPattern(true);
const htmlOperatorPattern = buildOperatorPattern(false);

export const EXPRESSION: StateDefinition<ExpressionMeta> = {
  name: "EXPRESSION",

  enter(parent, start) {
    return {
      state: EXPRESSION as StateDefinition,
      parent,
      start,
      end: start,
      groupStack: [],
      terminator: -1,
      skipOperators: false,
      terminatedByEOL: false,
      terminatedByWhitespace: false,
    };
  },

  exit() {},

  char(code, expression) {
    if (!expression.groupStack.length) {
      if (expression.terminatedByWhitespace && isWhitespaceCode(code)) {
        if (!checkForOperators(this, expression)) {
          this.exitState();
        }
        return;
      }

      if (
        typeof expression.terminator === "number"
          ? expression.terminator === code
          : checkForTerminators(this, code, expression.terminator)
      ) {
        this.exitState();
        return;
      }
    }

    switch (code) {
      case CODE.DOUBLE_QUOTE:
        this.enterState(STATE.STRING);
        break;
      case CODE.SINGLE_QUOTE:
        this.enterState(STATE.STRING).quoteCharCode = code;
        break;
      case CODE.BACKTICK:
        this.enterState(STATE.TEMPLATE_STRING);
        break;
      case CODE.FORWARD_SLASH:
        // Check next character to see if we are in a comment or regexp
        switch (this.lookAtCharCodeAhead(1)) {
          case CODE.FORWARD_SLASH:
            this.enterState(STATE.JS_COMMENT_LINE);
            this.pos++;
            break;
          case CODE.ASTERISK:
            this.enterState(STATE.JS_COMMENT_BLOCK);
            this.pos++;
            break;
          default: {
            if (
              !canCharCodeBeFollowedByDivision(
                this.getPreviousNonWhitespaceCharCode()
              )
            ) {
              this.enterState(STATE.REGULAR_EXPRESSION);
            }
            break;
          }
        }
        break;
      case CODE.OPEN_PAREN:
        expression.groupStack.push(CODE.CLOSE_PAREN);
        break;
      case CODE.OPEN_SQUARE_BRACKET:
        expression.groupStack.push(CODE.CLOSE_SQUARE_BRACKET);
        break;
      case CODE.OPEN_CURLY_BRACE:
        expression.groupStack.push(CODE.CLOSE_CURLY_BRACE);
        break;

      case CODE.CLOSE_PAREN:
      case CODE.CLOSE_SQUARE_BRACKET:
      case CODE.CLOSE_CURLY_BRACE: {
        if (!expression.groupStack.length) {
          return this.emitError(
            expression,
            ErrorCode.INVALID_EXPRESSION,
            'Mismatched group. A closing "' +
              String.fromCharCode(code) +
              '" character was found but it is not matched with a corresponding opening character.'
          );
        }

        const expectedCode = expression.groupStack.pop()!;
        if (expectedCode !== code) {
          return this.emitError(
            expression,
            ErrorCode.INVALID_EXPRESSION,
            'Mismatched group. A "' +
              String.fromCharCode(code) +
              '" character was found when "' +
              String.fromCharCode(expectedCode) +
              '" was expected.'
          );
        }

        break;
      }
    }
  },

  eol(_, expression) {
    if (
      !expression.groupStack.length &&
      (expression.terminatedByWhitespace || expression.terminatedByEOL)
    ) {
      this.exitState();
    }
  },

  eof(expression) {
    if (
      !expression.groupStack.length &&
      (this.isConcise || expression.terminatedByEOL)
    ) {
      this.exitState();
    } else {
      const { parent } = expression;

      switch (parent.state) {
        case STATE.ATTRIBUTE: {
          const attr = parent as STATE.AttrMeta;
          if (!attr.spread && !attr.name) {
            return this.emitError(
              expression,
              ErrorCode.MALFORMED_OPEN_TAG,
              'EOF reached while parsing attribute name for the "' +
                this.read(this.activeTag!.tagName) +
                '" tag'
            );
          }

          return this.emitError(
            expression,
            ErrorCode.MALFORMED_OPEN_TAG,
            `EOF reached while parsing attribute value for the ${
              attr.spread
                ? "..."
                : attr.name
                ? `"${this.read(attr.name)}"`
                : `"default"`
            } attribute`
          );
        }

        case STATE.TAG_NAME:
          return this.emitError(
            expression,
            ErrorCode.MALFORMED_OPEN_TAG,
            "EOF reached while parsing tag name"
          );

        case STATE.PLACEHOLDER:
          return this.emitError(
            expression,
            ErrorCode.MALFORMED_PLACEHOLDER,
            "EOF reached while parsing placeholder"
          );
      }

      return this.emitError(
        expression,
        ErrorCode.INVALID_EXPRESSION,
        "EOF reached while parsing expression"
      );
    }
  },

  return() {},
};

function buildOperatorPattern(isConcise: boolean) {
  const binary =
    "(?:[!~*%&^|?<]+=*)+" + // Any of these characters can always continue an expression
    "|:+(?!=)" + // Match a colon without matching a bound attribute
    "|[>/+=-]+=|=>" + // Match equality and multi char assignment operators w/o matching equals by itself
    "|(?<!\\+)[ \\t]*\\+(?:[ \\t]*\\+[ \\t]*\\+)*[ \\t]*(?!\\+)" + // We only match an odd number of plus's
    `|(?<!-)-${isConcise ? "" : "(?:[ \\t]*-[ \\t]*-)*[ \\t]*"}(?!-)` + // In concise mode we can't match multiple hyphens otherwise we can match an even number of hyphens
    `|(?<![/*])/(?![/*${isConcise ? "" : ">"}])` + // We only continue after a forward slash if it isn't //, /* (or /> in html mode)
    `|(?<!\\.)\\.(?!\\.)` + // We only continue after a dot if it isn't on newline in concise mode or a ...
    `|>${isConcise ? "+" : "{2,}"}` + // in html mode only consume closing angle brackets if it is >>
    "|\\b(?:in(?:stanceof)?|as|extends)(?=[ \\t]+[^=/,;:>])"; // We only continue after word operators (instanceof/in) when they are not followed by a terminator
  const unary =
    "\\b(?<![.]\\s*)(?:" +
    "a(?:sync|wait)" +
    "|keyof" +
    "|class" +
    "|function" +
    "|new" +
    "|typeof" +
    "|void" +
    ")\\b";
  const lookAheadPattern =
    "[ \\t]*(?:" + binary + ")[ \\t]*" + `|[ \\t]+(?=[{(])`; // if we have spaces followed by an opening bracket, we'll consume the spaces and let the expression state handle the brackets
  const lookBehindPattern = `(?<=${unary}|${binary})`;
  return new RegExp(`${lookAheadPattern}|${lookBehindPattern}`, "ym");
}

function checkForOperators(parser: Parser, expression: ExpressionMeta) {
  if (expression.skipOperators) {
    return false;
  }

  const pattern =
    parser.isConcise || expression.terminatedByEOL
      ? conciseOperatorPattern
      : htmlOperatorPattern;
  pattern.lastIndex = parser.pos;
  const matches = pattern.exec(parser.data);

  if (matches) {
    const [match] = matches;
    if (match.length === 0) {
      // We matched a look behind.
      parser.consumeWhitespace();
      parser.pos--;
    } else {
      // We matched a look ahead.
      parser.pos += match.length - 1;
    }
  } else {
    return false;
  }

  return true;
}

function checkForTerminators(
  parser: Parser,
  code: number,
  terminators: (number | number[])[]
) {
  outer: for (const terminator of terminators) {
    if (typeof terminator === "number") {
      if (code === terminator) return true;
    } else {
      if (terminator[0] === code) {
        for (let i = terminator.length; i-- > 1; ) {
          if (parser.data.charCodeAt(parser.pos + i) !== terminator[i])
            continue outer;
        }

        return true;
      }
    }
  }
}

function canCharCodeBeFollowedByDivision(code: number) {
  return (
    (code >= CODE.NUMBER_0 && code <= CODE.NUMBER_9) ||
    (code >= CODE.UPPER_A && code <= CODE.UPPER_Z) ||
    (code >= CODE.LOWER_A && code <= CODE.LOWER_Z) ||
    code === CODE.PERCENT ||
    code === CODE.CLOSE_PAREN ||
    code === CODE.PERIOD ||
    code === CODE.OPEN_ANGLE_BRACKET ||
    code === CODE.CLOSE_SQUARE_BRACKET ||
    code === CODE.CLOSE_CURLY_BRACE
  );
}
