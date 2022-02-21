import { CODE, STATE, StateDefinition } from "../internal";

export const TEMPLATE_STRING: StateDefinition = {
  name: "TEMPLATE_STRING",

  return(_, childPart) {
    if (childPart.start === childPart.end) {
      this.notifyError(
        childPart,
        "PLACEHOLDER_EXPRESSION_REQUIRED",
        "Invalid placeholder, the expression cannot be missing"
      );
    }

    this.skip(1); // skip closing }
  },

  eof(templateString) {
    this.notifyError(
      templateString,
      "INVALID_TEMPLATE_STRING",
      "EOF reached while parsing template string expression"
    );
  },

  char(code) {
    if (
      code === CODE.DOLLAR &&
      this.lookAtCharCodeAhead(1) === CODE.OPEN_CURLY_BRACE
    ) {
      this.skip(1); // skip {
      this.enterState(STATE.EXPRESSION, {
        skipOperators: true,
        terminator: "}",
      });
    } else {
      if (code === CODE.BACK_SLASH) {
        this.skip(1); // skip \
      } else if (code === CODE.BACKTICK) {
        this.skip(1); // skip `
        this.exitState();
      }
    }
  },
};
