import { Parser, STATE } from "../internal";

// We enter STATE.ATTRIBUTE_NAME when we see a non-whitespace
// character after reading the tag name
export const ATTRIBUTE_NAME = Parser.createState({
  name: "ATTRIBUTE_NAME",

  eol: Parser.prototype.openTagEOL,

  eof: Parser.prototype.openTagEOF,

  expression(expression) {
    var argument = this.getAndRemoveArgument(expression);
    var method = this.getAndRemoveMethod(expression);

    if (expression.endedWithComma) {
      // consume all following whitespace,
      // including new lines (which allows attributes to
      // span multiple lines in concise mode)
      this.consumeWhitespace();
      this.currentOpenTag.requiresCommas = true;
      this.currentAttribute.endedWithComma = true;
    } else if (!this.lookPastWhitespaceFor("=", 0)) {
      this.currentOpenTag.lastAttrNoComma = true;
    }

    this.currentAttribute.name = this.currentAttribute.name
      ? this.currentAttribute.name + expression.value
      : expression.value;
    this.currentAttribute.pos = expression.pos;
    this.currentAttribute.endPos = expression.endPos;

    if (!this.currentAttribute.name) {
      this.currentAttribute.name = "default";
      this.currentAttribute.default = true;
    }

    if (argument) {
      this.currentAttribute.argument = argument;
    } else if (method) {
      this.currentAttribute.method = true;
      this.currentAttribute.value = method.value;
      this.currentAttribute.pos = method.pos;
      this.currentAttribute.endPos = method.endPos;
    }
  },

  enter(oldState) {
    if (
      this.currentOpenTag.requiresCommas &&
      this.currentOpenTag.lastAttrNoComma
    ) {
      var parseOptions = this.currentOpenTag.parseOptions;

      if (!parseOptions || parseOptions.relaxRequireCommas !== true) {
        return this.notifyError(
          this.pos,
          "COMMAS_REQUIRED",
          "if commas are used, they must be used to separate all attributes for a tag"
        );
      }
    }

    if (oldState !== STATE.EXPRESSION) {
      this.beginExpression();
    }
  },

  char(ch, code) {
    throw new Error("Illegal state");
  },
});
