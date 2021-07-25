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
    placeholder.withinString = placeholder.parentState === STATE.STRING;
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
  },

  return(childState, childPart, placeholder) {
    switch (childState) {
      case STATE.EXPRESSION: {
        placeholder.value = childPart.value;
        placeholder.endPos = childPart.endPos+1;
        this.exitState();
        this.skip(1); // skip over the closing }
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
