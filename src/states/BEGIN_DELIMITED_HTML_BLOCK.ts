import { Parser, CODE, StateDefinition, Range } from "../internal";

export interface DelimitedHTMLBlockMeta extends Range {
  delimiter: string;
  indent: string;
}

// In STATE.BEGIN_DELIMITED_HTML_BLOCK we have already found two consecutive hyphens. We expect
// to reach the end of the line with only whitespace characters
export const BEGIN_DELIMITED_HTML_BLOCK: StateDefinition<DelimitedHTMLBlockMeta> =
  {
    name: "BEGIN_DELIMITED_HTML_BLOCK",

    enter(block) {
      block.indent = this.indent;
      block.delimiter = "";
    },

    exit() {},

    char(code, block) {
      if (code === CODE.HTML_BLOCK_DELIMITER) {
        block.delimiter += "-";
      } else {
        const startPos = this.pos;
        if (!this.consumeWhitespaceOnLine()) {
          this.pos = startPos + 1;
          this.beginHtmlBlock(undefined, true);
          this.rewind(1);
        }
      }
    },

    eol(len, block) {
      // We have reached the end of the first delimiter... we need to skip over any indentation on the next
      // line and we might also find that the multi-line, delimited block is immediately ended
      this.beginHtmlBlock(block.delimiter, false);
      handleDelimitedBlockEOL(this, len, block.delimiter, block.indent);
    },

    eof: Parser.prototype.htmlEOF,

    return() {},
  };

export function handleDelimitedBlockEOL(
  parser: Parser,
  newLineLength: number,
  delimiter: string,
  indent: string
) {
  // If we are within a delimited HTML block then we want to check if the next line is the end
  // delimiter. Since we are currently positioned at the start of the new line character our lookahead
  // will need to include the new line character, followed by the expected indentation, followed by
  // the delimiter.
  const endHtmlBlockLookahead = indent + delimiter;

  if (parser.lookAheadFor(endHtmlBlockLookahead, parser.pos + newLineLength)) {
    parser.startText(); // we want to at least include the newline as text.
    parser.endText(newLineLength);
    parser.skip(endHtmlBlockLookahead.length + newLineLength);

    if (parser.consumeWhitespaceOnLine(0)) {
      parser.endHtmlBlock();
    } else {
      parser.emitError(
        parser.pos,
        "INVALID_CHARACTER",
        "A concise mode closing block delimiter can only be followed by whitespace."
      );
    }
  } else if (parser.lookAheadFor(indent, parser.pos + newLineLength)) {
    // We know the next line does not end the multiline HTML block, but we need to check if there
    // is any indentation that we need to skip over as we continue parsing the HTML in this
    // multiline HTML block

    parser.startText();
    parser.skip(indent.length);
    // We stay in the same state since we are still parsing a multiline, delimited HTML block
  } else if (indent && !parser.onlyWhitespaceRemainsOnLine()) {
    parser.endText();
    // the next line does not have enough indentation
    // so unless it is blank (whitespace only),
    // we will end the block
    parser.endHtmlBlock();
  } else {
    parser.startText();
  }
}
