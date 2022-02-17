import {
  CODE,
  STATE,
  isWhitespaceCode,
  StateDefinition,
  Part,
  Parser,
  operators,
} from "../internal";

export interface ExpressionPart extends Part {
  groupStack: number[];
  terminator?: string | string[];
  allowEscapes: boolean;
  skipOperators: boolean;
  terminatedByEOL: boolean;
  terminatedByWhitespace: boolean;
}

export const EXPRESSION: StateDefinition<ExpressionPart> = {
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
      const parentState = expression.parentState;

      if (parentState === STATE.ATTRIBUTE) {
        const name = this.currentAttribute!.default
          ? "default"
          : this.currentAttribute!.name
          ? this.read(this.currentAttribute!.name!)
          : undefined;
        if (!name) {
          return this.notifyError(
            expression,
            "MALFORMED_OPEN_TAG",
            'EOF reached while parsing attribute name for the "' +
              this.read(this.currentOpenTag!.tagName) +
              '" tag'
          );
        }

        return this.notifyError(
          expression,
          "MALFORMED_OPEN_TAG",
          'EOF reached while parsing attribute value for the "' +
            name +
            '" attribute'
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
        const operator = !expression.skipOperators && checkForOperator(this);

        if (!operator) {
          this.exitState();
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

function checkForOperator(parser: Parser) {
  operators.patternNext.lastIndex = parser.pos;
  const matches = operators.patternNext.exec(parser.data);

  if (matches) {
    const [match] = matches;
    const isIgnoredOperator = parser.isConcise
      ? match.includes("[")
      : match.includes(">");
    if (!isIgnoredOperator) {
      parser.skip(match.length - 1);
      return true;
    }
  } else {
    operators.patternPrev.lastIndex = parser.data.length - parser.pos;
    const match = operators.patternPrev.exec(parser.dataReversed);
    if (match) {
      parser.consumeWhitespace();
      parser.rewind(1);
      return true;
    }
  }

  return false;
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
