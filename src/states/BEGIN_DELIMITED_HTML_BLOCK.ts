import {
  Parser,
  CODE,
  type StateDefinition,
  STATE,
  htmlEOF,
  type Meta,
  ErrorCode,
} from "../internal";

export interface DelimitedHTMLBlockMeta extends Meta {
  delimiter: string;
  indent: string;
}

// In STATE.BEGIN_DELIMITED_HTML_BLOCK we have already found two consecutive hyphens. We expect
// to reach the end of the line with only whitespace characters
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
      };
    },

    exit() {},

    char(code, block) {
      if (code === CODE.HYPHEN) {
        block.delimiter += "-";
      } else {
        const startPos = this.pos;
        if (!this.consumeWhitespaceOnLine()) {
          this.pos = startPos + 1;
          this.forward = 0;
          this.beginHtmlBlock(undefined, true);
        }
      }
    },

    eol(len, block) {
      // We have reached the end of the first delimiter... we need to skip over any indentation on the next
      // line and we might also find that the multi-line, delimited block is immediately ended
      this.beginHtmlBlock(block.delimiter, false);
      handleDelimitedBlockEOL(this, len, block);
    },

    eof: htmlEOF,

    return() {},
  };

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
    handleDelimitedBlockEOL(parser, newLineLength, content);
    return true;
  }

  return false;
}

function handleDelimitedBlockEOL(
  parser: Parser,
  newLineLength: number,
  {
    indent,
    delimiter,
  }:
    | STATE.ParsedTextContentMeta
    | STATE.HTMLContentMeta
    | DelimitedHTMLBlockMeta,
) {
  // If we are within a delimited HTML block then we want to check if the next line is the end
  // delimiter. Since we are currently positioned at the start of the new line character our lookahead
  // will need to include the new line character, followed by the expected indentation, followed by
  // the delimiter.
  const endHtmlBlockLookahead = indent + delimiter;

  if (parser.lookAheadFor(endHtmlBlockLookahead, parser.pos + newLineLength)) {
    parser.startText(); // we want to at least include the newline as text.
    parser.pos += newLineLength;
    parser.endText();
    parser.pos += endHtmlBlockLookahead.length;

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
    // We know the next line does not end the multiline HTML block, but we need to check if there
    // is any indentation that we need to skip over as we continue parsing the HTML in this
    // multiline HTML block
    parser.startText();
    parser.pos += indent.length;
    // We stay in the same state since we are still parsing a multiline, delimited HTML block
  } else if (indent && !parser.onlyWhitespaceRemainsOnLine(newLineLength)) {
    // the next line does not have enough indentation
    // so unless it is blank (whitespace only),
    // we will end the block
    parser.endText();
    parser.exitState();
    parser.exitState();
  } else if (parser.pos + newLineLength !== parser.maxPos) {
    parser.startText();
  }
}
