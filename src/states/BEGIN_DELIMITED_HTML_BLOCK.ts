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

    eol(len, block) {
      // We have reached the end of the first delimiter... we need to skip over any indentation on the next
      // line and we might also find that the multi-line, delimited block is immediately ended
      this.beginHtmlBlock(block.delimiter, false);
      this.handleDelimitedBlockEOL(len, block.delimiter, block.indent);
    },

    eof: Parser.prototype.htmlEOF,

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
  };
