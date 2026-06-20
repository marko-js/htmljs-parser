import {
  isIndentCode,
  isWhitespaceCode,
  type Meta,
  Parser,
  STATE,
  type StateDefinition,
} from "../internal.ts";
import * as CODE from "../util/codes.ts";
import * as ErrorCode from "../util/error-code.ts";

export interface ExpressionMeta extends Meta {
  groupStack: number[];
  operators: boolean;
  wasComment: boolean;
  hadUnguardedNewline: boolean;
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
  "async",
  "await",
  "class",
  "function",
  "new",
  "typeof",
  "void",
] as const;

const tsUnaryKeywords = [
  ...unaryKeywords,
  "asserts",
  "infer",
  "is",
  "keyof",
  "readonly",
  "unique",
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
      hadUnguardedNewline: false,
      inType: false,
      forceType: false,
      ternaryDepth: 0,
      terminatedByEOL: false,
      terminatedByWhitespace: false,
      consumeIndentedContent: false,
    };
  },

  exit() {},

  parse(data, maxPos, expression) {
    while (this.pos < maxPos) {
      const code = data.charCodeAt(this.pos);

      // EOL handling
      if (code === CODE.NEWLINE || code === CODE.CARRIAGE_RETURN) {
        const len =
          code === CODE.CARRIAGE_RETURN &&
          data.charCodeAt(this.pos + 1) === CODE.NEWLINE
            ? 2
            : 1;

        const prevPos = this.pos;
        if (
          !expression.groupStack.length &&
          (expression.terminatedByEOL || expression.terminatedByWhitespace) &&
          (expression.wasComment ||
            !checkForOperators(this, expression, true)) &&
          !(
            expression.consumeIndentedContent &&
            isIndentCode(data.charCodeAt(prevPos + len))
          )
        ) {
          // Don't advance past the newline.
          this.exitState();
          return;
        }

        expression.wasComment = false;
        if (!expression.groupStack.length)
          expression.hadUnguardedNewline = true;
        // checkForOperators may have advanced pos; only advance by len if it didn't
        if (this.pos === prevPos) this.pos += len;
        continue;
      }

      // Fast path: an identifier/number character is never whitespace, never
      // a terminator (no `shouldTerminate` implementation matches a word
      // character), and is not handled by the switch below, so it just
      // advances. Short-circuiting here skips the termination checks and the
      // switch dispatch for the bulk of expression content.
      if (isWordCode(code)) {
        this.pos++;
        continue;
      }

      // Termination checks (no groupStack)
      if (!expression.groupStack.length) {
        if (expression.terminatedByWhitespace && isWhitespaceCode(code)) {
          if (!checkForOperators(this, expression, false)) {
            this.exitState();
            return;
          }
          // checkForOperators already advanced this.pos
          continue;
        }

        if (expression.shouldTerminate(code, data, this.pos, expression)) {
          let wasExpression = false;
          if (expression.operators) {
            const prevNonWhitespacePos = lookBehindWhile(
              isWhitespaceCode,
              data,
              this.pos - 1,
            );
            if (prevNonWhitespacePos > expression.start) {
              wasExpression =
                lookBehindForOperator(
                  expression,
                  data,
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
          this.pos++; // skip "
          return;
        case CODE.SINGLE_QUOTE:
          this.enterState(STATE.STRING).quoteCharCode = code;
          this.pos++; // skip '
          return;
        case CODE.BACKTICK:
          this.enterState(STATE.TEMPLATE_STRING);
          this.pos++; // skip `
          return;
        case CODE.QUESTION:
          if (expression.operators && !expression.groupStack.length) {
            expression.ternaryDepth++;
            this.pos++; // skip ?
            this.consumeWhitespace();
            continue;
          }
          this.pos++;
          break;
        case CODE.COLON:
          if (expression.operators && !expression.groupStack.length) {
            if (expression.ternaryDepth) {
              expression.ternaryDepth--;
            } else {
              expression.inType = true;
            }
            this.pos++; // skip :
            this.consumeWhitespace();
            continue;
          }
          this.pos++;
          break;
        case CODE.EQUAL:
          if (expression.operators) {
            if (data.charCodeAt(this.pos + 1) === CODE.CLOSE_ANGLE_BRACKET) {
              if (
                expression.inType &&
                !expression.forceType &&
                this.getPreviousNonWhitespaceCharCode() !== CODE.CLOSE_PAREN
              ) {
                expression.inType = false;
              }
              this.pos++; // skip =, outer iteration handles >
            } else if (
              !(expression.forceType || expression.groupStack.length)
            ) {
              expression.inType = false;
            }
            this.pos++; // skip = (or the char after =>)
            this.consumeWhitespace();
            continue;
          }
          this.pos++;
          break;
        case CODE.FORWARD_SLASH:
          switch (data.charCodeAt(this.pos + 1)) {
            case CODE.FORWARD_SLASH:
              this.enterState(STATE.JS_COMMENT_LINE);
              this.pos += 2; // skip //
              return;
            case CODE.ASTERISK:
              this.enterState(STATE.JS_COMMENT_BLOCK);
              this.pos += 2; // skip /*
              return;
            default:
              if (canFollowDivision(this.getPreviousNonWhitespaceCharCode())) {
                this.pos++;
                this.consumeWhitespace();
                continue;
              } else {
                this.enterState(STATE.REGULAR_EXPRESSION);
                this.pos++; // skip /, REGULAR_EXPRESSION starts after
                return;
              }
          }
        case CODE.OPEN_PAREN:
          expression.groupStack.push(CODE.CLOSE_PAREN);
          this.pos++;
          break;
        case CODE.OPEN_SQUARE_BRACKET:
          expression.groupStack.push(CODE.CLOSE_SQUARE_BRACKET);
          this.pos++;
          break;
        case CODE.OPEN_CURLY_BRACE:
          expression.groupStack.push(CODE.CLOSE_CURLY_BRACE);
          this.pos++;
          break;
        case CODE.OPEN_ANGLE_BRACKET:
          if (expression.inType) {
            expression.groupStack.push(CODE.CLOSE_ANGLE_BRACKET);
            this.pos++;
          } else if (expression.operators && !expression.groupStack.length) {
            this.pos++;
            this.consumeWhitespace();
            continue;
          } else {
            this.pos++;
          }
          break;

        case CODE.CLOSE_PAREN:
        case CODE.CLOSE_SQUARE_BRACKET:
        case CODE.CLOSE_CURLY_BRACE:
        case CODE.CLOSE_ANGLE_BRACKET: {
          if (code === CODE.CLOSE_ANGLE_BRACKET) {
            if (
              !expression.inType ||
              data.charCodeAt(this.pos - 1) === CODE.EQUAL
            ) {
              this.pos++;
              break;
            }
          }

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

          this.pos++;
          break;
        }

        default:
          this.pos++;
          break;
      }
    }

    // EOF
    if (
      !expression.groupStack.length &&
      (this.isConcise || expression.terminatedByEOL)
    ) {
      this.exitState();
      return;
    }

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
            // A missing name was reported above, so this is a spread or named attribute.
            attr.spread ? "..." : `"${this.read(attr.name!)}"`
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
      // Every unary keyword ends in a lowercase letter; if the character
      // before `pos` is not one, no keyword can match.
      if (code < CODE.LOWER_A || code > CODE.LOWER_Z) return -1;

      for (const keyword of expression.inType
        ? tsUnaryKeywords
        : unaryKeywords) {
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
      // Every binary keyword starts with a lowercase letter; if the character
      // at `pos` is not one, no keyword can match.
      const startCode = data.charCodeAt(pos);
      if (startCode < CODE.LOWER_A || startCode > CODE.LOWER_Z) return -1;

      for (const keyword of binaryKeywords) {
        const keywordPos = lookAheadFor(data, pos, keyword);
        if (keywordPos === -1) continue;
        if (!isWhitespaceCode(data.charCodeAt(keywordPos + 1))) break;

        // skip any whitespace after the operator;
        // there must be an operand before the end of the input.
        const nextPos = lookAheadWhile(isWhitespaceCode, data, keywordPos + 2);
        if (nextPos === data.length) break;

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

  return max;
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
