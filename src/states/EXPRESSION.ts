import {
  CODE,
  STATE,
  isWhitespaceCode,
  StateDefinition,
  Parser,
  Meta,
  ErrorCode,
} from "../internal";

export enum OPERATOR_TERMINATOR {
  // All operators are ok.
  None = 0,
  // Prevents double hyphens (set when in concise mode attrs).
  Hyphens = 1,
  // Prevent equals continuing an expression (set for tag variable expression)
  AttrValue = 1 << 1,
  // Prevent close angle bracket continuing an expression (set for html mode attrs)
  CloseAngleBracket = 1 << 2,
}

export interface ExpressionMeta extends Meta {
  groupStack: number[];
  terminator: number | (number | number[])[];
  skipOperators: boolean;
  terminatedByEOL: boolean;
  terminatedByWhitespace: boolean;
  operatorTerminator: OPERATOR_TERMINATOR;
}

const unaryKeywords = [
  "async",
  "await",
  "keyof",
  "class",
  "function",
  "new",
  "typeof",
  "void",
] as const;

const binaryKeywords = ["instanceof", "in", "as", "extends"] as const;

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
      operatorTerminator: OPERATOR_TERMINATOR.None,
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
            if (canFollowDivision(this.getPreviousNonWhitespaceCharCode())) {
              this.pos++;
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
      (expression.terminatedByEOL || expression.terminatedByWhitespace) &&
      !checkForOperators(this, expression, true)
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

function checkForOperators(
  parser: Parser,
  expression: ExpressionMeta,
  eol: boolean
) {
  if (expression.skipOperators) return false;

  const { pos, data } = parser;
  const lookBehindPos = lookBehindForOperator(data, pos);
  if (lookBehindPos !== -1) {
    parser.consumeWhitespace();
    parser.forward = 0;
    return true;
  }
  const terminatedByEOL = expression.terminatedByEOL || parser.isConcise;
  if (!(terminatedByEOL && eol)) {
    const lookAheadPos = lookAheadForOperator(
      data,
      lookAheadWhile(
        terminatedByEOL ? isIndentCode : isWhitespaceCode,
        data,
        pos + 1
      ),
      expression.operatorTerminator
    );
    if (lookAheadPos !== -1) {
      parser.pos = lookAheadPos;
      parser.forward = 0;
      return true;
    }
  }

  return false;
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

function lookBehindForOperator(data: string, pos: number): number {
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
    case CODE.CLOSE_ANGLE_BRACKET:
    case CODE.PERCENT:
    case CODE.PERIOD:
    case CODE.PIPE:
    case CODE.QUESTION:
    case CODE.TILDE:
      return curPos;

    case CODE.PLUS:
    case CODE.HYPHEN: {
      // special case -- and ++
      if (data.charCodeAt(curPos - 1) === code) {
        // Check if we should continue for another reason.
        // eg "typeof++ x"
        return lookBehindForOperator(
          data,
          lookBehindWhile(isWhitespaceCode, data, curPos - 2)
        );
      }

      return curPos;
    }

    default: {
      for (const keyword of unaryKeywords) {
        const keywordPos = lookBehindFor(data, curPos, keyword);
        if (keywordPos !== -1) {
          return keywordPos === 0 ||
            data.charCodeAt(keywordPos - 1) !== CODE.PERIOD
            ? keywordPos
            : -1;
        }
      }
      return -1;
    }
  }
}

function lookAheadForOperator(
  data: string,
  pos: number,
  terminator: OPERATOR_TERMINATOR
): number {
  switch (data.charCodeAt(pos)) {
    case CODE.AMPERSAND:
    case CODE.ASTERISK:
    case CODE.CARET:
    case CODE.EXCLAMATION:
    case CODE.OPEN_ANGLE_BRACKET:
    case CODE.PERCENT:
    case CODE.PIPE:
    case CODE.QUESTION:
    case CODE.TILDE:
    case CODE.PLUS:
      return pos + 1;

    case CODE.HYPHEN: {
      return (terminator & OPERATOR_TERMINATOR.Hyphens) ===
        OPERATOR_TERMINATOR.Hyphens && data.charCodeAt(pos + 1) === CODE.HYPHEN
        ? -1
        : pos + 1;
    }

    case CODE.OPEN_CURLY_BRACE:
    case CODE.OPEN_PAREN:
      return pos; // defers to base expression state to track block groups.

    case CODE.FORWARD_SLASH:
      return (terminator & OPERATOR_TERMINATOR.CloseAngleBracket) ===
        OPERATOR_TERMINATOR.CloseAngleBracket &&
        data.charCodeAt(pos + 1) === CODE.CLOSE_ANGLE_BRACKET
        ? -1
        : pos; // defers to base expression state to track regexp groups.

    case CODE.COLON:
      return (terminator & OPERATOR_TERMINATOR.AttrValue) ===
        OPERATOR_TERMINATOR.AttrValue && data.charCodeAt(pos + 1) === CODE.EQUAL
        ? -1
        : pos + 1;

    case CODE.PERIOD:
      // Only match a dot if its not ...
      return data.charCodeAt(pos + 1) === CODE.PERIOD ? -1 : pos + 1;

    case CODE.CLOSE_ANGLE_BRACKET:
      // In concise mode a > is a normal operator.
      if (
        (terminator & OPERATOR_TERMINATOR.CloseAngleBracket) !==
        OPERATOR_TERMINATOR.CloseAngleBracket
      ) {
        return pos + 1;
      }

      // Otherwise we match >=, >> and >>>
      switch (data.charCodeAt(pos + 1)) {
        case CODE.EQUAL:
          return pos + 2;
        case CODE.CLOSE_ANGLE_BRACKET:
          return (
            pos +
            (data.charCodeAt(pos + 2) === CODE.CLOSE_ANGLE_BRACKET ? 3 : 2)
          );
        default:
          return -1;
      }
    case CODE.EQUAL:
      if (
        (terminator & OPERATOR_TERMINATOR.AttrValue) ===
        OPERATOR_TERMINATOR.AttrValue
      ) {
        return -1;
      }

      if (
        (terminator & OPERATOR_TERMINATOR.CloseAngleBracket) !==
        OPERATOR_TERMINATOR.CloseAngleBracket
      ) {
        return pos + 1;
      }

      // We'll match ==, ===, and =>
      // This is primarily to support => since otherwise it'd end a CloseAngleBracket terminator.
      switch (data.charCodeAt(pos + 1)) {
        case CODE.CLOSE_ANGLE_BRACKET:
          return pos + 2;
        case CODE.EQUAL:
          return pos + (data.charCodeAt(pos + 2) === CODE.EQUAL ? 3 : 2);
        default:
          return -1;
      }

    default: {
      for (const keyword of binaryKeywords) {
        let nextPos = lookAheadFor(data, pos, keyword);
        if (nextPos === -1) continue;

        const max = data.length - 1;
        if (nextPos === max) return -1;

        let nextCode = data.charCodeAt(nextPos + 1);
        if (isWhitespaceCode(nextCode)) {
          // skip any whitespace after the operator
          nextPos = lookAheadWhile(isWhitespaceCode, data, nextPos + 2);
          if (nextPos === max) return -1;
          nextCode = data.charCodeAt(nextPos);
        } else if (isWordCode(nextCode)) {
          // bail if we are continuing a word, eg "**in**teger"
          return -1;
        }

        // finally check that this is not followed by a terminator.
        switch (nextCode) {
          case CODE.COLON:
          case CODE.COMMA:
          case CODE.EQUAL:
          case CODE.FORWARD_SLASH:
          case CODE.CLOSE_ANGLE_BRACKET:
          case CODE.SEMICOLON:
            return -1;
          default:
            return nextPos;
        }
      }

      return -1;
    }
  }
}

function canFollowDivision(code: number) {
  return (
    isWordCode(code) ||
    code === CODE.PERCENT ||
    code === CODE.CLOSE_PAREN ||
    code === CODE.PERIOD ||
    code === CODE.OPEN_ANGLE_BRACKET ||
    code === CODE.CLOSE_SQUARE_BRACKET ||
    code === CODE.CLOSE_CURLY_BRACE
  );
}

function isWordCode(code: number) {
  return (
    (code >= CODE.UPPER_A && code <= CODE.UPPER_Z) ||
    (code >= CODE.LOWER_A && code <= CODE.LOWER_Z) ||
    (code >= CODE.NUMBER_0 && code <= CODE.NUMBER_9) ||
    code === CODE.UNDERSCORE
  );
}

function isIndentCode(code: number) {
  return code === CODE.TAB || code === CODE.SPACE;
}

function lookAheadWhile(
  match: (code: number) => boolean,
  data: string,
  pos: number
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
  pos: number
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
