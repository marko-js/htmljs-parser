import { CODE, StateDefinition, ValuePart } from "../internal";

// We enter STATE.HTML_COMMENT after we encounter a "<--"
// while in the STATE.HTML_CONTENT.
// We leave STATE.HTML_COMMENT when we see a "-->".
export const HTML_COMMENT: StateDefinition<ValuePart> = {
  name: "HTML_COMMENT",

  enter(comment) {
    this.endText();
    comment.value = "<!--";
  },

  exit(comment) {
    this.notifiers.notifyComment(comment);
  },

  eol(str, comment) {
    comment.value += str;
  },

  eof(comment) {
    this.notifyError(
      comment,
      "MALFORMED_COMMENT",
      "EOF reached while parsing comment"
    );
  },

  char(ch, code, comment) {
    if (code === CODE.HYPHEN) {
      let offset = 1;
      let next: number;
      while ((next = this.lookAtCharCodeAhead(offset++)) === CODE.HYPHEN);
      comment.value += this.substring(this.pos, this.pos + offset);
      this.skip(offset);

      if (next === CODE.CLOSE_ANGLE_BRACKET) {
        this.exitState();
      }
    } else {
      comment.value += ch;
    }
  },
};
