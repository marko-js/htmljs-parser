import { Parser, CODE, STATE } from "../internal";

// We enter STATE.SCRIPTLET after we encounter a "<%" while in STATE.HTML_CONTENT.
// We leave STATE.SCRIPTLET if we see a "%>".
export const SCRIPTLET = Parser.createState({
  name: "SCRIPTLET",

  // Scriptlet

  enter(oldState, scriptlet) {
    this.endText();
    scriptlet.tag = true;
    scriptlet.value = "";
    scriptlet.quoteCharCode = null;
  },

  exit(scriptlet) {
    this.notifiers.notifyScriptlet(scriptlet);
  },

  eol(str, scriptlet) {
    scriptlet.value += str;
  },

  eof(scriptlet) {
    this.notifyError(
      scriptlet.pos,
      "MALFORMED_SCRIPTLET",
      "EOF reached while parsing scriptlet"
    );
  },

  return(childState, childPart, scriptlet) {
    switch (childState) {
      case STATE.JS_COMMENT_LINE:
      case STATE.JS_COMMENT_BLOCK: {
        scriptlet.value += this.src.slice(childPart.pos, childPart.endPos);
        break;
      }
      case STATE.REGULAR_EXPRESSION: {
        scriptlet.value += childPart.value;
        break;
      }
    }
  },

  char(ch, code, scriptlet) {
    if (scriptlet.quoteCharCode) {
      scriptlet.value += ch;

      // We are within a string... only look for ending string code
      if (code === CODE.BACK_SLASH) {
        // Handle string escape sequence
        scriptlet.value += this.lookAtCharAhead(1);
        this.skip(1);
      } else if (code === scriptlet.quoteCharCode) {
        scriptlet.quoteCharCode = null;
      }
      return;
    } else if (code === CODE.FORWARD_SLASH) {
      // Check next character to see if we are in a comment or regexp
      var nextCode = this.lookAtCharCodeAhead(1);
      if (nextCode === CODE.FORWARD_SLASH) {
        this.enterState(STATE.JS_COMMENT_LINE);
        this.skip(1);
        return;
      } else if (nextCode === CODE.ASTERISK) {
        this.enterState(STATE.JS_COMMENT_BLOCK);
        this.skip(1);
        return;
      } else if (
        !/[\]})A-Z0-9.<%]/i.test(this.getPreviousNonWhitespaceChar())
      ) {
        this.enterState(STATE.REGULAR_EXPRESSION);
        return;
      }
    } else if (code === CODE.SINGLE_QUOTE || code === CODE.DOUBLE_QUOTE) {
      scriptlet.quoteCharCode = code;
    } else if (code === CODE.PERCENT) {
      if (this.lookAtCharCodeAhead(1) === CODE.CLOSE_ANGLE_BRACKET) {
        this.exitState("%>");
        return;
      }
    }

    scriptlet.value += ch;
  },
});
