import {
  STATE,
  CODE,
  isWhitespaceCode,
  StateDefinition,
  Range,
  Parser,
  Ranges,
} from "../internal";

const enum ATTR_STATE {
  NAME,
  VALUE,
  ARGUMENT,
  BLOCK,
}

export interface AttrMeta extends Range {
  state: undefined | ATTR_STATE;
  name: undefined | Range;
  valueStart: number;
  args: boolean | Ranges.AttrMethod["params"];
  spread: boolean;
  bound: boolean;
}

// We enter STATE.ATTRIBUTE when we see a non-whitespace
// character after reading the tag name
export const ATTRIBUTE: StateDefinition<AttrMeta> = {
  name: "ATTRIBUTE",

  enter(start) {
    return (this.activeAttr = {
      start,
      end: start,
      valueStart: start,
      state: undefined,
      name: undefined,
      args: false,
      bound: false,
      spread: false,
    });
  },

  exit() {
    this.activeAttr = undefined;
  },

  char(code, attr) {
    if (isWhitespaceCode(code)) {
      return;
    } else if (
      code === CODE.EQUAL ||
      (code === CODE.COLON && this.lookAtCharCodeAhead(1) === CODE.EQUAL) ||
      (code === CODE.PERIOD && this.lookAheadFor(".."))
    ) {
      attr.valueStart = this.pos;

      if (code === CODE.COLON) {
        ensureAttrName(this, attr);
        attr.bound = true;
        this.skip(2); // skip :=
        this.consumeWhitespace();
      } else if (code === CODE.PERIOD) {
        attr.spread = true;
        this.skip(3); // skip ...
      } else {
        ensureAttrName(this, attr);
        this.skip(1); // skip =
        this.consumeWhitespace();
      }

      attr.state = ATTR_STATE.VALUE;
      const expr = this.enterState(STATE.EXPRESSION);
      expr.terminatedByWhitespace = true;
      expr.terminator = [
        this.isConcise ? "]" : "/>",
        this.isConcise ? ";" : ">",
        ",",
      ];

      this.rewind(1);
    } else if (code === CODE.OPEN_PAREN) {
      ensureAttrName(this, attr);
      attr.state = ATTR_STATE.ARGUMENT;
      this.skip(1); // skip (
      this.enterState(STATE.EXPRESSION).terminator = ")";
      this.rewind(1);
    } else if (code === CODE.OPEN_CURLY_BRACE && attr.args) {
      ensureAttrName(this, attr);
      attr.state = ATTR_STATE.BLOCK;
      this.skip(1); // skip {
      const expr = this.enterState(STATE.EXPRESSION);
      expr.terminatedByWhitespace = false;
      expr.terminator = "}";
      this.rewind(1);
    } else if (attr.state === undefined) {
      attr.state = ATTR_STATE.NAME;
      const expr = this.enterState(STATE.EXPRESSION);
      expr.terminatedByWhitespace = true;
      expr.skipOperators = true;
      expr.terminator = [
        this.isConcise ? "]" : "/>",
        this.isConcise ? ";" : ">",
        ":=",
        "=",
        ",",
        "(",
      ];
      this.rewind(1);
    } else {
      this.exitState();
    }
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
      this.emitError(
        attr,
        "MALFORMED_OPEN_TAG",
        'EOF reached while parsing attribute "' +
          (attr.name ? this.read(attr.name) : "default") +
          '" for the "' +
          this.read(this.activeTag!.tagName) +
          '" tag'
      );
    }
  },

  return(_, childPart, attr) {
    switch (attr.state) {
      case ATTR_STATE.NAME: {
        attr.name = {
          start: childPart.start,
          end: childPart.end,
        };

        this.handlers.onAttrName?.(attr.name);
        break;
      }
      case ATTR_STATE.ARGUMENT: {
        if (attr.args) {
          this.emitError(
            childPart,
            "ILLEGAL_ATTRIBUTE_ARGUMENT",
            "An attribute can only have one set of arguments"
          );
          return;
        }

        const start = childPart.start - 1; // include (
        const end = this.skip(1); // include )
        const value = {
          start: childPart.start,
          end: childPart.end,
        };

        if (this.consumeWhitespaceIfBefore("{")) {
          attr.args = {
            start,
            end,
            value,
          };
        } else {
          attr.args = true;
          this.handlers.onAttrArgs?.({
            start,
            end,
            value,
          });
        }

        break;
      }
      case ATTR_STATE.BLOCK: {
        const params = attr.args as Ranges.Value;
        const start = params.start;
        const end = this.skip(1); // include }
        this.handlers.onAttrMethod?.({
          start,
          end,
          params,
          body: {
            start: childPart.start - 1, // include {
            end,
            value: {
              start: childPart.start,
              end: childPart.end,
            },
          },
        });
        this.exitState();
        break;
      }

      case ATTR_STATE.VALUE: {
        if (childPart.start === childPart.end) {
          return this.emitError(
            childPart,
            "ILLEGAL_ATTRIBUTE_VALUE",
            "Missing value for attribute"
          );
        }

        if (attr.spread) {
          this.handlers.onAttrSpread?.({
            start: attr.valueStart,
            end: childPart.end,
            value: {
              start: childPart.start,
              end: childPart.end,
            },
          });
        } else {
          this.handlers.onAttrValue?.({
            start: attr.valueStart,
            end: childPart.end,
            bound: attr.bound,
            value: {
              start: childPart.start,
              end: childPart.end,
            },
          });
        }

        this.exitState();
        break;
      }
    }
  },
};

function ensureAttrName(parser: Parser, attr: AttrMeta) {
  if (!attr.name) {
    parser.handlers.onAttrName?.({
      start: attr.start,
      end: attr.start,
    });
  }
}
