import { Parser, CODE } from "../internal";

export const TEMPLATE_STRING = Parser.createState({
  name: "TEMPLATE_STRING",

  placeholder: function (placeholder) {
    this.currentPart.value += "${" + placeholder.value + "}";
  },

  eol(str) {
    this.currentPart.value += str;
  },

  eof() {
    this.notifyError(
      this.pos,
      "INVALID_TEMPLATE_STRING",
      "EOF reached while parsing template string expression"
    );
  },

  char(ch, code) {
    var nextCh;
    if (
      code === CODE.DOLLAR &&
      this.lookAtCharCodeAhead(1) === CODE.OPEN_CURLY_BRACE
    ) {
      this.beginPlaceholder(false);
    } else {
      this.currentPart.value += ch;
      if (code === CODE.BACK_SLASH) {
        // Handle string escape sequence
        nextCh = this.lookAtCharAhead(1);
        this.skip(1);

        this.currentPart.value += nextCh;
      } else if (code === CODE.BACKTICK) {
        this.endTemplateString();
      }
    }
  },
});
