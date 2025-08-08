import {
  CODE,
  STATE,
  isWhitespaceCode,
  type StateDefinition,
  Parser,
  type Meta,
  ErrorCode,
  isIndentCode,
} from "../internal";

export interface ExpressionMeta extends Meta {
  groupStack: number[];
  operators: boolean;
  wasComment: boolean;
  inType: boolean;
  forceType: boolean;
  ternaryDepth: number;
  terminatedByEOL: boolean;
  terminatedByWhitespace: boolean;
  consumeIndentedContent: boolean;
  shouldTerminate(
    code: number,
    data: string,
    pos: number,
    expression: ExpressionMeta,
  ): boolean;
}

// Never terminate early by default.
const shouldTerminate = () => false;

const unaryKeywords = [
  "asserts",
  "async",
  "await",
  "class",
  "function",
  "infer",
  "is",
  "keyof",
  "new",
  "readonly",
  "typeof",
  "unique",
  "void",
] as const;

const binaryKeywords = [
  "as",
  "extends",
  "instanceof", // Note: instanceof must be checked before `in`
  "in",
  "satisfies",
] as const;

export const EXPRESSION: StateDefinition<ExpressionMeta> = {
  name: "EXPRESSION",

  enter(parent, start) {
    return {
      state: EXPRESSION as StateDefinition,
      parent,
      start,
      end: start,
      groupStack: [],
      shouldTerminate,
      operators: false,
      wasComment: false,
      inType: false,
      forceType: false,
      ternaryDepth: 0,
      terminatedByEOL: false,
      terminatedByWhitespace: false,
      consumeIndentedContent: false,
    };
  },

  exit() {},

  char(code, expression) {
    if (!expression.groupStack.length) {
      if (expression.terminatedByWhitespace && isWhitespaceCode(code)) {
        if (!checkForOperators(this, expression, false)) {
          this.exitState();
        }
        return;
      }

      if (expression.shouldTerminate(code, this.data, this.pos, expression)) {
        let wasExpression = false;
        if (expression.operators) {
          const prevNonWhitespacePos = lookBehindWhile(
            isWhitespaceCode,
            this.data,
            this.pos - 1,
          );
          if (prevNonWhitespacePos > expression.start) {
            wasExpression =
              lookBehindForOperator(
                expression,
                this.data,
                prevNonWhitespacePos,
              ) !== -1;
          }
        }

        if (!wasExpression) {
          this.exitState();
          return;
        }
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
      case CODE.QUESTION:
        if (expression.operators && !expression.groupStack.length) {
          expression.ternaryDepth++;
          this.pos++;
          this.forward = 0;
          this.consumeWhitespace();
        }
        break;
      case CODE.COLON:
        if (expression.operators && !expression.groupStack.length) {
          if (expression.ternaryDepth) {
            expression.ternaryDepth--;
          } else {
            expression.inType = true;
          }

          this.pos++;
          this.forward = 0;
          this.consumeWhitespace();
        }
        break;
      case CODE.EQUAL:
        if (expression.operators) {
          if (this.lookAtCharCodeAhead(1) === CODE.CLOSE_ANGLE_BRACKET) {
            this.pos++;
          } else if (!(expression.forceType || expression.groupStack.length)) {
            expression.inType = false;
          }

          this.pos++;
          this.forward = 0;
          this.consumeWhitespace();
        }
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
            if (canFollowDivision(this.getPreviousNonWhitespaceCharCode())) {
              this.pos++;
              this.forward = 0;
              this.consumeWhitespace();
            } else {
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
      case CODE.OPEN_ANGLE_BRACKET:
        if (expression.inType) {
          expression.groupStack.push(CODE.CLOSE_ANGLE_BRACKET);
        } else if (expression.operators && !expression.groupStack.length) {
          this.pos++;
          this.forward = 0;
          this.consumeWhitespace();
        }
        break;

      case CODE.CLOSE_PAREN:
      case CODE.CLOSE_SQUARE_BRACKET:
      case CODE.CLOSE_CURLY_BRACE:
      case expression.inType && CODE.CLOSE_ANGLE_BRACKET: {
        if (!expression.groupStack.length) {
          return this.emitError(
            expression,
            ErrorCode.INVALID_EXPRESSION,
            'Mismatched group. A closing "' +
              String.fromCharCode(code) +
              '" character was found but it is not matched with a corresponding opening character.',
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
              '" was expected.',
          );
        }

        break;
      }
    }
  },

  eol(len, expression) {
    if (
      !expression.groupStack.length &&
      (expression.terminatedByEOL || expression.terminatedByWhitespace) &&
      (expression.wasComment || !checkForOperators(this, expression, true)) &&
      !(
        expression.consumeIndentedContent &&
        isIndentCode(this.lookAtCharCodeAhead(len))
      )
    ) {
      this.exitState();
    }
    expression.wasComment = false;
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
                '" tag',
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
            } attribute`,
          );
        }

        case STATE.TAG_NAME:
          return this.emitError(
            expression,
            ErrorCode.MALFORMED_OPEN_TAG,
            "EOF reached while parsing tag name",
          );

        case STATE.PLACEHOLDER:
          return this.emitError(
            expression,
            ErrorCode.MALFORMED_PLACEHOLDER,
            "EOF reached while parsing placeholder",
          );
      }

      return this.emitError(
        expression,
        ErrorCode.INVALID_EXPRESSION,
        "EOF reached while parsing expression",
      );
    }
  },

  return(child, expression) {
    if (child.state === STATE.JS_COMMENT_LINE) {
      expression.wasComment = true;
    }
  },
};

function checkForOperators(
  parser: Parser,
  expression: ExpressionMeta,
  eol: boolean,
) {
  if (!expression.operators) return false;

  const { pos, data } = parser;
  if (lookBehindForOperator(expression, data, pos) !== -1) {
    parser.consumeWhitespace();
    parser.forward = 0;
    return true;
  }

  const terminatedByEOL = expression.terminatedByEOL || parser.isConcise;
  if (!(terminatedByEOL && eol)) {
    const nextNonSpace = lookAheadWhile(
      terminatedByEOL ? isIndentCode : isWhitespaceCode,
      data,
      pos + 1,
    );

    if (
      !expression.shouldTerminate(
        data.charCodeAt(nextNonSpace),
        data,
        nextNonSpace,
        expression,
      )
    ) {
      const lookAheadPos = lookAheadForOperator(expression, data, nextNonSpace);
      if (lookAheadPos !== -1) {
        parser.pos = lookAheadPos;
        parser.forward = 0;
        return true;
      }
    }
  }

  return false;
}

function lookBehindForOperator(
  expression: ExpressionMeta,
  data: string,
  pos: number,
): number {
  const curPos = pos - 1;
  const code = data.charCodeAt(curPos);

  switch (code) {
    case CODE.AMPERSAND:
    case CODE.ASTERISK:
    case CODE.CARET:
    case CODE.COLON:
    case CODE.EQUAL:
    case CODE.EXCLAMATION:
    case CODE.OPEN_ANGLE_BRACKET:
    case CODE.PERCENT:
    case CODE.PIPE:
    case CODE.QUESTION:
    case CODE.TILDE:
      return curPos;

    case CODE.CLOSE_ANGLE_BRACKET:
      return data.charCodeAt(curPos - 1) === CODE.EQUAL
        ? curPos - 1
        : expression.inType
          ? -1
          : curPos;

    case CODE.PERIOD: {
      // Only matches `.` followed by something that could be an identifier.
      const nextPos = lookAheadWhile(isWhitespaceCode, data, pos);
      return isWordCode(data.charCodeAt(nextPos)) ? nextPos : -1;
    }

    // special case -- and ++
    case CODE.PLUS:
    case CODE.HYPHEN: {
      if (data.charCodeAt(curPos - 1) === code) {
        // Check if we should continue for another reason.
        // eg "typeof++ x"
        return lookBehindForOperator(
          expression,
          data,
          lookBehindWhile(isWhitespaceCode, data, curPos - 2),
        );
      }

      return curPos;
    }

    default: {
      for (const keyword of unaryKeywords) {
        const keywordPos = lookBehindFor(data, curPos, keyword);
        if (keywordPos !== -1) {
          return isWordOrPeriodCode(data.charCodeAt(keywordPos - 1))
            ? -1
            : keywordPos;
        }
      }
      return -1;
    }
  }
}

function lookAheadForOperator(
  expression: ExpressionMeta,
  data: string,
  pos: number,
): number {
  switch (data.charCodeAt(pos)) {
    case CODE.AMPERSAND:
    case CODE.ASTERISK:
    case CODE.CARET:
    case CODE.EXCLAMATION:
    case CODE.OPEN_ANGLE_BRACKET:
    case CODE.PERCENT:
    case CODE.PIPE:
    case CODE.TILDE:
    case CODE.PLUS:
    case CODE.HYPHEN:
      return pos + 1;

    case CODE.FORWARD_SLASH:
    case CODE.OPEN_CURLY_BRACE:
    case CODE.OPEN_PAREN:
    case CODE.CLOSE_ANGLE_BRACKET:
    case CODE.QUESTION:
    case CODE.COLON:
    case CODE.EQUAL:
      return pos; // defers to base expression state to track block groups.

    case CODE.PERIOD: {
      // Only matches `.` followed by something that could be an identifier.
      const nextPos = lookAheadWhile(isWhitespaceCode, data, pos + 1);
      return isWordCode(data.charCodeAt(nextPos)) ? nextPos : -1;
    }

    default: {
      for (const keyword of binaryKeywords) {
        const keywordPos = lookAheadFor(data, pos, keyword);
        if (keywordPos === -1) continue;
        if (!isWhitespaceCode(data.charCodeAt(keywordPos + 1))) break;

        // skip any whitespace after the operator
        const nextPos = lookAheadWhile(isWhitespaceCode, data, keywordPos + 2);
        if (nextPos === data.length - 1) break;

        // finally check that this is not followed by a terminator.
        switch (data.charCodeAt(nextPos)) {
          case CODE.COLON:
          case CODE.COMMA:
          case CODE.EQUAL:
          case CODE.FORWARD_SLASH:
          case CODE.CLOSE_ANGLE_BRACKET:
          case CODE.SEMICOLON:
            break;
          default:
            if (
              !expression.inType &&
              (keyword === "as" || keyword === "satisfies")
            ) {
              expression.inType = true;
              if (!(expression.ternaryDepth || expression.groupStack.length)) {
                expression.forceType = true;
              }
            }
            return nextPos;
        }
      }

      return -1;
    }
  }
}

function canFollowDivision(code: number) {
  if (isWordCode(code)) return true;
  switch (code) {
    case CODE.BACKTICK:
    case CODE.SINGLE_QUOTE:
    case CODE.DOUBLE_QUOTE:
    case CODE.PERCENT:
    case CODE.CLOSE_PAREN:
    case CODE.PERIOD:
    case CODE.OPEN_ANGLE_BRACKET:
    case CODE.CLOSE_SQUARE_BRACKET:
    case CODE.CLOSE_CURLY_BRACE:
      return true;
    default:
      return false;
  }
}

function isWordOrPeriodCode(code: number) {
  return code === CODE.PERIOD || isWordCode(code);
}

function isWordCode(code: number) {
  return (
    (code >= CODE.UPPER_A && code <= CODE.UPPER_Z) ||
    (code >= CODE.LOWER_A && code <= CODE.LOWER_Z) ||
    (code >= CODE.NUMBER_0 && code <= CODE.NUMBER_9) ||
    code == CODE.DOLLAR ||
    code === CODE.UNDERSCORE
  );
}

function lookAheadWhile(
  match: (code: number) => boolean,
  data: string,
  pos: number,
) {
  const max = data.length;
  for (let i = pos; i < max; i++) {
    if (!match(data.charCodeAt(i))) return i;
  }

  return max - 1;
}

function lookBehindWhile(
  match: (code: number) => boolean,
  data: string,
  pos: number,
) {
  let i = pos;

  do {
    if (!match(data.charCodeAt(i))) {
      return i + 1;
    }
  } while (i--);

  return 0;
}

function lookBehindFor(data: string, pos: number, str: string) {
  let i = str.length;
  const endPos = pos - i + 1;
  if (endPos < 0) return -1;

  while (i--) {
    if (data.charCodeAt(endPos + i) !== str.charCodeAt(i)) {
      return -1;
    }
  }

  return endPos;
}

function lookAheadFor(data: string, pos: number, str: string) {
  let i = str.length;
  const endPos = pos + i;
  if (endPos > data.length) return -1;

  while (i--) {
    if (data.charCodeAt(pos + i) !== str.charCodeAt(i)) {
      return -1;
    }
  }

  return endPos - 1;
}
