import { Parser, STATE, CODE, isWhitespaceCode, cloneValue } from "../internal";

const defaultName = { value: "default" };

// We enter STATE.ATTRIBUTE when we see a non-whitespace
// character after reading the tag name
export const ATTRIBUTE = Parser.createState({
  name: "ATTRIBUTE",

  enter(oldState, attr) {
    attr.default = this.currentOpenTag.attributes.length === 0;
    attr.argument = undefined;
    attr.value = undefined;
    attr.method = false;
    attr.bound = false;
    this.currentAttribute = attr;
  },

  exit(attr) {
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
          attr.name.value +
          '" for the "' +
          this.currentOpenTag.tagName.value +
          '" tag'
      );
    }
  },

  return(childState, childPart, attr) {
    switch (childState) {
      case STATE.EXPRESSION: {
        if (childPart.part !== "NAME" && !attr.name && attr.default) {
          attr.name = defaultName;
        }

        switch (childPart.part) {
          case "NAME": {
            attr.name = cloneValue(childPart);
            attr.default = false;
            break;
          }
          case "ARGUMENT": {
            if (attr.argument) {
              this.notifyError(
                childPart.endPos,
                "ILLEGAL_ATTRIBUTE_ARGUMENT",
                "An attribute can only have one set of arguments"
              );
              return;
            }

            attr.argument = {
              value: childPart.value,
              pos: childPart.pos + 1, // ignore leading (
              endPos: childPart.endPos
            };
            this.skip(1); // ignore trailing )
            break;
          }
          case "BLOCK": {
            attr.method = true;
            attr.value = {
              value: childPart.value,
              pos: childPart.pos + 1, // ignore leading {
              endPos: childPart.endPos
            };
            this.skip(1); // ignore trailing }
            this.exitState();
            break;
          }
          case "VALUE": {
            if (childPart.value === "") {
              return this.notifyError(
                childPart.pos,
                "ILLEGAL_ATTRIBUTE_VALUE",
                'No attribute value found after "="'
              );
            }

            attr.value = cloneValue(childPart);
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
        terminator: ")"
      });
    } else if (code === CODE.OPEN_CURLY_BRACE && (!attr.name || attr.argument)) {
      this.enterState(STATE.EXPRESSION, { 
        part: "BLOCK",
        terminatedByWhitespace: false, 
        terminator: "}"
      });
    } else if (!attr.name) {
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
      this.rewind(1);
    } else {
      this.exitState();
    }
  },
});
