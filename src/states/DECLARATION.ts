import { CODE, Parser, StateDefinition, Range, Events } from "../internal";

// We enter STATE.DECLARATION after we encounter a "<?"
// while in the STATE.HTML_CONTENT.
// We leave STATE.DECLARATION if we see a "?>" or ">".

export const DECLARATION: StateDefinition = {
  name: "DECLARATION",

  enter() {
    this.endText();
  },

  eof(declaration) {
    this.emitError(
      declaration,
      "MALFORMED_DECLARATION",
      "EOF reached while parsing declaration"
    );
  },

  char(code, declaration) {
    if (code === CODE.QUESTION) {
      if (this.lookAtCharCodeAhead(1) === CODE.CLOSE_ANGLE_BRACKET) {
        exitDeclaration(this, declaration, 2); // will skip ?>
      }
    } else if (code === CODE.CLOSE_ANGLE_BRACKET) {
      exitDeclaration(this, declaration, 1); // will skip >
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
  parser.emit({
    type: Events.Types.Declaration,
    start: declaration.start,
    end: declaration.end,
    value: {
      start: declaration.start + 2, // strip <?
      end: declaration.end - closeOffset, // > or ?>
    },
  });
}
