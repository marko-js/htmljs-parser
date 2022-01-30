import { Parser, STATE } from "../internal";

export const PLACEHOLDER = Parser.createState({
  name: "PLACEHOLDER",

  // { escape: boolean, withinTagName? }
  enter(oldState, placeholder) {
    placeholder.value = "";
    placeholder.escape = placeholder.escape !== false;
    placeholder.type = "placeholder";
    placeholder.withinBody = this.withinOpenTag !== true;
    placeholder.withinAttribute = this.currentAttribute != null;
    placeholder.withinTemplateString =
      placeholder.parentState === STATE.TEMPLATE_STRING;
    placeholder.withinOpenTag =
      this.withinOpenTag === true && this.currentAttribute == null;
    this.placeholderDepth++;

    if (oldState !== STATE.EXPRESSION) {
      this.enterState(STATE.EXPRESSION, { terminator: "}" });
    }
  },

  exit(placeholder) {
    this.placeholderDepth--;
    if (!placeholder.withinTemplateString) {
      var newExpression = this.notifiers.notifyPlaceholder(placeholder);
      placeholder.value = newExpression;
    }

    if (!placeholder.value) {
      this.notifyError(
        placeholder.pos,
        "PLACEHOLDER_EXPRESSION_REQUIRED",
        "Invalid placeholder, the expression cannot be missing"
      );
    }
  },

  return(childState, childPart, placeholder) {
    switch (childState) {
      case STATE.EXPRESSION: {
        placeholder.value = childPart.value;
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
});
