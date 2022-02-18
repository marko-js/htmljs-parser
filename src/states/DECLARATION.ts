import { CODE, Parser, StateDefinition, Range } from "../internal";

// We enter STATE.DECLARATION after we encounter a "<?"
// while in the STATE.HTML_CONTENT.
// We leave STATE.DECLARATION if we see a "?>" or ">".

export const DECLARATION: StateDefinition = {
  name: "DECLARATION",

  enter() {
    this.endText();
  },

  eof(declaration) {
    this.notifyError(
      declaration,
      "MALFORMED_DECLARATION",
      "EOF reached while parsing declaration"
    );
  },

  char(_, code, declaration) {
    if (code === CODE.QUESTION) {
      if (this.lookAtCharCodeAhead(1) === CODE.CLOSE_ANGLE_BRACKET) {
        exitDeclaration(this, declaration, 2);
      }
    } else if (code === CODE.CLOSE_ANGLE_BRACKET) {
      exitDeclaration(this, declaration, 1);
    }
  },
};

function exitDeclaration(
  parser: Parser,
  declaration: Range,
  closeOffset: number
) {
  parser.skip(closeOffset);
  parser.exitState();
  parser.notifiers.notifyDeclaration({
    pos: declaration.pos,
    endPos: declaration.endPos,
    value: {
      pos: declaration.pos + 2, // strip <?
      endPos: declaration.endPos - closeOffset, // > or ?>
    },
  });
}
