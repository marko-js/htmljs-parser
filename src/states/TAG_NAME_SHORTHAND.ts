import { Parser, CODE, STATE, isWhitespaceCode } from "../internal";

export const TAG_NAME_SHORTHAND = Parser.createState({
  name: "TAG_NAME_SHORTHAND",

  placeholder(placeholder) {
    var shorthand = this.currentPart;
    shorthand.currentPart.addPlaceholder(placeholder);
  },

  eol(str) {
    this.currentOpenTag.tagNameEnd = this.pos;
    this.endTagNameShorthand();

    if (this.state !== STATE.WITHIN_OPEN_TAG) {
      // Make sure we transition into parsing within the open tag
      this.enterState(STATE.WITHIN_OPEN_TAG);
    }

    if (this.isConcise) {
      this.openTagEOL();
    }
  },

  eof() {
    this.endTagNameShorthand();

    if (this.isConcise) {
      this.openTagEOF();
    } else {
      return this.notifyError(
        this.currentPart.pos,
        "INVALID_TAG_SHORTHAND",
        "EOF reached will parsing id/class shorthand in tag name"
      );
    }
  },

  char(ch, code) {
    var shorthand = this.currentPart;
    if (!this.isConcise) {
      if (code === CODE.CLOSE_ANGLE_BRACKET || code === CODE.FORWARD_SLASH) {
        this.currentOpenTag.tagNameEnd = this.pos;
        this.endTagNameShorthand();
        this.rewind(1);
        return;
      }
    }

    if (isWhitespaceCode(code)) {
      this.endTagNameShorthand();
      this.currentOpenTag.tagNameEnd = this.pos;
      if (this.state !== STATE.WITHIN_OPEN_TAG) {
        this.enterState(STATE.WITHIN_OPEN_TAG);
      }
      return;
    }

    if (code === CODE.PERIOD) {
      if (shorthand.currentPart) {
        shorthand.currentPart.end();
      }

      shorthand.beginPart("class");
    } else if (code === CODE.NUMBER_SIGN) {
      if (shorthand.hasId) {
        return this.notifyError(
          this.currentPart.pos,
          "INVALID_TAG_SHORTHAND",
          "Multiple shorthand ID parts are not allowed on the same tag"
        );
      }

      shorthand.hasId = true;

      if (shorthand.currentPart) {
        shorthand.currentPart.end();
      }

      shorthand.beginPart("id");
    } else if (
      !this.ignorePlaceholders &&
      this.checkForEscapedEscapedPlaceholder(ch, code)
    ) {
      shorthand.currentPart.text += "\\";
      this.skip(1);
    } else if (
      !this.ignorePlaceholders &&
      this.checkForEscapedPlaceholder(ch, code)
    ) {
      shorthand.currentPart.text += "$";
      this.skip(1);
    } else if (!this.ignorePlaceholders && this.checkForPlaceholder(ch, code)) {
      // We went into placeholder state...
    } else if (code === CODE.OPEN_PAREN) {
      this.endTagNameShorthand();
      this.rewind(1);
      this.enterState(STATE.TAG_ARGS);
    } else if (code === CODE.PIPE) {
      this.endTagNameShorthand();
      this.rewind(1);
      this.enterState(STATE.TAG_PARAMS);
    } else {
      shorthand.currentPart.text += ch;
    }
  },
});
