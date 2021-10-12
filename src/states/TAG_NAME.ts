import { Parser, CODE, STATE, isWhitespaceCode } from "../internal";

// We enter STATE.TAG_NAME after we encounter a "<"
// followed by a non-special character
export const TAG_NAME = Parser.createState({
  name: "TAG_NAME",

  enter(oldState, tagName) {
    tagName.text = tagName.rawValue = "";
    if (tagName.shorthandCharCode) {
      tagName.rawParts = [];
      tagName.stringParts = [];
    }
  },

  exit(tagName) {
    tagName.endPos = this.pos;
    if (tagName.text && tagName.stringParts) {
      tagName.stringParts.push(JSON.stringify(tagName.text));
      tagName.rawParts.push({
        text: tagName.text,
        pos: this.pos - tagName.text.length,
        endPos: this.pos
      });
    }
  },

  return(childState, childPart, tagName) {
    switch (childState) {
      case STATE.STRING: {
        tagName.text += childPart.value;
        tagName.rawValue += childPart.value;
        break;
      }
      case STATE.PLACEHOLDER: {
        tagName.rawParts = [];
        tagName.stringParts = tagName.stringParts || [];

        if (tagName.text) {
          tagName.stringParts.push(JSON.stringify(tagName.text));
          tagName.rawParts.push({
            text: tagName.text,
            pos: this.pos - tagName.text.length,
            endPos: this.pos
          });
          tagName.text = "";
        }

        tagName.rawValue += this.substring(
          childPart.pos,
          childPart.endPos
        );

        tagName.stringParts.push("(" + childPart.value + ")");
        tagName.rawParts.push({
          expression: childPart.value,
          pos: childPart.pos,
          endPos: childPart.endPos
        });
        break;
      }
      case STATE.TAG_NAME: {
        const expression = childPart.stringParts.join("+");
        if (childPart.shorthandCharCode === CODE.NUMBER_SIGN) {
          if (tagName.shorthandId) {
            return this.notifyError(
              childPart.pos,
              "INVALID_TAG_SHORTHAND",
              "Multiple shorthand ID parts are not allowed on the same tag"
            );
          }
          tagName.shorthandId = {
            value: expression,
            rawParts: childPart.rawParts,
          };
        } else {
          if (!tagName.shorthandClassNames) {
            tagName.shorthandClassNames = [];
          }

          tagName.shorthandClassNames.push({
            value: expression,
            rawParts: childPart.rawParts,
          });
        }
        break;
      }
    }
  },

  eol() {
    if (this.isConcise && !this.currentOpenTag.withinAttrGroup) {
      this.exitState();
    }
  },

  eof() {
    this.exitState();
  },

  char(ch, code, tagName) {
    var nextCh;
    if (
      code === CODE.DOLLAR &&
      this.lookAtCharCodeAhead(1) === CODE.OPEN_CURLY_BRACE
    ) {
      this.enterState(STATE.PLACEHOLDER, { withinTagName: !tagName.shorthandCharCode });
      this.skip(1);
    } else if (code === CODE.BACK_SLASH) {
      // Handle string escape sequence
      nextCh = this.lookAtCharAhead(1);
      this.skip(1);

      tagName.text += nextCh;
      tagName.rawValue += ch + nextCh;
    } else if (
      isWhitespaceCode(code) ||
      code === CODE.EQUAL ||
      (code === CODE.COLON && this.lookAtCharCodeAhead(1) === CODE.EQUAL) ||
      code === CODE.OPEN_PAREN ||
      code === CODE.FORWARD_SLASH ||
      code === CODE.PIPE ||
      (this.isConcise
        ? code === CODE.SEMICOLON
        : code === CODE.CLOSE_ANGLE_BRACKET)
    ) {
      this.exitState();
    } else if (code === CODE.PERIOD || code === CODE.NUMBER_SIGN) {
      if (!tagName.shorthandCharCode) {
        this.enterState(STATE.TAG_NAME, { shorthandCharCode: code });
      } else {
        this.exitState();
      }
    } else {
      tagName.text += ch;
      tagName.rawValue += ch;
    }
  },
});
