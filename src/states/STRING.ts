import { Parser, CODE, STATE } from "../internal";

export const STRING = Parser.createState({
  name: "STRING",

  placeholder(placeholder) {
    if (this.currentPart.currentText) {
      this.currentPart.stringParts.push(this.currentPart.currentText);
      this.currentPart.currentText = "";
    }
    this.currentPart.isStringLiteral = false;
    this.currentPart.stringParts.push(placeholder);
  },

  eol(str) {
    // New line characters are not allowed in JavaScript string expressions. We need to use
    // a different character sequence, but we don't want to through off positions so we need
    // to use a replacement sequence with the same number of characters.
    if (str.length === 2) {
      this.currentPart.currentText += "\\r\\n";
    } else {
      this.currentPart.currentText += "\\n";
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

  char(ch, code) {
    var stringParts = this.currentPart.stringParts;

    var nextCh;
    var quoteCharCode = this.currentPart.quoteCharCode;

    if (code === CODE.BACK_SLASH) {
      if (this.checkForEscapedEscapedPlaceholder(ch, code)) {
        if (this.ignorePlaceholders) {
          // We are actually adding two escaped backslashes here...
          this.currentPart.currentText += "\\\\\\\\";
        } else {
          this.currentPart.currentText += "\\";
        }
      } else if (this.checkForEscapedPlaceholder(ch, code)) {
        if (this.ignorePlaceholders) {
          // We are actually adding one escaped backslashes here...
          this.currentPart.currentText += "\\\\$";
        } else {
          this.currentPart.currentText += "$";
        }
      } else {
        // Handle string escape sequence
        nextCh = this.lookAtCharAhead(1);
        this.currentPart.currentText += ch + nextCh;
      }

      this.skip(1);
    } else if (code === quoteCharCode) {
      // We encountered the end delimiter
      if (this.currentPart.currentText) {
        stringParts.push(this.currentPart.currentText);
      }

      let stringExpr = "";
      let quoteChar = this.currentPart.quoteChar;

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

      this.currentPart.value = stringExpr;
      this.endString();
    } else if (
      !this.ignorePlaceholders &&
      !this.ignoreNonstandardStringPlaceholders &&
      this.checkForPlaceholder(ch, code)
    ) {
      if (this.currentPart.currentText) {
        stringParts.push(this.currentPart.currentText);
      }

      this.currentPart.currentText = "";
      // We encountered nested placeholder...
      this.currentPart.isStringLiteral = false;
    } else {
      this.currentPart.currentText += ch;
    }
  },
});
