import { Parser, CODE, STATE, isWhitespaceCode, cloneValue } from "../internal";

// We enter STATE.TAG_NAME after we encounter a "<"
// followed by a non-special character
export const TAG_NAME = Parser.createState({
  name: "TAG_NAME",

  enter(oldState, tagName) {
    tagName.value = "";
    tagName.expressions = [];
    tagName.quasis = [{ value: "", pos: tagName.pos, endPos: tagName.pos }];
  },

  exit(tagName) {
    // even though we parse shorthands here, we don't want to include those in the tagName pos.
    tagName.quasis[tagName.quasis.length - 1].endPos = tagName.endPos =
      tagName.pos + tagName.value.length + (tagName.shorthandCharCode ? 1 : 0);
  },

  return(childState, childPart, tagName) {
    switch (childState) {
      case STATE.PLACEHOLDER: {
        tagName.value += `\${${childPart.value}}`;
        tagName.expressions.push(cloneValue(childPart));
        tagName.quasis[tagName.quasis.length - 1].endPos = childPart.pos;
        tagName.quasis.push({
          value: "",
          pos: childPart.endPos + 1,
          endPos: childPart.endPos + 1,
        });

        break;
      }
      case STATE.TAG_NAME: {
        const tag = this.currentOpenTag;
        if (childPart.shorthandCharCode === CODE.NUMBER_SIGN) {
          if (tag.shorthandId) {
            return this.notifyError(
              childPart.pos,
              "INVALID_TAG_SHORTHAND",
              "Multiple shorthand ID parts are not allowed on the same tag"
            );
          }

          tag.shorthandId = cloneValue(childPart);
        } else if (tag.shorthandClassNames) {
          tag.shorthandClassNames.push(cloneValue(childPart));
        } else {
          tag.shorthandClassNames = [cloneValue(childPart)];
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
    if (
      code === CODE.DOLLAR &&
      this.lookAtCharCodeAhead(1) === CODE.OPEN_CURLY_BRACE
    ) {
      if (tagName.expression) {
        return this.notifyError(
          this.pos,
          "INVALID_DYNAMIC_TAG_NAME",
          "Only a single interpolated value can be placed into the tag name"
        );
      }

      this.enterState(STATE.PLACEHOLDER, {
        withinTagName: !tagName.shorthandCharCode,
      });
      this.skip(1);
    } else if (code === CODE.BACK_SLASH) {
      // Handle string escape sequence
      const next = this.lookAtCharAhead(1);
      tagName.value += next;
      tagName.quasis[tagName.quasis.length - 1].value += next;
      this.skip(1);
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
      tagName.value += ch;
      tagName.quasis[tagName.quasis.length - 1].value += ch;
    }
  },
});
