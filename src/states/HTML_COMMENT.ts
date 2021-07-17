import { Parser, CODE } from "../internal";

// We enter STATE.HTML_COMMENT after we encounter a "<--"
// while in the STATE.HTML_CONTENT.
// We leave STATE.HTML_COMMENT when we see a "-->".
export const HTML_COMMENT = Parser.createState({
  name: "HTML_COMMENT",

  enter(oldState, comment) {
    this.endText();
    comment.value = "";
  },

  exit(comment) {
    comment.endPos = this.pos + 3;
    this.notifiers.notifyComment(comment);
  },

  eol(newLineChars, comment) {
    comment.value += newLineChars;
  },

  eof(comment) {
    this.notifyError(
      comment.pos,
      "MALFORMED_COMMENT",
      "EOF reached while parsing comment"
    );
  },

  char(ch, code, comment) {
    if (code === CODE.HYPHEN) {
      var match = this.lookAheadFor("->");
      if (match) {
        comment.endPos = this.pos + 3;
        this.exitState();
        this.skip(match.length);
      } else {
        comment.value += ch;
      }
    } else {
      comment.value += ch;
    }
  },
});
