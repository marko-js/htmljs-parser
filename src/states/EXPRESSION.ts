import {
  CODE,
  STATE,
  isWhitespaceCode,
  StateDefinition,
  Range,
} from "../internal";

export interface ExpressionRange extends Range {
  groupStack: number[];
  terminator?: string | string[];
  allowEscapes: boolean;
  skipOperators: boolean;
  terminatedByEOL: boolean;
  terminatedByWhitespace: boolean;
}

const conciseOperatorPattern = buildOperatorPattern(true);
const htmlOperatorPattern = buildOperatorPattern(false);

export const EXPRESSION: StateDefinition<ExpressionRange> = {
  name: "EXPRESSION",

  enter(expression) {
    expression.groupStack = [];
    expression.allowEscapes = expression.allowEscapes === true;
    expression.skipOperators = expression.skipOperators === true;
    expression.terminatedByEOL = expression.terminatedByEOL === true;
    expression.terminatedByWhitespace =
      expression.terminatedByWhitespace === true;
  },

  eol(_, expression) {
    if (
      expression.groupStack.length === 0 &&
      (expression.terminatedByWhitespace || expression.terminatedByEOL)
    ) {
      this.exitState();
    }
  },

  eof(expression) {
    if (
      expression.groupStack.length === 0 &&
      (this.isConcise || expression.terminatedByEOL)
    ) {
      this.exitState();
    } else {
      // TODO: refactor to avoid using parentState
      const parentState = this.stateStack[this.stateStack.length - 2];

      if (parentState === STATE.ATTRIBUTE) {
        const attr = this.activeAttr!;
        if (!attr.default && !attr.spread && !attr.name) {
          return this.notifyError(
            expression,
            "MALFORMED_OPEN_TAG",
            'EOF reached while parsing attribute name for the "' +
              this.read(this.activeTag!.tagName) +
              '" tag'
          );
        }

        return this.notifyError(
          expression,
          "MALFORMED_OPEN_TAG",
          `EOF reached while parsing attribute value for the ${
            attr.default
              ? "default"
              : attr.spread
              ? "..."
              : `"${this.read(attr.name!)}"`
          } attribute`
        );
      } else if (parentState === STATE.TAG_NAME) {
        return this.notifyError(
          expression,
          "MALFORMED_OPEN_TAG",
          "EOF reached while parsing tag name"
        );
      } else if (parentState === STATE.PLACEHOLDER) {
        return this.notifyError(
          expression,
          "MALFORMED_PLACEHOLDER",
          "EOF reached while parsing placeholder"
        );
      }

      return this.notifyError(
        expression,
        "INVALID_EXPRESSION",
        "EOF reached while parsing expression"
      );
    }
  },

  char(ch, code, expression) {
    const depth = expression.groupStack.length;

    if (depth === 0) {
      if (expression.terminatedByWhitespace && isWhitespaceCode(code)) {
        if (expression.skipOperators) {
          this.exitState();
        } else {
          const pattern = this.isConcise
            ? conciseOperatorPattern
            : htmlOperatorPattern;
          pattern.lastIndex = this.pos;
          const matches = pattern.exec(this.data);

          if (matches) {
            const [match] = matches;
            if (match.length === 0) {
              // We matched a look behind.
              this.consumeWhitespace();
              this.rewind(1);
            } else {
              // We matched a look ahead.
              this.skip(match.length - 1);
            }
          } else {
            this.exitState();
          }
        }

        return;
      }

      if (
        expression.terminator &&
        this.checkForTerminator(expression.terminator, ch)
      ) {
        this.exitState();
        return;
      }

      if (expression.allowEscapes && code === CODE.BACK_SLASH) {
        this.skip(1);
        return;
      }
    }

    switch (code) {
      case CODE.SINGLE_QUOTE:
      case CODE.DOUBLE_QUOTE:
        this.enterState(STATE.STRING, {
          quoteCharCode: code,
        });
        break;
      case CODE.BACKTICK:
        this.enterState(STATE.TEMPLATE_STRING);
        break;
      case CODE.FORWARD_SLASH:
        // Check next character to see if we are in a comment or regexp
        switch (this.lookAtCharCodeAhead(1)) {
          case CODE.FORWARD_SLASH:
            this.enterState(STATE.JS_COMMENT_LINE);
            this.skip(1);
            break;
          case CODE.ASTERISK:
            this.enterState(STATE.JS_COMMENT_BLOCK);
            this.skip(1);
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
        if (depth === 0) {
          return this.notifyError(
            expression,
            "INVALID_EXPRESSION",
            'Mismatched group. A closing "' +
              ch +
              '" character was found but it is not matched with a corresponding opening character.'
          );
        }

        const expectedCode = expression.groupStack.pop()!;
        if (expectedCode !== code) {
          return this.notifyError(
            expression,
            "INVALID_EXPRESSION",
            'Mismatched group. A "' +
              ch +
              '" character was found when "' +
              String.fromCharCode(expectedCode) +
              '" was expected.'
          );
        }

        break;
      }
    }
  },
};

function buildOperatorPattern(isConcise: boolean) {
  const unary = ["typeof", "new", "void"];
  const operators = [
    //Multiplicative Operators
    "*",
    "/",
    "%",

    //Additive Operators
    "+",
    "-",

    //Bitwise Shift Operators
    "<<",
    ">>",
    ">>>",

    //Relational Operators
    "<",
    "<=",
    ">=",

    // Readable Operators
    // NOTE: These become reserved words and cannot be used as attribute names
    "instanceof",
    "in",

    // Equality Operators
    "==",
    "!=",
    "===",
    "!==",

    // Binary Bitwise Operators
    "&",
    "^",
    "|",

    // Binary Logical Operators
    "&&",
    "||",

    // Ternary Operator
    "?",
    ":",

    // Special
    // In concise mode we can support >, and in html mode we can support [
    isConcise ? ">" : "[",
  ];
  const lookAheadPattern = `\\s*(${operators
    .sort(byLength)
    .map(escapeOperator)
    .join("|")})\\s*(?!-)`;
  const lookBehindPattern = `(?<=[^-+](?:${operators
    .concat(unary)
    .sort(byLength)
    .map(escapeOperator)
    .join("|")}))`;

  return new RegExp(`${lookAheadPattern}|${lookBehindPattern}`, "y");
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

function escapeOperator(str: string) {
  if (/^[A-Z]+$/i.test(str)) {
    return "\\b" + escapeNonAlphaNumeric(str) + "\\b";
  }
  if (str === "/") {
    return "\\/(?:\\b|\\s)"; //make sure this isn't a comment
  }
  return escapeNonAlphaNumeric(str);
}

function escapeNonAlphaNumeric(str: string) {
  return str.replace(/([^\w\d])/g, "\\$1");
}

function byLength(a: string, b: string) {
  return b.length - a.length;
}
