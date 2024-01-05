import {
  CODE,
  ErrorCode,
  STATE,
  type StateDefinition,
  matchesCloseCurlyBrace,
} from "../internal";

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
    switch (code) {
      case CODE.DOLLAR:
        if (this.lookAtCharCodeAhead(1) === CODE.OPEN_CURLY_BRACE) {
          this.pos++; // skip {
          this.enterState(STATE.EXPRESSION).shouldTerminate =
            matchesCloseCurlyBrace;
        }
        break;
      case CODE.BACK_SLASH:
        this.pos++; // skip \
        break;
      case CODE.BACKTICK:
        this.pos++; // skip `
        this.exitState();
        break;
    }
  },

  eof(templateString) {
    this.emitError(
      templateString,
      ErrorCode.INVALID_TEMPLATE_STRING,
      "EOF reached while parsing template string expression",
    );
  },

  eol() {},

  return(child) {
    if (child.start === child.end) {
      this.emitError(
        child,
        ErrorCode.MALFORMED_PLACEHOLDER,
        "Invalid placeholder, the expression cannot be missing",
      );
    }

    this.pos++; // skip closing }
  },
};
