import { Parser, CODE, STATE } from "../internal";

export const STRING = Parser.createState({
  name: "STRING",

  // { quoteChar, quoteCharCode }
  enter(oldState, string) {
    string.stringParts = [];
    string.currentText = "";
    string.isStringLiteral = true;
  },

  exit(string) {
    string.value = this.notifiers.notifyString(string);
  },

  return(childState, childPart, string) {
    switch (childState) {
      case STATE.PLACEHOLDER: {
        if (string.currentText) {
          string.stringParts.push(string.currentText);
          string.currentText = "";
        }
        string.isStringLiteral = false;
        string.stringParts.push(childPart);
        break;
      }
    }
  },

  eol(str, string) {
    // New line characters are not allowed in JavaScript string expressions. We need to use
    // a different character sequence, but we don't want to through off positions so we need
    // to use a replacement sequence with the same number of characters.
    if (str.length === 2) {
      string.currentText += "\\r\\n";
    } else {
      string.currentText += "\\n";
    }
  },

  eof() {
    if (this.placeholderDepth > 0) {
      this.notifyError(
        this.pos,
        "INVALID_STRING",
        "EOF reached while parsing string expression found inside placeholder"
      );
      return;
    }
    this.notifyError(
      this.pos,
      "INVALID_STRING",
      "EOF reached while parsing string expression"
    );
  },

  char(ch, code, string) {
    var stringParts = string.stringParts;

    var nextCh;
    var quoteCharCode = string.quoteCharCode;

    if (code === CODE.BACK_SLASH) {
      if (this.checkForEscapedEscapedPlaceholder(ch, code)) {
        if (this.ignorePlaceholders) {
          // We are actually adding two escaped backslashes here...
          string.currentText += "\\\\\\\\";
        } else {
          string.currentText += "\\";
        }
      } else if (this.checkForEscapedPlaceholder(ch, code)) {
        if (this.ignorePlaceholders) {
          // We are actually adding one escaped backslashes here...
          string.currentText += "\\\\$";
        } else {
          string.currentText += "$";
        }
      } else {
        // Handle string escape sequence
        nextCh = this.lookAtCharAhead(1);
        string.currentText += ch + nextCh;
      }

      this.skip(1);
    } else if (code === quoteCharCode) {
      // We encountered the end delimiter
      if (string.currentText) {
        stringParts.push(string.currentText);
      }

      let stringExpr = "";
      let quoteChar = string.quoteChar;

      if (stringParts.length) {
        for (let i = 0; i < stringParts.length; i++) {
          let part = stringParts[i];
          if (i !== 0) {
            stringExpr += "+";
          }

          if (typeof part === "string") {
            stringExpr += quoteChar + part + quoteChar;
          } else {
            stringExpr += "(" + part.value + ")";
          }
        }
      } else {
        // Just an empty string...
        stringExpr = quoteChar + quoteChar;
      }

      if (stringParts.length > 1) {
        stringExpr = "(" + stringExpr + ")";
      }

      string.value = stringExpr;
      this.exitState(quoteChar);
    } else if (
      !this.ignorePlaceholders &&
      !this.ignoreNonstandardStringPlaceholders &&
      this.checkForPlaceholder(ch, code)
    ) {
      if (string.currentText) {
        stringParts.push(string.currentText);
      }

      string.currentText = "";
      // We encountered nested placeholder...
      string.isStringLiteral = false;
    } else {
      string.currentText += ch;
    }
  },
});
