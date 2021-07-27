import { Parser, CODE } from "../internal";

// We enter STATE.DECLARATION after we encounter a "<?"
// while in the STATE.HTML_CONTENT.
// We leave STATE.DECLARATION if we see a "?>" or ">".
export const DECLARATION = Parser.createState({
  name: "DECLARATION",

  eol(str, declaration) {
    declaration.value += str;
  },

  eof(declaration) {
    this.notifyError(
      declaration.pos,
      "MALFORMED_DECLARATION",
      "EOF reached while parsing declaration"
    );
  },

  enter(oldState, declaration) {
    this.endText();
    declaration.value = "";
  },

  exit(declaration) {
    this.notifiers.notifyDeclaration(declaration);
  },

  char(ch, code, declaration) {
    if (code === CODE.QUESTION) {
      var nextCode = this.lookAtCharCodeAhead(1);
      if (nextCode === CODE.CLOSE_ANGLE_BRACKET) {
        this.exitState("?>");
      }
    } else if (code === CODE.CLOSE_ANGLE_BRACKET) {
      this.exitState(">");
    } else {
      declaration.value += ch;
    }
  },
});
