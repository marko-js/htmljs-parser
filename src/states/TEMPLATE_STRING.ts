import { CODE, Part, STATE, StateDefinition } from "../internal";

export interface TemplateStringPart extends Part {
  value: string;
}

export const TEMPLATE_STRING: StateDefinition<TemplateStringPart> = {
  name: "TEMPLATE_STRING",

  enter(templateString) {
    templateString.value = "`";
  },

  return(_, childPart, templateString) {
    if (!(childPart as STATE.ExpressionPart).value) {
      this.notifyError(
        childPart,
        "PLACEHOLDER_EXPRESSION_REQUIRED",
        "Invalid placeholder, the expression cannot be missing"
      );
    }

    templateString.value += `\${${(childPart as STATE.ExpressionPart).value}}`;
    this.skip(1);
  },

  eol(str, templateString) {
    templateString.value += str;
  },

  eof(templateString) {
    this.notifyError(
      templateString,
      "INVALID_TEMPLATE_STRING",
      "EOF reached while parsing template string expression"
    );
  },

  char(ch, code, templateString) {
    if (
      code === CODE.DOLLAR &&
      this.lookAtCharCodeAhead(1) === CODE.OPEN_CURLY_BRACE
    ) {
      this.skip(1);
      this.enterState(STATE.EXPRESSION, { terminator: "}" });
    } else {
      templateString.value += ch;
      if (code === CODE.BACK_SLASH) {
        // Handle string escape sequence
        templateString.value += this.lookAtCharAhead(1);
        this.skip(1);
      } else if (code === CODE.BACKTICK) {
        this.exitState("`");
      }
    }
  },
};
