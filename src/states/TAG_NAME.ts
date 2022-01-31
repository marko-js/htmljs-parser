import {
  CODE,
  STATE,
  isWhitespaceCode,
  cloneValue,
  StateDefinition,
  ValuePart,
} from "../internal";

export interface TagNamePart extends ValuePart {
  shorthandCharCode: number;
  expressions: ValuePart[];
  quasis: ValuePart[];
}

// We enter STATE.TAG_NAME after we encounter a "<"
// followed by a non-special character
export const TAG_NAME: StateDefinition<TagNamePart> = {
  name: "TAG_NAME",

  enter(tagName) {
    tagName.value = "";
    tagName.expressions = [];
    tagName.quasis = [
      { value: "", pos: tagName.pos, endPos: tagName.pos } as ValuePart,
    ];
  },

  exit(tagName) {
    // even though we parse shorthands here, we don't want to include those in the tagName pos.
    tagName.quasis[tagName.quasis.length - 1].endPos = tagName.endPos =
      tagName.pos + tagName.value.length + (tagName.shorthandCharCode ? 1 : 0);
  },

  return(childState, childPart, tagName) {
    switch (childState) {
      case STATE.EXPRESSION: {
        const exprPart = childPart as STATE.ExpressionPart;
        if (!exprPart.value) {
          this.notifyError(
            exprPart.pos,
            "PLACEHOLDER_EXPRESSION_REQUIRED",
            "Invalid placeholder, the expression cannot be missing"
          );
        }

        tagName.value += `\${${exprPart.value}}`;
        tagName.expressions.push(cloneValue(exprPart));
        tagName.quasis[tagName.quasis.length - 1].endPos = exprPart.pos;
        tagName.quasis.push({
          value: "",
          pos: exprPart.endPos + 1,
          endPos: exprPart.endPos + 1,
        } as ValuePart);
        this.skip(1);

        break;
      }
      case STATE.TAG_NAME: {
        const namePart = childPart as TagNamePart;
        const tag = this.currentOpenTag!;
        if (namePart.shorthandCharCode === CODE.NUMBER_SIGN) {
          if (tag.shorthandId) {
            return this.notifyError(
              namePart.pos,
              "INVALID_TAG_SHORTHAND",
              "Multiple shorthand ID parts are not allowed on the same tag"
            );
          }

          tag.shorthandId = cloneValue(namePart);
        } else if (tag.shorthandClassNames) {
          tag.shorthandClassNames.push(cloneValue(namePart));
        } else {
          tag.shorthandClassNames = [cloneValue(namePart)];
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

  char(ch, code, tagName) {
    if (
      code === CODE.DOLLAR &&
      this.lookAtCharCodeAhead(1) === CODE.OPEN_CURLY_BRACE
    ) {
      this.skip(1);
      this.enterState(STATE.EXPRESSION, { terminator: "}" });
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
};
