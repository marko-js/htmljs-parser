import { Parser, CODE, STATE, isWhitespaceCode } from "../internal";

export const TAG_NAME_SHORTHAND = Parser.createState({
  name: "TAG_NAME_SHORTHAND",

  enter(oldState, shorthand) {
    var parser = this;
    shorthand.currentPart = null;
    shorthand.hasId = false;
    shorthand.beginPart = function (type) {
      shorthand.currentPart = {
        type: type,
        stringParts: [],
        rawParts: [],
        text: "",
        _endText() {
          var text = this.text;

          if (text) {
            this.stringParts.push(JSON.stringify(text));
            this.rawParts.push({
              text: text,
              pos: parser.pos - text.length,
              endPos: parser.pos,
            });
          }

          this.text = "";
        },
        addPlaceholder(placeholder) {
          var startPos = placeholder.pos + (placeholder.escape ? 2 : 3);
          var endPos = placeholder.endPos - 1;
          this._endText();
          this.stringParts.push("(" + placeholder.value + ")");
          this.rawParts.push({
            expression: parser.src.slice(startPos, endPos),
            pos: startPos,
            endPos: endPos,
          });
        },
        end() {
          this._endText();

          var expression = this.stringParts.join("+");

          if (type === "id") {
            parser.currentOpenTag.shorthandId = {
              value: expression,
              rawParts: this.rawParts,
            };
          } else if (type === "class") {
            if (!parser.currentOpenTag.shorthandClassNames) {
              parser.currentOpenTag.shorthandClassNames = [];
            }

            parser.currentOpenTag.shorthandClassNames.push({
              value: expression,
              rawParts: this.rawParts,
            });
          }
        },
      };
    };
  },

  exit(shorthand) {
    if (shorthand.currentPart) {
      shorthand.currentPart.end();
    }
    this.enterState(STATE.WITHIN_OPEN_TAG);
  },

  return(childState, childPart, shorthand) {
    switch (childState) {
      case STATE.PLACEHOLDER: {
        shorthand.currentPart.addPlaceholder(childPart);
      }
    }
  },

  eol(str) {
    this.currentOpenTag.tagNameEnd = this.pos;
    this.exitState();

    if (this.state !== STATE.WITHIN_OPEN_TAG) {
      // Make sure we transition into parsing within the open tag
      this.enterState(STATE.WITHIN_OPEN_TAG);
    }

    if (this.isConcise) {
      this.openTagEOL();
    }
  },

  eof(shorthand) {
    this.exitState();

    if (this.isConcise) {
      this.openTagEOF();
    } else {
      return this.notifyError(
        shorthand.pos,
        "INVALID_TAG_SHORTHAND",
        "EOF reached will parsing id/class shorthand in tag name"
      );
    }
  },

  char(ch, code, shorthand) {
    if (!this.isConcise) {
      if (code === CODE.CLOSE_ANGLE_BRACKET || code === CODE.FORWARD_SLASH) {
        this.currentOpenTag.tagNameEnd = this.pos;
        this.exitState();
        this.rewind(1);
        return;
      }
    }

    if (isWhitespaceCode(code)) {
      this.exitState();
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
          shorthand.pos,
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
      this.exitState();
      this.rewind(1);
      this.enterState(STATE.TAG_ARGS);
    } else if (code === CODE.PIPE) {
      this.exitState();
      this.rewind(1);
      this.enterState(STATE.TAG_PARAMS);
    } else {
      shorthand.currentPart.text += ch;
    }
  },
});
