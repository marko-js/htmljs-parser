import { Parser, CODE, StateDefinition } from "../internal";

// In STATE.BEGIN_DELIMITED_HTML_BLOCK we have already found two consecutive hyphens. We expect
// to reach the end of the line with only whitespace characters
export const BEGIN_DELIMITED_HTML_BLOCK: StateDefinition = {
  name: "BEGIN_DELIMITED_HTML_BLOCK",

  eol(newLine) {
    // We have reached the end of the first delimiter... we need to skip over any indentation on the next
    // line and we might also find that the multi-line, delimited block is immediately ended
    this.beginHtmlBlock(this.htmlBlockDelimiter);
    this.handleDelimitedBlockEOL(newLine);
  },

  eof: Parser.prototype.htmlEOF,

  char(ch, code) {
    if (code === CODE.HTML_BLOCK_DELIMITER) {
      this.htmlBlockDelimiter += ch;
    } else if (!this.onlyWhitespaceRemainsOnLine()) {
      this.isWithinSingleLineHtmlBlock = true;
      this.beginHtmlBlock();
    }
  },
};
