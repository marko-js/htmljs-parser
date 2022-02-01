import {
  CODE,
  STATE,
  isWhitespaceCode,
  StateDefinition,
  Part,
  ValuePart,
  Parser,
  operators,
} from "../internal";

export interface ExpressionPart extends Part {
  value: string;
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
    expression.value = "";
    expression.groupStack = [];
    expression.allowEscapes = expression.allowEscapes === true;
    expression.skipOperators = expression.skipOperators === true;
    expression.terminatedByEOL = expression.terminatedByEOL === true;
    expression.terminatedByWhitespace =
      expression.terminatedByWhitespace === true;
  },

  eol(str, expression) {
    const depth = expression.groupStack.length;

    if (
      depth === 0 &&
      (expression.terminatedByWhitespace || expression.terminatedByEOL)
    ) {
      this.exitState();
      return;
    }

    expression.value += str;
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
        if (!this.currentAttribute!.name) {
          return this.notifyError(
            expression.pos,
            "MALFORMED_OPEN_TAG",
            'EOF reached while parsing attribute name for the "' +
              this.currentOpenTag!.tagName.value +
              '" tag'
          );
        }

        return this.notifyError(
          expression.pos,
          "MALFORMED_OPEN_TAG",
          'EOF reached while parsing attribute value for the "' +
            this.currentAttribute!.name.value +
            '" attribute'
        );
      } else if (parentState === STATE.TAG_NAME) {
        return this.notifyError(
          expression.pos,
          "MALFORMED_OPEN_TAG",
          "EOF reached while parsing tag name"
        );
      } else if (parentState === STATE.PLACEHOLDER) {
        return this.notifyError(
          expression.pos,
          "MALFORMED_PLACEHOLDER",
          "EOF reached while parsing placeholder"
        );
      }

      return this.notifyError(
        expression.pos,
        "INVALID_EXPRESSION",
        "EOF reached while parsing expression"
      );
    }
  },

  return(childState, childPart, expression) {
    switch (childState) {
      case STATE.STRING:
      case STATE.TEMPLATE_STRING:
      case STATE.REGULAR_EXPRESSION:
      case STATE.JS_COMMENT_LINE:
      case STATE.JS_COMMENT_BLOCK:
        expression.value += (childPart as ValuePart).value;
        break;
    }
  },

  char(ch, code, expression) {
    const depth = expression.groupStack.length;

    if (depth === 0) {
      if (expression.terminatedByWhitespace && isWhitespaceCode(code)) {
        const operator = !expression.skipOperators && checkForOperator(this);

        if (operator) {
          expression.value += operator;
        } else {
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
        expression.value += this.lookAtCharAhead(1);
        this.skip(1);
        return;
      }
    }

    if (code === CODE.SINGLE_QUOTE || code === CODE.DOUBLE_QUOTE) {
      return this.enterState(STATE.STRING, {
        quoteChar: ch,
        quoteCharCode: code,
      });
    } else if (code === CODE.BACKTICK) {
      return this.enterState(STATE.TEMPLATE_STRING);
    } else if (code === CODE.FORWARD_SLASH) {
      // Check next character to see if we are in a comment or regexp
      const nextCode = this.lookAtCharCodeAhead(1);
      if (nextCode === CODE.FORWARD_SLASH) {
        this.enterState(STATE.JS_COMMENT_LINE);
        this.skip(1);
        return;
      } else if (nextCode === CODE.ASTERISK) {
        this.enterState(STATE.JS_COMMENT_BLOCK);
        this.skip(1);
        return;
      } else if (
        !/[\]})A-Z0-9.<%]/i.test(this.getPreviousNonWhitespaceChar())
      ) {
        this.enterState(STATE.REGULAR_EXPRESSION);
        return;
      }
    } else if (
      code === CODE.OPEN_PAREN ||
      code === CODE.OPEN_SQUARE_BRACKET ||
      code === CODE.OPEN_CURLY_BRACE
    ) {
      expression.groupStack.push(code);
      expression.value += ch;
      return;
    } else if (
      code === CODE.CLOSE_PAREN ||
      code === CODE.CLOSE_SQUARE_BRACKET ||
      code === CODE.CLOSE_CURLY_BRACE
    ) {
      if (depth === 0) {
        return this.notifyError(
          expression.pos,
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
          expression.pos,
          "INVALID_EXPRESSION",
          'Mismatched group. A "' +
            ch +
            '" character was found when "' +
            String.fromCharCode(matchingGroupCharCode!) +
            '" was expected.'
        );
      }

      expression.value += ch;
      return;
    }

    expression.value += ch;
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
      return match;
    }
  } else {
    const previous = parser.substring(
      parser.pos - operators.longest,
      parser.pos
    );
    const match = operators.patternPrev.exec(previous);
    if (match) {
      parser.rewind(1);
      return parser.consumeWhitespace();
    }
  }

  return false;
}
