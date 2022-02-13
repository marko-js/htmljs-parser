import {
  CODE,
  STATE,
  isWhitespaceCode,
  StateDefinition,
  TemplatePart,
  peek,
} from "../internal";

export interface TagNamePart extends TemplatePart {
  curPos: number;
  nameEndPos: number;
  hadShorthandId: boolean | undefined;
  shorthandCharCode: number;
}

// We enter STATE.TAG_NAME after we encounter a "<"
// followed by a non-special character
export const TAG_NAME: StateDefinition<TagNamePart> = {
  name: "TAG_NAME",

  enter(tagName) {
    tagName.curPos = tagName.pos;
    tagName.expressions = [];
    tagName.quasis = [];
  },

  exit(tagName) {
    tagName.quasis.push({
      pos: tagName.curPos,
      endPos: tagName.endPos,
    });

    if (tagName.nameEndPos !== undefined) {
      tagName.endPos = peek(tagName.quasis)!.endPos = tagName.nameEndPos;
    }
  },

  return(childState, childPart, tagName) {
    switch (childState) {
      case STATE.EXPRESSION: {
        if (childPart.pos === childPart.endPos) {
          this.notifyError(
            childPart,
            "PLACEHOLDER_EXPRESSION_REQUIRED",
            "Invalid placeholder, the expression cannot be missing"
          );
        }

        tagName.expressions.push({
          pos: childPart.pos - 2, // include ${
          endPos: (tagName.curPos = childPart.endPos + 1), // include }
          value: {
            pos: childPart.pos,
            endPos: childPart.endPos,
          },
        });
        this.skip(1);

        break;
      }
      case STATE.TAG_NAME: {
        const tag = this.currentOpenTag!;
        const namePart = childPart as TagNamePart;
        if (namePart.shorthandCharCode === CODE.NUMBER_SIGN) {
          if (tag.shorthandId) {
            return this.notifyError(
              namePart,
              "INVALID_TAG_SHORTHAND",
              "Multiple shorthand ID parts are not allowed on the same tag"
            );
          }

          tag.shorthandId = namePart;
        } else if (tag.shorthandClassNames) {
          tag.shorthandClassNames.push(namePart);
        } else {
          tag.shorthandClassNames = [namePart];
        }
        break;
      }
    }
  },

  eol() {
    if (this.isConcise && !this.withinAttrGroup) {
      this.exitState();
    }
  },

  eof() {
    this.exitState();
  },

  char(_, code, tagName) {
    if (
      code === CODE.DOLLAR &&
      this.lookAtCharCodeAhead(1) === CODE.OPEN_CURLY_BRACE
    ) {
      tagName.quasis.push({
        pos: tagName.curPos,
        endPos: this.pos,
      });

      this.skip(2);

      this.enterState(STATE.EXPRESSION, { terminator: "}" });
      this.rewind(1);
    } else if (code === CODE.BACK_SLASH) {
      // Handle string escape sequence
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
      if (tagName.shorthandCharCode) {
        this.exitState();
      } else {
        if (tagName.nameEndPos === undefined) {
          tagName.nameEndPos = this.pos;
        }

        this.enterState(STATE.TAG_NAME, { shorthandCharCode: code });
      }
    }
  },
};
