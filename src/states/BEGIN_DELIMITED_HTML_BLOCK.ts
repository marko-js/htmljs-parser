import {
  htmlEOF,
  isIndentCode,
  isLineCode,
  type Meta,
  Parser,
  STATE,
  type StateDefinition,
} from "../internal.ts";
import * as CODE from "../util/codes.ts";
import * as ErrorCode from "../util/error-code.ts";

export interface DelimitedHTMLBlockMeta extends Meta {
  delimiter: string;
  indent: string;
  delimiterCode: number;
}

// In STATE.BEGIN_DELIMITED_HTML_BLOCK we have already found the start of a delimiter: either two
// consecutive hyphens, or one or more backticks. We expect to reach the end of the line with
// only whitespace characters
export const BEGIN_DELIMITED_HTML_BLOCK: StateDefinition<DelimitedHTMLBlockMeta> =
  {
    name: "BEGIN_DELIMITED_HTML_BLOCK",

    enter(parent, start) {
      return {
        state: BEGIN_DELIMITED_HTML_BLOCK as StateDefinition,
        parent,
        start,
        end: start,
        indent: this.indent,
        delimiter: "",
        delimiterCode: this.data.charCodeAt(start),
      };
    },

    exit() {
      this.textDelimiter = undefined;
    },

    parse(data, maxPos, block) {
      if (this.pos === maxPos) {
        htmlEOF.call(this);
        this.pos++;
        return;
      }

      while (this.pos < maxPos) {
        const code = data.charCodeAt(this.pos);

        if (code === CODE.NEWLINE || code === CODE.CARRIAGE_RETURN) {
          const len =
            code === CODE.CARRIAGE_RETURN &&
            data.charCodeAt(this.pos + 1) === CODE.NEWLINE
              ? 2
              : 1;
          const prevPos = this.pos;
          beginText(this, block, false);
          handleDelimitedBlockEOL(
            this,
            true,
            len,
            block.indent,
            block.delimiter,
          );
          if (this.pos === prevPos) this.pos += len; // advance past newline if not already advanced
          return;
        }

        if (code === block.delimiterCode) {
          block.delimiter += String.fromCharCode(code);
          this.pos++;
          continue;
        }

        // Non-delimiter, non-newline: check if whitespace-only remains on line
        const startPos = this.pos;
        const textOffset = block.delimiterCode === CODE.BACKTICK ? 0 : 1;
        if (!this.consumeWhitespaceOnLine(textOffset)) {
          // Non-whitespace content on this line: start single-line HTML block
          this.pos = startPos + textOffset;
          beginText(this, block, true);
          return;
        }
        // Only whitespace to EOL: consumeWhitespaceOnLine set pos to newline
        // Continue to let the newline trigger EOL handling above
      }
    },

    return() {},
  };

function beginText(
  parser: Parser,
  block: DelimitedHTMLBlockMeta,
  singleLine: boolean,
) {
  parser.textDelimiter = {
    start: block.start,
    end: block.start + block.delimiter.length,
  };
  parser.beginHtmlBlock(
    singleLine ? undefined : block.delimiter,
    singleLine,
    singleLine && block.delimiterCode === CODE.BACKTICK
      ? block.delimiter
      : undefined,
  );
}

export function handleDelimitedEOL(
  parser: Parser,
  newLineLength: number,
  content: STATE.ParsedTextContentMeta | STATE.HTMLContentMeta,
) {
  if (content.singleLine) {
    parser.endText();
    parser.exitState();
    parser.exitState();
    return true;
  }

  if (content.delimiter) {
    handleDelimitedBlockEOL(
      parser,
      false,
      newLineLength,
      content.indent,
      content.delimiter,
    );
    return true;
  }

  return false;
}

function handleDelimitedBlockEOL(
  parser: Parser,
  first: boolean,
  newLineLength: number,
  indent: string,
  delimiter: string,
) {
  // If we are within a delimited HTML block then we want to check if the next line is the end
  // delimiter. Since we are currently positioned at the start of the new line character our lookahead
  // will need to include the new line character, followed by the expected indentation, followed by
  // the delimiter.
  const endHtmlBlockLookahead = indent + delimiter;

  const isClosingLine =
    parser.lookAheadFor(endHtmlBlockLookahead, parser.pos + newLineLength) &&
    (delimiter.charCodeAt(0) !== CODE.BACKTICK ||
      parser.onlyWhitespaceRemainsOnLine(
        newLineLength + endHtmlBlockLookahead.length,
      ));

  if (isClosingLine) {
    parser.endText();
    parser.pos += newLineLength + endHtmlBlockLookahead.length;

    if (parser.consumeWhitespaceOnLine(0)) {
      parser.exitState();
      parser.exitState();
    } else {
      parser.emitError(
        parser.pos,
        ErrorCode.INVALID_CHARACTER,
        "A concise mode closing block delimiter can only be followed by whitespace.",
      );
    }
  } else if (parser.lookAheadFor(indent, parser.pos + newLineLength)) {
    if (!first) parser.startText();
    parser.pos += newLineLength;
    parser.endText();
    // We know the next line does not end the multiline HTML block, but we need to check if there
    // is any indentation that we need to skip over as we continue parsing the HTML in this
    // multiline HTML block
    parser.pos += indent.length;
    parser.startText();
    // We stay in the same state since we are still parsing a multiline, delimited HTML block
  } else if (indent && !parser.onlyWhitespaceRemainsOnLine(newLineLength)) {
    // the next line does not have enough indentation
    // so unless it is blank (whitespace only),
    // we will end the block. A delimiter there is not a closer, it starts the next block.
    const pos = parser.pos;
    let cur = parser.pos;
    while (cur && isLineCode(parser.data.charCodeAt(cur - 1))) {
      cur--;
    }

    parser.pos = cur;
    parser.endText();
    parser.pos = pos;
    parser.exitState();
    parser.exitState();
  } else if (!first && parser.pos + newLineLength !== parser.maxPos) {
    parser.startText();
  }
}

export function checkForBacktickCloser(parser: Parser, delimiter: string) {
  const { data } = parser;
  const start = parser.pos;
  let end = start;
  while (data.charCodeAt(end) === CODE.BACKTICK) end++;
  if (end - start !== delimiter.length) return false;

  let next = end;
  while (isIndentCode(data.charCodeAt(next))) next++;

  const code = data.charCodeAt(next);
  const afterSlash =
    code === CODE.FORWARD_SLASH ? data.charCodeAt(next + 1) : undefined;
  const startsLineComment = afterSlash === CODE.FORWARD_SLASH;
  const startsBlockComment = afterSlash === CODE.ASTERISK;
  const endsLine = next >= parser.maxPos || isLineCode(code);
  if (!endsLine && !startsLineComment && !startsBlockComment) return false;

  parser.endText();
  parser.exitState();
  parser.exitState();
  parser.pos = next;

  if (startsLineComment) {
    parser.enterState(STATE.JS_COMMENT_LINE);
    parser.pos += 2;
  } else if (startsBlockComment) {
    parser.enterState(STATE.JS_COMMENT_BLOCK);
    parser.pos += 2;
  }

  return true;
}
