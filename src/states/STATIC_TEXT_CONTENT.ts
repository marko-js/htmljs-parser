import { checkForClosingTag } from ".";
import { Parser, CODE, StateDefinition } from "../internal";

// We enter STATE.STATIC_TEXT_CONTENT when a listener manually chooses
// to enter this state after seeing an openTag event for a tag
// whose content should not be parsed at all (except for the purpose
// of looking for the end tag).
export const STATIC_TEXT_CONTENT: StateDefinition = {
  name: "STATIC_TEXT_CONTENT",

  enter() {
    this.textParseMode = "static-text";
  },

  eol(newLine) {
    this.addText(newLine);

    if (this.isWithinSingleLineHtmlBlock) {
      // We are parsing "HTML" and we reached the end of the line. If we are within a single
      // line HTML block then we should return back to the state to parse concise HTML.
      // A single line HTML block can be at the end of the tag or on its own line:
      //
      // span class="hello" - This is an HTML block at the end of a tag
      //     - This is an HTML block on its own line
      //
      this.endHtmlBlock();
    } else if (this.htmlBlockDelimiter) {
      this.handleDelimitedBlockEOL(newLine);
    }
  },

  eof: Parser.prototype.htmlEOF,

  char(ch, code) {
    // See if we need to see if we reached the closing tag...
    if (
      !this.isConcise &&
      code === CODE.OPEN_ANGLE_BRACKET &&
      checkForClosingTag(this)
    )
      return;

    this.addText(ch);
  },
};
