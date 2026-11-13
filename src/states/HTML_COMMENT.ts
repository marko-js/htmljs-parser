import type { StateDefinition } from "../internal.ts";
import * as ErrorCode from "../util/error-code.ts";

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
        // strip -->, which shares a hyphen with the <!-- of "<!--->"
        end: Math.max(comment.start + 4, comment.end - 3),
      },
    });
  },

  parse(data, _maxPos, comment) {
    // The comment ends at the first "-->", so a "->" inside it (eg "a->b") is
    // content. Searching from the last hyphen of "<!--" also ends "<!--->".
    const idx = data.indexOf("-->", this.pos - 1);
    if (idx === -1) {
      return this.emitError(
        comment,
        ErrorCode.MALFORMED_COMMENT,
        "EOF reached while parsing comment",
      );
    }

    this.pos = idx + 3; // skip -->
    this.exitState();
  },

  /* node:coverage ignore next */ // never has child states
  return() {},
};
