import {
  cloneValue,
  Part,
  STATE,
  StateDefinition,
  ValuePart,
} from "../internal";

export interface PlaceholderPart extends Part {
  value: ValuePart;
  escape: boolean;
}

export const PLACEHOLDER: StateDefinition<PlaceholderPart> = {
  name: "PLACEHOLDER",

  enter(placeholder) {
    placeholder.escape = placeholder.escape !== false;
    this.enterState(STATE.EXPRESSION, { terminator: "}" });
  },

  exit(placeholder) {
    if (!placeholder.value) {
      this.notifyError(
        placeholder.pos,
        "PLACEHOLDER_EXPRESSION_REQUIRED",
        "Invalid placeholder, the expression cannot be missing"
      );
    }

    this.notifiers.notifyPlaceholder(placeholder);
  },

  return(childState, childPart, placeholder) {
    switch (childState) {
      case STATE.EXPRESSION: {
        placeholder.value = cloneValue(childPart as ValuePart);
        this.exitState("}");
        break;
      }
    }
  },

  eol(str) {
    throw new Error("Illegal state. EOL not expected");
  },

  eof() {
    throw new Error("Illegal state. EOF not expected");
  },
};
