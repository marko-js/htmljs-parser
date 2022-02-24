import {
  STATE,
  CODE,
  isWhitespaceCode,
  StateDefinition,
  Range,
  Events,
  EventTypes,
  ExpressionRange,
  Parser,
} from "../internal";

const enum ATTR_STATE {
  NAME,
  VALUE,
  ARGUMENT,
  BLOCK,
}

export interface AttrMeta extends Range {
  state: undefined | ATTR_STATE;
  name: undefined | Events.AttrName;
  valueStart: number;
  args: boolean | Events.AttrMethod["params"];
  default: boolean;
  spread: boolean;
  bound: boolean;
}

// We enter STATE.ATTRIBUTE when we see a non-whitespace
// character after reading the tag name
export const ATTRIBUTE: StateDefinition<AttrMeta> = {
  name: "ATTRIBUTE",

  enter(attr) {
    this.activeAttr = attr;
    attr.state = undefined;
    attr.name = undefined;
    attr.valueStart = -1;
    attr.args = false;
    attr.bound = false;
    attr.spread = false;
    attr.default = !this.activeTag!.hasAttrs;
  },

  exit() {
    this.activeAttr = undefined;
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
        this.emit(
          (attr.name = {
            type: EventTypes.AttrName,
            start: childPart.start,
            end: childPart.end,
            default: false,
          })
        );
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

        if (this.lookPastWhitespaceFor("{")) {
          attr.args = {
            start,
            end,
            value,
          };
          this.consumeWhitespace();
          this.rewind(1);
        } else {
          attr.args = true;
          this.emit({
            type: EventTypes.AttrArgs,
            start,
            end,
            value,
          });
        }

        break;
      }
      case ATTR_STATE.BLOCK: {
        const params = attr.args as ExpressionRange;
        const start = params.start;
        const end = this.skip(1); // include }
        this.emit({
          type: EventTypes.AttrMethod,
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
          this.emit({
            type: EventTypes.AttrSpread,
            start: attr.valueStart!,
            end: childPart.end,
            value: {
              start: childPart.start,
              end: childPart.end,
            },
          });
        } else {
          this.emit({
            type: EventTypes.AttrValue,
            start: attr.valueStart!,
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

  char(code, attr) {
    if (isWhitespaceCode(code)) {
      return;
    } else if (
      code === CODE.EQUAL ||
      (code === CODE.COLON && this.lookAtCharCodeAhead(1) === CODE.EQUAL) ||
      (code === CODE.PERIOD && this.lookAheadFor(".."))
    ) {
      attr.valueStart = this.pos;
      ensureAttrName(this, attr);

      if (code === CODE.COLON) {
        attr.bound = true;
        this.skip(2); // skip :=
        this.consumeWhitespace();
      } else if (code === CODE.PERIOD) {
        attr.spread = true;
        this.skip(3); // skip ...
      } else {
        this.skip(1); // skip =
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
      ensureAttrName(this, attr);
      attr.state = ATTR_STATE.ARGUMENT;
      this.skip(1); // skip (
      this.enterState(STATE.EXPRESSION, {
        terminator: ")",
      });
      this.rewind(1);
    } else if (code === CODE.OPEN_CURLY_BRACE && attr.args) {
      ensureAttrName(this, attr);
      attr.state = ATTR_STATE.BLOCK;
      this.skip(1); // skip {
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
      });
      this.rewind(1);
    } else {
      this.exitState();
    }
  },
};

function ensureAttrName(parser: Parser, attr: AttrMeta) {
  if (!attr.name && attr.default) {
    parser.emit(
      (attr.name = {
        type: EventTypes.AttrName,
        start: attr.start,
        end: attr.start,
        default: true,
      })
    );
  }
}
