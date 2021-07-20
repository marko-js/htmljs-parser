import { Parser, STATE, evaluateStringExpression, CODE, NUMBER_REGEX, isWhitespaceCode } from "../internal";

// We enter STATE.ATTRIBUTE when we see a non-whitespace
// character after reading the tag name
export const ATTRIBUTE = Parser.createState({
  name: "ATTRIBUTE",

  enter(oldState) {
    this.currentAttribute = {};
    this.currentOpenTag.attributes.push(this.currentAttribute);
  },

  exit() {
    if (this.lookAtCharCodeAhead(1) === CODE.COMMA) {
      this.currentOpenTag.requiresCommas = true;
      this.currentAttribute.endedWithComma = true;
    }

    this.currentAttribute = null;

    if (this.state !== STATE.WITHIN_OPEN_TAG) {
      this.enterState(STATE.WITHIN_OPEN_TAG);
    }
  },

  eol() {
    if (this.isConcise) {
      this.rewind(1);
      this.exitState();
    }
  },

  eof(attribute) {
    if (this.isConcise) {
      this.rewind(1);
      this.exitState();
    } else {
      return this.notifyError(
        attribute.pos,
        "MALFORMED_OPEN_TAG",
        'EOF reached while parsing attribute "' +
          this.currentAttribute.name +
          '" for the "' +
          this.currentOpenTag.tagName +
          '" tag'
      );
    }
  },

  return(childState, childPart) {
    switch (childState) {
      case STATE.EXPRESSION: {
        switch (childPart.part) {
          case "NAME": {
            // TODO: why is this needed?
            this.currentAttribute.name = this.currentAttribute.name
              ? this.currentAttribute.name + childPart.value
              : childPart.value;
            this.currentAttribute.pos = childPart.pos;
            this.currentAttribute.endPos = childPart.endPos;
            break;
          }
          case "ARGUMENT": {
            if (this.currentAttribute.argument != null) {
              this.notifyError(
                childPart.endPos,
                "ILLEGAL_ATTRIBUTE_ARGUMENT",
                "An attribute can only have one argument"
              );
              return;
            }

            this.currentAttribute.argument = childPart;
            this.skip(1); // skip closing paren
            break;
          }
          case "BLOCK": {
            if (this.currentAttribute.argument) {
              this.currentAttribute.method = true;
              this.currentAttribute.pos = this.currentAttribute.argument.pos;
              this.currentAttribute.endPos = childPart.endPos + 1;
              this.currentAttribute.value = "function" + this.data.substring(this.currentAttribute.pos, this.currentAttribute.endPos);
              this.currentAttribute.argument = undefined;
              this.exitState();
            } else {
              this.currentAttribute.name = "{" + childPart.value + "}";
              this.currentAttribute.pos = childPart.pos - 1;
              this.currentAttribute.endPos = childPart.endPos + 1;
              this.exitState();
            }
            this.skip(1); // skip closing brace
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

            if (!this.currentAttribute.name) {
              this.currentAttribute.name = "default";
              this.currentAttribute.default = true;
            }

            this.currentAttribute.value = value;
            this.currentAttribute.pos = childPart.pos;
            this.currentAttribute.endPos = childPart.endPos;

            // If the expression evaluates to a literal value then add the
            // `literalValue` property to the attribute
            if (childPart.isStringLiteral) {
              this.currentAttribute.literalValue = evaluateStringExpression(
                value,
                childPart.pos,
                this
              );
            } else if (value === "true") {
              this.currentAttribute.literalValue = true;
            } else if (value === "false") {
              this.currentAttribute.literalValue = false;
            } else if (value === "null") {
              this.currentAttribute.literalValue = null;
            } else if (value === "undefined") {
              this.currentAttribute.literalValue = undefined;
            } else if (NUMBER_REGEX.test(value)) {
              this.currentAttribute.literalValue = Number(value);
            }

            this.exitState();
            break;
          }
        }
      }
    }
  },

  char(ch, code) {
    if (isWhitespaceCode(code)) {
      return;
    } else if (code === CODE.EQUAL) {
      // TODO: make expressions consume beginning whitespace?
      this.consumeWhitespace();
      this.enterState(STATE.EXPRESSION, { 
        part: "VALUE",
        terminatedByWhitespace: true, 
        terminator: [this.isConcise ? ";" : ">", ","]
      });
    } else if (code === CODE.OPEN_PAREN) {
      this.enterState(STATE.EXPRESSION, { 
        part: "ARGUMENT",
        terminatedByWhitespace: false, 
        terminator: ")"
      });
    } else if (code === CODE.OPEN_CURLY_BRACE && (!this.currentAttribute.name || this.currentAttribute.argument)) {
      this.enterState(STATE.EXPRESSION, { 
        part: "BLOCK",
        terminatedByWhitespace: false, 
        terminator: "}"
      });
    } else if (!this.currentAttribute.name) {
      this.rewind(1);
      this.enterState(STATE.EXPRESSION, { 
        part: "NAME",
        terminatedByWhitespace: true, 
        terminator: [this.isConcise ? ";" : ">", "=", ",", "("],
        allowEscapes: true
      });
    } else {
      this.rewind(1);
      this.exitState();
    }
  },
});
