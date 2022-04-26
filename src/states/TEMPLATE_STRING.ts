import { CODE, STATE, StateDefinition } from "../internal";

export const TEMPLATE_STRING: StateDefinition = {
  name: "TEMPLATE_STRING",

  enter(parent, start) {
    return {
      state: TEMPLATE_STRING,
      parent,
      start,
      end: start,
    };
  },

  exit() {},

  char(code) {
    if (
      code === CODE.DOLLAR &&
      this.lookAtCharCodeAhead(1) === CODE.OPEN_CURLY_BRACE
    ) {
      this.pos++; // skip {
      const expr = this.enterState(STATE.EXPRESSION);
      expr.skipOperators = true;
      expr.terminator = CODE.CLOSE_CURLY_BRACE;
    } else {
      if (code === CODE.BACK_SLASH) {
        this.pos++; // skip \
      } else if (code === CODE.BACKTICK) {
        this.pos++; // skip `
        this.exitState();
      }
    }
  },

  eof(templateString) {
    this.emitError(
      templateString,
      "INVALID_TEMPLATE_STRING",
      "EOF reached while parsing template string expression"
    );
  },

  eol() {},

  return(child) {
    if (child.start === child.end) {
      this.emitError(
        child,
        "PLACEHOLDER_EXPRESSION_REQUIRED",
        "Invalid placeholder, the expression cannot be missing"
      );
    }

    this.pos++; // skip closing }
  },
};
