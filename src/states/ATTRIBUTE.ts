import { Parser, STATE, evaluateStringExpression, CODE, NUMBER_REGEX, isWhitespaceCode } from "../internal";

// We enter STATE.ATTRIBUTE when we see a non-whitespace
// character after reading the tag name
export const ATTRIBUTE = Parser.createState({
  name: "ATTRIBUTE",

  enter(oldState, attr) {
    this.currentAttribute = attr;
  },

  exit(attr) {
    if (this.lookAtCharCodeAhead(0) === CODE.COMMA) {
      attr.endedWithComma = true;
    }
    this.currentAttribute = null;
  },

  eol() {
    if (this.isConcise) {
      this.exitState();
    }
  },

  eof(attr) {
    if (this.isConcise) {
      this.exitState();
    } else {
      return this.notifyError(
        attr.pos,
        "MALFORMED_OPEN_TAG",
        'EOF reached while parsing attribute "' +
          attr.name +
          '" for the "' +
          this.currentOpenTag.tagName +
          '" tag'
      );
    }
  },

  return(childState, childPart, attr) {
    switch (childState) {
      case STATE.EXPRESSION: {
        switch (childPart.part) {
          case "NAME": {
            attr.name = childPart.value;
            attr.pos = childPart.pos;
            attr.endPos = childPart.endPos;
            break;
          }
          case "ARGUMENT": {
            if (attr.argument != null) {
              this.notifyError(
                childPart.endPos,
                "ILLEGAL_ATTRIBUTE_ARGUMENT",
                "An attribute can only have one argument"
              );
              return;
            }

            attr.argument = childPart;
            this.skip(1); // skip closing paren
            break;
          }
          case "BLOCK": {
            if (attr.argument) {
              attr.method = true;
              attr.pos = attr.argument.pos;
              attr.endPos = childPart.endPos + 1;
              attr.value = this.data.substring(attr.pos, attr.endPos);
              attr.argument = undefined;
              this.exitState("}");
            } else {
              attr.name = "{" + childPart.value + "}";
              attr.pos = childPart.pos - 1;
              attr.endPos = childPart.endPos + 1;
              attr.block = true;
              this.exitState("}");
            }
            break;
          }
          case "VALUE": {
            const value = childPart.value;

            if (value === "") {
              return this.notifyError(
                childPart.pos,
                "ILLEGAL_ATTRIBUTE_VALUE",
                'No attribute value found after "="'
              );
            }

            if (childPart.hasUnenclosedWhitespace) {
              this.currentOpenTag.hasUnenclosedWhitespace = true;
            }

            if (!attr.name) {
              attr.name = "default";
              attr.default = true;
            }

            attr.value = value;
            attr.pos = childPart.pos;
            attr.endPos = childPart.endPos;

            // If the expression evaluates to a literal value then add the
            // `literalValue` property to the attribute
            if (childPart.isStringLiteral) {
              attr.literalValue = evaluateStringExpression(
                value,
                childPart.pos,
                this
              );
            } else if (value === "true") {
              attr.literalValue = true;
            } else if (value === "false") {
              attr.literalValue = false;
            } else if (value === "null") {
              attr.literalValue = null;
            } else if (value === "undefined") {
              attr.literalValue = undefined;
            } else if (NUMBER_REGEX.test(value)) {
              attr.literalValue = Number(value);
            }

            this.exitState();
            break;
          }
        }
      }
    }
  },

  char(ch, code, attr) {
    if (isWhitespaceCode(code)) {
      return;
    } else if (
      code === CODE.EQUAL ||
      (code === CODE.COLON && this.lookAtCharCodeAhead(1) === CODE.EQUAL)
    ) {
      if (code === CODE.COLON) {
        attr.bound = true;
        this.skip(1);
      }

      this.consumeWhitespace();
      this.enterState(STATE.EXPRESSION, { 
        part: "VALUE",
        terminatedByWhitespace: true, 
        terminator: [
          this.isConcise ? "]" : "/>", 
          this.isConcise ? ";" : ">", 
          ","
        ]
      });
    } else if (code === CODE.OPEN_PAREN) {
      this.enterState(STATE.EXPRESSION, { 
        part: "ARGUMENT",
        terminatedByWhitespace: false, 
        terminator: ")"
      });
    } else if (code === CODE.OPEN_CURLY_BRACE && (!attr.name || attr.argument)) {
      this.enterState(STATE.EXPRESSION, { 
        part: "BLOCK",
        terminatedByWhitespace: false, 
        terminator: "}"
      });
    } else if (!attr.name) {
      this.rewind(1);
      this.enterState(STATE.EXPRESSION, { 
        part: "NAME",
        terminatedByWhitespace: true, 
        skipOperators: true,
        terminator: [
          this.isConcise ? "]" : "/>", 
          this.isConcise ? ";" : ">", 
          ":=",
          "=", 
          ",", 
          "("
        ],
        allowEscapes: true
      });
    } else {
      this.exitState();
    }
  },
});
