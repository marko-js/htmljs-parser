import {
  CODE,
  Parser,
  type StateDefinition,
  type Range,
  ErrorCode,
} from "../internal";

// We enter STATE.DECLARATION after we encounter a "<?"
// while in the STATE.HTML_CONTENT.
// We leave STATE.DECLARATION if we see a "?>" or ">".

export const DECLARATION: StateDefinition = {
  name: "DECLARATION",

  enter(parent, start) {
    this.endText();
    return {
      state: DECLARATION,
      parent,
      start,
      end: start,
    };
  },

  exit() {},

  parse(data, maxPos, declaration) {
    const idx = data.indexOf(">", this.pos);
    if (idx === -1) {
      return this.emitError(
        declaration,
        ErrorCode.MALFORMED_DECLARATION,
        "EOF reached while parsing declaration",
      );
    }

    if (idx > this.pos && data.charCodeAt(idx - 1) === CODE.QUESTION) {
      this.pos = idx - 1;
      exitDeclaration(this, declaration, 2); // skip ?>
    } else {
      this.pos = idx;
      exitDeclaration(this, declaration, 1); // skip >
    }
  },

  return() {},
};

function exitDeclaration(
  parser: Parser,
  declaration: Range,
  closeOffset: number,
) {
  parser.pos += closeOffset;
  parser.exitState();
  parser.options.onDeclaration?.({
    start: declaration.start,
    end: declaration.end,
    value: {
      start: declaration.start + 2, // strip <?
      end: declaration.end - closeOffset, // > or ?>
    },
  });
}
