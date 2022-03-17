import { CODE, StateDefinition } from "../internal";

// We enter STATE.HTML_COMMENT after we encounter a "<--"
// while in the STATE.HTML_CONTENT.
// We leave STATE.HTML_COMMENT when we see a "-->".
export const HTML_COMMENT: StateDefinition = {
  name: "HTML_COMMENT",

  enter(parent, start) {
    this.endText();
    return {
      state: HTML_COMMENT,
      parent,
      start,
      end: start,
    };
  },

  exit(comment) {
    this.handlers.onComment?.({
      start: comment.start,
      end: comment.end,
      value: {
        start: comment.start + 4, // strip <!--
        end: comment.end - 3, // strip -->
      },
    });
  },

  char(code) {
    if (code === CODE.HYPHEN) {
      let offset = 1;
      let next: number;
      while ((next = this.lookAtCharCodeAhead(offset++)) === CODE.HYPHEN);
      this.skip(offset); // skip all -

      if (next === CODE.CLOSE_ANGLE_BRACKET) {
        this.exitState();
      }
    }
  },

  eol() {},

  eof(comment) {
    this.emitError(
      comment,
      "MALFORMED_COMMENT",
      "EOF reached while parsing comment"
    );
  },

  return() {},
};
