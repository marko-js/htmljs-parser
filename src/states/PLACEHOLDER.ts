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

  return(_, childPart, placeholder) {
    placeholder.value = cloneValue(childPart as ValuePart);
    this.exitState("}");
  },
};
