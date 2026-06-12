import {
  matchesCloseCurlyBrace,
  STATE,
  type StateDefinition,
} from "../internal.ts";
import * as CODE from "../util/codes.ts";
import * as ErrorCode from "../util/error-code.ts";

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

  parse(data, maxPos, templateString) {
    while (this.pos < maxPos) {
      const code = data.charCodeAt(this.pos);
      switch (code) {
        case CODE.DOLLAR:
          if (data.charCodeAt(this.pos + 1) === CODE.OPEN_CURLY_BRACE) {
            this.pos += 2; // skip ${
            this.enterState(STATE.EXPRESSION).shouldTerminate =
              matchesCloseCurlyBrace;
            return;
          }
          this.pos++;
          break;
        case CODE.BACK_SLASH:
          this.pos += 2; // skip escape sequence
          break;
        case CODE.BACKTICK:
          this.pos++; // skip `
          this.exitState();
          return;
        default:
          this.pos++;
          break;
      }
    }
    this.emitError(
      templateString,
      ErrorCode.INVALID_TEMPLATE_STRING,
      "EOF reached while parsing template string expression",
    );
  },

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
