import { Parser, CODE, STATE } from "../internal";

export const TEMPLATE_STRING = Parser.createState({
  name: "TEMPLATE_STRING",

  enter(oldState, templateString) {
    templateString.value = "`";
  },

  return(childState, childPart, templateString) {
    switch (childState) {
      case STATE.PLACEHOLDER: {
        templateString.value += "${" + childPart.value + "}";
        break;
      }
    }
  },

  eol(str, templateString) {
    templateString.value += str;
  },

  eof() {
    this.notifyError(
      this.pos,
      "INVALID_TEMPLATE_STRING",
      "EOF reached while parsing template string expression"
    );
  },

  char(ch, code, templateString) {
    var nextCh;
    if (
      code === CODE.DOLLAR &&
      this.lookAtCharCodeAhead(1) === CODE.OPEN_CURLY_BRACE
    ) {
      this.enterState(STATE.PLACEHOLDER, { escape: false });
      this.skip(1);
    } else {
      templateString.value += ch;
      if (code === CODE.BACK_SLASH) {
        // Handle string escape sequence
        nextCh = this.lookAtCharAhead(1);
        this.skip(1);

        templateString.value += nextCh;
      } else if (code === CODE.BACKTICK) {
        this.exitState("`");
      }
    }
  },
});
