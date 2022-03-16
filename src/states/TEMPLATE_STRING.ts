import { CODE, STATE, StateDefinition } from "../internal";

export const TEMPLATE_STRING: StateDefinition = {
  name: "TEMPLATE_STRING",

  enter(start) {
    return {
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
      this.skip(1); // skip {
      const expr = this.enterState(STATE.EXPRESSION);
      expr.skipOperators = true;
      expr.terminator = CODE.CLOSE_CURLY_BRACE;
    } else {
      if (code === CODE.BACK_SLASH) {
        this.skip(1); // skip \
      } else if (code === CODE.BACKTICK) {
        this.skip(1); // skip `
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

  return(_, childPart) {
    if (childPart.start === childPart.end) {
      this.emitError(
        childPart,
        "PLACEHOLDER_EXPRESSION_REQUIRED",
        "Invalid placeholder, the expression cannot be missing"
      );
    }

    this.skip(1); // skip closing }
  },
};
