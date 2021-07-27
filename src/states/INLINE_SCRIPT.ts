import { Parser, CODE, STATE } from "../internal";

export const INLINE_SCRIPT = Parser.createState({
  name: "INLINE_SCRIPT",

  enter(oldState, inlineScript) {
    this.endText();

    inlineScript.value = "";
    inlineScript.endMatches = [];
  },

  exit(inlineScript) {
    var value = inlineScript.value;
    inlineScript.endPos = this.pos;

    if (value[0] === "{" && value[value.length - 1] === "}") {
      inlineScript.value = value.slice(1, -1);
      inlineScript.block = true;
    } else {
      inlineScript.line = true;
    }

    this.notifiers.notifyScriptlet(inlineScript);
  },

  eol(str, inlineScript) {
    if (inlineScript.endMatch || inlineScript.stringType === CODE.BACKTICK) {
      inlineScript.value += str;
    } else {
      this.exitState();
    }
  },

  eof(inlineScript) {
    if (inlineScript.endMatch || inlineScript.stringType) {
      this.notifyError(
        inlineScript.pos,
        "MALFORMED_SCRIPTLET",
        "EOF reached while parsing scriptet"
      );
    } else {
      this.exitState();
    }
  },

  return(childState, childPart, inlineScript) {
    switch (childState) {
      case STATE.JS_COMMENT_LINE:
      case STATE.JS_COMMENT_BLOCK: {
        inlineScript.value += childPart.rawValue;
        break;
      }
    }
  },

  char(ch, code, inlineScript) {
    if (code === CODE.BACK_SLASH) {
      inlineScript.value += ch + this.lookAtCharAhead(1);
      this.skip(1);
      return;
    }

    if (inlineScript.stringType) {
      if (code === inlineScript.stringType) {
        inlineScript.stringType = null;
      }

      inlineScript.value += ch;
      return;
    }

    if (code === CODE.FORWARD_SLASH) {
      // Check next character to see if we are in a comment
      var nextCode = this.lookAtCharCodeAhead(1);
      if (nextCode === CODE.FORWARD_SLASH) {
        this.enterState(STATE.JS_COMMENT_LINE);
        this.skip(1);
        return;
      } else if (nextCode === CODE.ASTERISK) {
        this.enterState(STATE.JS_COMMENT_BLOCK);
        this.skip(1);
        return;
      }
    }

    inlineScript.value += ch;

    if (code === inlineScript.endMatch) {
      inlineScript.endMatch = inlineScript.endMatches.pop();
      return;
    }

    if (
      code === CODE.SINGLE_QUOTE ||
      code === CODE.DOUBLE_QUOTE ||
      code === CODE.BACKTICK
    ) {
      inlineScript.stringType = code;
      return;
    }

    var nextMatch = null;

    if (code === CODE.OPEN_PAREN) {
      nextMatch = CODE.CLOSE_PAREN;
    } else if (code === CODE.OPEN_CURLY_BRACE) {
      nextMatch = CODE.CLOSE_CURLY_BRACE;
    } else if (code === CODE.OPEN_SQUARE_BRACKET) {
      nextMatch = CODE.CLOSE_SQUARE_BRACKET;
    }

    if (nextMatch) {
      if (inlineScript.endMatch) {
        inlineScript.endMatches.push(inlineScript.endMatch);
      }
      inlineScript.endMatch = nextMatch;
    }
  },
});
