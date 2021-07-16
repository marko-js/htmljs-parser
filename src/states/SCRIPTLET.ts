import { Parser, CODE } from "../internal";

// We enter STATE.SCRIPTLET after we encounter a "<%" while in STATE.HTML_CONTENT.
// We leave STATE.SCRIPTLET if we see a "%>".
export const SCRIPTLET = Parser.createState({
  name: "SCRIPTLET",

  eol(str) {
    this.currentPart.value += str;
  },

  eof() {
    this.notifyError(
      this.currentPart.pos,
      "MALFORMED_SCRIPTLET",
      "EOF reached while parsing scriptlet"
    );
  },

  comment(comment) {
    this.currentPart.value += comment.rawValue;
  },

  char(ch, code) {
    if (this.currentPart.quoteCharCode) {
      this.currentPart.value += ch;

      // We are within a string... only look for ending string code
      if (code === CODE.BACK_SLASH) {
        // Handle string escape sequence
        this.currentPart.value += this.lookAtCharAhead(1);
        this.skip(1);
      } else if (code === this.currentPart.quoteCharCode) {
        this.currentPart.quoteCharCode = null;
      }
      return;
    } else if (code === CODE.FORWARD_SLASH) {
      if (this.lookAtCharCodeAhead(1) === CODE.ASTERISK) {
        // Skip over code inside a JavaScript block comment
        this.beginBlockComment();
        this.skip(1);
        return;
      }
    } else if (code === CODE.SINGLE_QUOTE || code === CODE.DOUBLE_QUOTE) {
      this.currentPart.quoteCharCode = code;
    } else if (code === CODE.PERCENT) {
      if (this.lookAtCharCodeAhead(1) === CODE.CLOSE_ANGLE_BRACKET) {
        this.endScriptlet(this.pos + 2 /* end pos */);
        this.skip(1); // Skip over the closing right angle bracket
        return;
      }
    }

    this.currentPart.value += ch;
  },
});
