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

  eol(str, expression) {
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

    if (code === CODE.SINGLE_QUOTE || code === CODE.DOUBLE_QUOTE) {
      this.enterState(STATE.STRING, {
        quoteCharCode: code,
      });
    } else if (code === CODE.BACKTICK) {
      this.enterState(STATE.TEMPLATE_STRING);
    } else if (code === CODE.FORWARD_SLASH) {
      // Check next character to see if we are in a comment or regexp
      const nextCode = this.lookAtCharCodeAhead(1);
      if (nextCode === CODE.FORWARD_SLASH) {
        this.enterState(STATE.JS_COMMENT_LINE);
        this.skip(1);
      } else if (nextCode === CODE.ASTERISK) {
        this.enterState(STATE.JS_COMMENT_BLOCK);
        this.skip(1);
      } else if (
        !/[\]})A-Z0-9.<%]/i.test(this.getPreviousNonWhitespaceChar())
      ) {
        this.enterState(STATE.REGULAR_EXPRESSION);
      }
    } else if (
      code === CODE.OPEN_PAREN ||
      code === CODE.OPEN_SQUARE_BRACKET ||
      code === CODE.OPEN_CURLY_BRACE
    ) {
      expression.groupStack.push(code);
    } else if (
      code === CODE.CLOSE_PAREN ||
      code === CODE.CLOSE_SQUARE_BRACKET ||
      code === CODE.CLOSE_CURLY_BRACE
    ) {
      if (depth === 0) {
        return this.notifyError(
          expression,
          "INVALID_EXPRESSION",
          'Mismatched group. A closing "' +
            ch +
            '" character was found but it is not matched with a corresponding opening character.'
        );
      }

      const matchingGroupCharCode = expression.groupStack.pop();

      if (
        (code === CODE.CLOSE_PAREN &&
          matchingGroupCharCode !== CODE.OPEN_PAREN) ||
        (code === CODE.CLOSE_SQUARE_BRACKET &&
          matchingGroupCharCode !== CODE.OPEN_SQUARE_BRACKET) ||
        (code === CODE.CLOSE_CURLY_BRACE &&
          matchingGroupCharCode !== CODE.OPEN_CURLY_BRACE)
      ) {
        return this.notifyError(
          expression,
          "INVALID_EXPRESSION",
          'Mismatched group. A "' +
            ch +
            '" character was found when "' +
            String.fromCharCode(matchingGroupCharCode!) +
            '" was expected.'
        );
      }
    }
  },
};

function checkForOperator(parser: Parser) {
  const remaining = parser.data.substring(parser.pos);
  const matches = operators.patternNext.exec(remaining);

  if (matches) {
    const match = matches[0];
    const isIgnoredOperator = parser.isConcise
      ? match.includes("[")
      : match.includes(">");
    if (!isIgnoredOperator) {
      parser.skip(match.length - 1);
      return true;
    }
  } else {
    const previous = parser.substring(
      parser.pos - operators.longest,
      parser.pos
    );
    const match = operators.patternPrev.exec(previous);
    if (match) {
      parser.consumeWhitespace();
      parser.rewind(1);
      return true;
    }
  }

  return false;
}
