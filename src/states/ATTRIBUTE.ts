import {
  STATE,
  CODE,
  isWhitespaceCode,
  cloneValue,
  Part,
  StateDefinition,
  ValuePart,
} from "../internal";

const defaultName = { value: "default" } as unknown as ValuePart;
const enum ATTR_STATE {
  NAME,
  VALUE,
  ARGUMENT,
  BLOCK,
}

export interface AttrPart extends Part {
  state: undefined | ATTR_STATE;
  name: undefined | ValuePart;
  value: undefined | ValuePart;
  argument: undefined | ValuePart;
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
    attr.argument = undefined;
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
      return this.notifyError(
        attr.pos,
        "MALFORMED_OPEN_TAG",
        'EOF reached while parsing attribute "' +
          attr.name?.value +
          '" for the "' +
          this.currentOpenTag!.tagName.value +
          '" tag'
      );
    }
  },

  return(_, childPart, attr) {
    const exprPart = childPart as ValuePart;
    if (attr.state !== ATTR_STATE.NAME && !attr.name && attr.default) {
      attr.name = defaultName;
    }
    switch (attr.state) {
      case ATTR_STATE.NAME: {
        attr.name = cloneValue(exprPart);
        attr.default = false;
        break;
      }
      case ATTR_STATE.ARGUMENT: {
        if (attr.argument) {
          this.notifyError(
            exprPart.endPos,
            "ILLEGAL_ATTRIBUTE_ARGUMENT",
            "An attribute can only have one set of arguments"
          );
          return;
        }

        attr.argument = {
          value: exprPart.value,
          pos: exprPart.pos + 1, // ignore leading (
          endPos: exprPart.endPos,
        } as ValuePart;
        this.skip(1); // ignore trailing )
        break;
      }
      case ATTR_STATE.BLOCK: {
        attr.method = true;
        attr.value = {
          value: exprPart.value,
          pos: exprPart.pos + 1, // ignore leading {
          endPos: exprPart.endPos,
        } as ValuePart;
        this.skip(1); // ignore trailing }
        this.exitState();
        break;
      }

      case ATTR_STATE.VALUE: {
        if (exprPart.value === "") {
          return this.notifyError(
            exprPart.pos,
            "ILLEGAL_ATTRIBUTE_VALUE",
            "Missing value for attribute"
          );
        }

        attr.value = cloneValue(exprPart);
        this.exitState();
        break;
      }
    }
  },

  char(ch, code, attr) {
    if (isWhitespaceCode(code)) {
      return;
    } else if (
      code === CODE.EQUAL ||
      (code === CODE.COLON && this.lookAtCharCodeAhead(1) === CODE.EQUAL) ||
      (code === CODE.PERIOD && this.lookAheadFor(".."))
    ) {
      if (code === CODE.COLON) {
        attr.bound = true;
        this.skip(1);
        this.consumeWhitespace();
      } else if (code === CODE.PERIOD) {
        attr.spread = true;
        this.skip(3);
      } else {
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
    } else if (code === CODE.OPEN_PAREN) {
      attr.state = ATTR_STATE.ARGUMENT;
      this.enterState(STATE.EXPRESSION, {
        terminator: ")",
      });
    } else if (
      code === CODE.OPEN_CURLY_BRACE &&
      (!attr.name || attr.argument)
    ) {
      attr.state = ATTR_STATE.BLOCK;
      this.enterState(STATE.EXPRESSION, {
        terminatedByWhitespace: false,
        terminator: "}",
      });
    } else if (!attr.name) {
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
