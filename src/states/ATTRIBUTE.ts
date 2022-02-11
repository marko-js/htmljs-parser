import {
  STATE,
  CODE,
  isWhitespaceCode,
  Part,
  StateDefinition,
  Pos,
  ExpressionPos,
} from "../internal";

const enum ATTR_STATE {
  NAME,
  VALUE,
  ARGUMENT,
  BLOCK,
}

export interface AttrPart extends Part {
  state: undefined | ATTR_STATE;
  name: undefined | Pos;
  value: undefined | ExpressionPos;
  valueStartPos: undefined | number;
  argument: undefined | ExpressionPos;
  default: boolean;
  spread: boolean;
  method: boolean;
  bound: boolean;
}

// We enter STATE.ATTRIBUTE when we see a non-whitespace
// character after reading the tag name
export const ATTRIBUTE: StateDefinition<AttrPart> = {
  name: "ATTRIBUTE",

  enter(attr) {
    this.currentAttribute = attr;
    attr.state = undefined;
    attr.name = undefined;
    attr.value = undefined;
    attr.bound = false;
    attr.method = false;
    attr.spread = false;
    attr.default = this.currentOpenTag!.attributes.length === 0;
  },

  exit() {
    this.currentAttribute = undefined;
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
      this.notifyError(
        attr,
        "MALFORMED_OPEN_TAG",
        'EOF reached while parsing attribute "' +
          (attr.name ? this.read(attr.name) : "default") +
          '" for the "' +
          this.read(this.currentOpenTag!.tagName) +
          '" tag'
      );
    }
  },

  return(_, childPart, attr) {
    switch (attr.state) {
      case ATTR_STATE.NAME: {
        attr.name = {
          pos: childPart.pos,
          endPos: childPart.endPos,
        };
        break;
      }
      case ATTR_STATE.ARGUMENT: {
        if (attr.argument) {
          this.notifyError(
            childPart,
            "ILLEGAL_ATTRIBUTE_ARGUMENT",
            "An attribute can only have one set of arguments"
          );
          return;
        }

        attr.argument = {
          pos: childPart.pos - 1, // include (
          endPos: this.skip(1), // include )
          value: {
            pos: childPart.pos,
            endPos: childPart.endPos,
          },
        };
        break;
      }
      case ATTR_STATE.BLOCK: {
        attr.method = true;
        attr.value = {
          pos: childPart.pos - 1, // include {
          endPos: this.skip(1), // include }
          value: {
            pos: childPart.pos,
            endPos: childPart.endPos,
          },
        };
        this.exitState();
        break;
      }

      case ATTR_STATE.VALUE: {
        if (childPart.pos === childPart.endPos) {
          return this.notifyError(
            childPart,
            "ILLEGAL_ATTRIBUTE_VALUE",
            "Missing value for attribute"
          );
        }

        attr.value = {
          pos: attr.valueStartPos!,
          endPos: childPart.endPos,
          value: {
            pos: childPart.pos,
            endPos: childPart.endPos,
          },
        };

        attr.valueStartPos = undefined;
        this.exitState();
        break;
      }
    }
  },

  char(_, code, attr) {
    if (isWhitespaceCode(code)) {
      return;
    } else if (
      code === CODE.EQUAL ||
      (code === CODE.COLON && this.lookAtCharCodeAhead(1) === CODE.EQUAL) ||
      (code === CODE.PERIOD && this.lookAheadFor(".."))
    ) {
      attr.valueStartPos = this.pos;

      if (code === CODE.COLON) {
        attr.bound = true;
        this.skip(2);
        this.consumeWhitespace();
      } else if (code === CODE.PERIOD) {
        attr.spread = true;
        this.skip(3);
      } else {
        this.skip(1);
        this.consumeWhitespace();
      }

      attr.state = ATTR_STATE.VALUE;
      this.enterState(STATE.EXPRESSION, {
        terminatedByWhitespace: true,
        terminator: [
          this.isConcise ? "]" : "/>",
          this.isConcise ? ";" : ">",
          ",",
        ],
      });

      this.rewind(1);
    } else if (code === CODE.OPEN_PAREN) {
      attr.state = ATTR_STATE.ARGUMENT;
      this.skip(1);
      this.enterState(STATE.EXPRESSION, {
        terminator: ")",
      });
      this.rewind(1);
    } else if (
      code === CODE.OPEN_CURLY_BRACE &&
      (!attr.name || attr.argument)
    ) {
      attr.state = ATTR_STATE.BLOCK;
      this.skip(1);
      this.enterState(STATE.EXPRESSION, {
        terminatedByWhitespace: false,
        terminator: "}",
      });
      this.rewind(1);
    } else if (attr.state === undefined) {
      attr.default = false;
      attr.state = ATTR_STATE.NAME;
      this.enterState(STATE.EXPRESSION, {
        terminatedByWhitespace: true,
        skipOperators: true,
        terminator: [
          this.isConcise ? "]" : "/>",
          this.isConcise ? ";" : ">",
          ":=",
          "=",
          ",",
          "(",
        ],
        allowEscapes: true,
      });
      this.rewind(1);
    } else {
      this.exitState();
    }
  },
};
