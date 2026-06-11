import { ErrorCode, type StateDefinition } from "../internal";

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
    this.options.onComment?.({
      start: comment.start,
      end: comment.end,
      value: {
        start: comment.start + 4, // strip <!--
        end: comment.end - 3, // strip -->
      },
    });
  },

  parse(data, maxPos, comment) {
    // The comment ends at the first "-" directly followed by ">", which also
    // matches the final hyphens of "-->", "--->", etc.
    const idx = data.indexOf("->", this.pos);
    if (idx === -1) {
      return this.emitError(
        comment,
        ErrorCode.MALFORMED_COMMENT,
        "EOF reached while parsing comment",
      );
    }

    this.pos = idx + 2; // skip ->
    this.exitState();
  },

  /* c8 ignore next -- never has child states */
  return() {},
};
