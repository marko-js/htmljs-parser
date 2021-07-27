"use strict";
import complain from "complain";
import charProps from "char-props";
import {
  BaseParser,
  createNotifiers,
  MODE,
  BODY_MODE,
  CODE,
  STATE,
  peek,
  isWhitespaceCode,
  htmlTags,
  operators,
} from "../internal";
export class Parser extends BaseParser {
  public notifiers: ReturnType<typeof createNotifiers>;
  public defaultMode: MODE.HTML | MODE.CONCISE;
  public userIsOpenTagOnly: (tagName: string) => boolean;
  public ignorePlaceholders: boolean;
  public ignoreNonstandardStringPlaceholders: boolean;
  public legacyCompatibility: boolean;
  public currentOpenTag; // Used to reference the current open tag that is being parsed
  public currentAttribute; // Used to reference the current attribute that is being parsed
  public closeTagName; // Used to keep track of the current close tag name as it is being parsed
  public closeTagPos; // Used to keep track of the position of the current closing tag
  public expectedCloseTagName; // Used to figure out when a text block has been ended (HTML tags are ignored)
  public text; // Used to buffer text that is found within the body of a tag
  public withinOpenTag; // Set to true if the parser is within the open tag
  public blockStack; // Used to keep track of HTML tags and HTML blocks
  public indent; // Used to build the indent for the current concise line
  public isConcise; // Set to true if parser is currently in concise mode
  public isWithinSingleLineHtmlBlock; // Set to true if the current block is for a single line HTML block
  public htmlBlockDelimiter; // Current delimiter for multiline HTML blocks nested within a concise tag. e.g. "--"
  public htmlBlockIndent; // Used to hold the indentation for a delimited, multiline HTML block
  public beginMixedMode; // Used as a flag to mark that the next HTML block should enter the parser into HTML mode
  public endingMixedModeAtEOL; // Used as a flag to record that the next EOL to exit HTML mode and go back to concise
  public placeholderDepth; // Used as an easy way to know if an exptression is within a placeholder
  public textParseMode = "html";

  constructor(listeners, options) {
    super(options);
    this.reset();
    this.notifiers = createNotifiers(this, listeners);
    this.defaultMode =
      options && options.concise === false ? MODE.HTML : MODE.CONCISE;
    this.userIsOpenTagOnly = options && options.isOpenTagOnly;
    this.ignorePlaceholders = options && options.ignorePlaceholders;
    this.ignoreNonstandardStringPlaceholders =
      options && options.ignoreNonstandardStringPlaceholders;
    this.legacyCompatibility = options.legacyCompatibility === true;
    this.textParseMode = "html";
    this.setInitialState(
      this.defaultMode === MODE.CONCISE
        ? STATE.CONCISE_HTML_CONTENT
        : STATE.HTML_CONTENT
    );
  }

  enterDefaultState() {
    this.enterState(
      this.defaultMode === MODE.CONCISE
        ? STATE.CONCISE_HTML_CONTENT
        : STATE.HTML_CONTENT
    );
  }

  reset() {
    super.reset();
    this.text = "";
    this.currentOpenTag = undefined;
    this.currentAttribute = undefined;
    this.closeTagName = undefined;
    this.closeTagPos = undefined;
    this.expectedCloseTagName = undefined;
    this.withinOpenTag = false;
    this.blockStack = [];
    this.indent = "";
    this.isConcise = this.defaultMode === MODE.CONCISE;
    this.isWithinSingleLineHtmlBlock = false;
    this.htmlBlockDelimiter = null;
    this.htmlBlockIndent = null;
    this.beginMixedMode = false;
    this.endingMixedModeAtEOL = false;
    this.placeholderDepth = 0;
  }

  outputDeprecationWarning(message: string) {
    var srcCharProps = charProps(this.src);
    var line = srcCharProps.lineAt(this.pos);
    var column = srcCharProps.columnAt(this.pos);
    var filename = this.filename;
    var location = (filename || "(unknown file)") + ":" + line + ":" + column;
    complain(message, { location: location });
  }

  /**
   * This is called to determine if a tag is an "open only tag". Open only tags such as <img>
   * are immediately closed.
   * @param  {String}  tagName The name of the tag (e.g. "img")
   */
  isOpenTagOnly(tagName: string) {
    if (!tagName) {
      return false;
    }

    tagName = tagName.toLowerCase();

    var openTagOnly = this.userIsOpenTagOnly && this.userIsOpenTagOnly(tagName);
    if (openTagOnly == null) {
      openTagOnly = htmlTags.isOpenTagOnly(tagName);
    }

    return openTagOnly;
  }

  /**
   * Clear out any buffered body text and this.notifiers.notify any listeners
   */
  endText(txt?: string) {
    if (arguments.length === 0) {
      txt = this.text;
    }

    this.notifiers.notifyText(txt, this.textParseMode);

    // always clear text buffer...
    this.text = "";
  }

  /**
   * This is used to enter into "HTML" parsing mode instead
   * of concise HTML. We push a block on to the stack so that we know when
   * return back to the previous parsing mode and to ensure that all
   * tags within a block are properly closed.
   */
  beginHtmlBlock(delimiter?: string) {
    this.htmlBlockIndent = this.indent;
    this.htmlBlockDelimiter = delimiter;

    var parent = peek(this.blockStack);
    this.blockStack.push({
      type: "html",
      delimiter: delimiter,
      indent: this.indent,
    });

    if (parent && parent.body) {
      if (parent.body === BODY_MODE.PARSED_TEXT) {
        this.enterState(STATE.PARSED_TEXT_CONTENT);
      } else if (parent.body === BODY_MODE.STATIC_TEXT) {
        this.enterState(STATE.STATIC_TEXT_CONTENT);
      } else {
        throw new Error("Illegal value for parent.body: " + parent.body);
      }
    } else {
      return this.enterState(STATE.HTML_CONTENT);
    }
  }

  /**
   * This method gets called when we are in non-concise mode
   * and we are exiting out of non-concise mode.
   */
  endHtmlBlock() {
    if (
      this.text &&
      (this.isWithinSingleLineHtmlBlock || this.htmlBlockDelimiter)
    ) {
      // Remove the new line that was required to end a single line
      // HTML block or a delimited block
      this.text = this.text.replace(/(\r\n|\n)$/, "");
    }

    // End any text
    this.endText();

    // Make sure all tags in this HTML block are closed
    for (let i = this.blockStack.length - 1; i >= 0; i--) {
      var curBlock = this.blockStack[i];
      if (curBlock.type === "html") {
        // Remove the HTML block from the stack since it has ended
        this.blockStack.pop();
        // We have reached the point where the HTML block started
        // so we can stop
        break;
      } else {
        // The current block is for an HTML tag and it still open. When a tag is tag is closed
        // it is removed from the stack
        this.notifyError(
          curBlock.pos,
          "MISSING_END_TAG",
          'Missing ending "' + curBlock.tagName + '" tag'
        );
        return;
      }
    }

    // Resert variables associated with parsing an HTML block
    this.htmlBlockIndent = null;
    this.htmlBlockDelimiter = null;
    this.isWithinSingleLineHtmlBlock = false;

    if (this.state !== STATE.CONCISE_HTML_CONTENT) {
      this.enterState(STATE.CONCISE_HTML_CONTENT);
    }
  }

  /**
   * This gets called when we reach EOF outside of a tag.
   */
  htmlEOF() {
    this.endText();

    while (this.blockStack.length) {
      var curBlock = peek(this.blockStack);
      if (curBlock.type === "tag") {
        if (curBlock.concise) {
          this.closeTag(curBlock.expectedCloseTagName);
        } else {
          // We found an unclosed tag on the stack that is not for a concise tag. That means
          // there is a problem with the template because all open tags should have a closing
          // tag
          //
          // NOTE: We have already closed tags that are open tag only or self-closed
          this.notifyError(
            curBlock.pos,
            "MISSING_END_TAG",
            'Missing ending "' + curBlock.tagName + '" tag'
          );
          return;
        }
      } else if (curBlock.type === "html") {
        // We reached the end of file while still within a single line HTML block. That's okay
        // though since we know the line is completely. We'll continue ending all open concise tags.
        this.blockStack.pop();
      } else {
        // There is a bug in our this...
        throw new Error(
          "Illegal state. There should not be any non-concise tags on the stack when in concise mode"
        );
      }
    }
  }

  // var this.notifiers.notifyCDATA = notifiers.notifyCDATA;
  // var this.notifiers.notifyComment = notifiers.notifyComment;
  // var this.notifiers.notifyOpenTag = notifiers.notifyOpenTag;
  // var this.notifiers.notifyOpenTagName = notifiers.notifyOpenTagName;
  // var this.notifiers.notifyCloseTag = notifiers.notifyCloseTag;
  // var this.notifiers.notifyDocumentType = notifiers.notifyDocumentType;
  // var this.notifiers.notifyDeclaration = notifiers.notifyDeclaration;
  // var this.notifiers.notifyPlaceholder = notifiers.notifyPlaceholder;
  // var this.notifiers.notifyScriptlet = notifiers.notifyScriptlet;

  notifyError(pos, errorCode, message) {
    this.end();
    this.notifiers.notifyError(pos, errorCode, message);
  }

  closeTag(tagName: string, pos?: number, endPos?: number) {
    if (!tagName) {
      throw new Error("Illegal state. Invalid tag name");
    }
    var lastTag = this.blockStack.length ? this.blockStack.pop() : undefined;

    if (pos == null && this.closeTagPos != null) {
      pos = this.closeTagPos;
      endPos = this.pos + 1;
    }

    if (!lastTag || lastTag.type !== "tag") {
      return this.notifyError(
        pos,
        "EXTRA_CLOSING_TAG",
        'The closing "' + tagName + '" tag was not expected'
      );
    }

    if (
      !lastTag ||
      (lastTag.expectedCloseTagName !== tagName && lastTag.tagName !== tagName)
    ) {
      return this.notifyError(
        pos,
        "MISMATCHED_CLOSING_TAG",
        'The closing "' +
          tagName +
          '" tag does not match the corresponding opening "' +
          lastTag.expectedCloseTagName +
          '" tag'
      );
    }

    tagName = lastTag.tagName;

    this.notifiers.notifyCloseTag(tagName, pos, endPos);

    if (lastTag.beginMixedMode) {
      this.endingMixedModeAtEOL = true;
    }

    this.closeTagName = null;
    this.closeTagPos = null;

    lastTag = peek(this.blockStack);
    this.expectedCloseTagName = lastTag && lastTag.expectedCloseTagName;
  }

  // --------------------------

  getAndRemoveArgument(expression) {
    let start = expression.lastLeftParenPos;
    if (start != null) {
      // The tag has an argument that we need to slice off
      let end = expression.lastRightParenPos;
      if (end === expression.value.length - 1) {
        var argument = {
          value: expression.value.substring(start + 1, end),
          pos: expression.pos + start,
          endPos: expression.pos + end + 1,
        };

        // Chop off the argument from the expression
        expression.value = expression.value.substring(0, start);
        // Fix the end position for the expression
        expression.endPos = expression.pos + expression.value.length;

        return argument;
      }
    }

    return undefined;
  }

  getAndRemoveMethod(expression) {
    if (expression.method) {
      let start = expression.lastLeftParenPos;
      let end = expression.value.length;
      var method = {
        value: "function" + expression.value.substring(start, end),
        pos: expression.pos + start,
        endPos: expression.pos + end,
      };

      // Chop off the method from the expression
      expression.value = expression.value.substring(0, start);
      // Fix the end position for the expression
      expression.endPos = expression.pos + expression.value.length;

      return method;
    }

    return undefined;
  }

  // --------------------------

  checkForPlaceholder(ch, code) {
    if (code === CODE.DOLLAR) {
      var nextCode = this.lookAtCharCodeAhead(1);
      if (nextCode === CODE.OPEN_CURLY_BRACE) {
        // The placeholder expression starts after first curly brace so skip
        // past the {
        this.enterState(STATE.PLACEHOLDER, { escape: true });
        this.skip(1);
        return true;
      } else if (nextCode === CODE.EXCLAMATION) {
        var afterExclamationCode = this.lookAtCharCodeAhead(2);
        if (afterExclamationCode === CODE.OPEN_CURLY_BRACE) {
          // The placeholder expression starts after first curly brace so skip
          // past the !{
          this.enterState(STATE.PLACEHOLDER, { escape: false });
          this.skip(2);
          return true;
        }
      }
    }

    return false;
  }

  checkForEscapedPlaceholder(ch, code) {
    // Look for \${ and \$!{
    if (code === CODE.BACK_SLASH) {
      if (this.lookAtCharCodeAhead(1) === CODE.DOLLAR) {
        if (this.lookAtCharCodeAhead(2) === CODE.OPEN_CURLY_BRACE) {
          return true;
        } else if (this.lookAtCharCodeAhead(2) === CODE.EXCLAMATION) {
          if (this.lookAtCharCodeAhead(3) === CODE.OPEN_CURLY_BRACE) {
            return true;
          }
        }
      }
    }

    return false;
  }

  checkForEscapedEscapedPlaceholder(ch, code) {
    // Look for \\${ and \\$!{
    if (code === CODE.BACK_SLASH) {
      if (this.lookAtCharCodeAhead(1) === CODE.BACK_SLASH) {
        if (this.lookAtCharCodeAhead(2) === CODE.DOLLAR) {
          if (this.lookAtCharCodeAhead(3) === CODE.OPEN_CURLY_BRACE) {
            return true;
          } else if (this.lookAtCharCodeAhead(3) === CODE.EXCLAMATION) {
            if (this.lookAtCharCodeAhead(4) === CODE.OPEN_CURLY_BRACE) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  lookPastWhitespaceFor(str, start = 1) {
    var ahead = start;
    while (isWhitespaceCode(this.lookAtCharCodeAhead(ahead))) ahead++;
    return !!this.lookAheadFor(str, this.pos + ahead);
  }

  getPreviousNonWhitespaceChar(start = -1) {
    var behind = start;
    while (isWhitespaceCode(this.lookAtCharCodeAhead(behind))) behind--;
    return this.lookAtCharAhead(behind);
  }

  getNextIndent() {
    var match = /[^\n]*\n(\s+)/.exec(this.substring(this.pos));
    if (match) {
      var whitespace = match[1].split(/\n/g);
      return whitespace[whitespace.length - 1];
    }
  }

  onlyWhitespaceRemainsOnLine(offset = 1) {
    return /^\s*\n/.test(this.substring(this.pos + offset));
  }

  consumeWhitespace() {
    var ahead = 1;
    var whitespace = "";
    while (isWhitespaceCode(this.lookAtCharCodeAhead(ahead))) {
      whitespace += this.lookAtCharAhead(ahead++);
    }
    this.skip(whitespace.length);
    return whitespace;
  }

  isBeginningOfLine() {
    var before = this.substring(0, this.pos);
    var lines = before.split("\n");
    var lastLine = lines[lines.length - 1];
    return /^\s*$/.test(lastLine);
  }

  checkForClosingTag() {
    // Look ahead to see if we found the closing tag that will
    // take us out of the EXPRESSION state...
    var match =
      this.lookAheadFor("/>") ||
      this.lookAheadFor("/" + peek(this.blockStack).tagName + ">") ||
      this.lookAheadFor("/" + this.expectedCloseTagName + ">");

    if (match) {
      if (this.state === STATE.JS_COMMENT_LINE) {
        this.exitState();
        this.forward = true;
      }
      this.endText();

      this.closeTag(
        this.expectedCloseTagName,
        this.pos,
        this.pos + 1 + match.length
      );
      this.skip(match.length);
      this.enterState(STATE.HTML_CONTENT);
      return true;
    }

    return false;
  }

  checkForCDATA() {
    if (this.lookAheadFor("![CDATA[")) {
      this.enterState(STATE.CDATA);
      this.skip(8);
      return true;
    }

    return false;
  }

  checkForOperator() {
    var remaining = this.data.substring(this.pos);
    var matches = operators.patternNext.exec(remaining);

    if (matches) {
      var match = matches[0];
      var operator = matches[1];

      if (this.legacyCompatibility && operator === "-") {
        return false;
      }

      var isIgnoredOperator = this.isConcise
        ? match.includes("[")
        : match.includes(">");
      if (!isIgnoredOperator) {
        this.skip(match.length - 1);
        return match;
      }
    } else {
      var previous = this.substring(this.pos - operators.longest, this.pos);
      var match2 = operators.patternPrev.exec(previous);
      if (match2) {
        this.rewind(1);
        var whitespace = this.consumeWhitespace();
        return whitespace;
      }
    }

    return false;
  }

  checkForTypeofOperator() {
    var remaining = this.data.substring(this.pos);
    var matches = /^\s+typeof\s+/.exec(remaining);

    if (matches) {
      return matches[0];
    }

    return false;
  }

  checkForTypeofOperatorAtStart() {
    var remaining = this.data.substring(this.pos);
    var matches = /^typeof\s+/.exec(remaining);

    if (matches) {
      return matches[0];
    }

    return false;
  }

  handleDelimitedBlockEOL(newLine) {
    // If we are within a delimited HTML block then we want to check if the next line is the end
    // delimiter. Since we are currently positioned at the start of the new line character our lookahead
    // will need to include the new line character, followed by the expected indentation, followed by
    // the delimiter.
    let endHtmlBlockLookahead = this.htmlBlockIndent + this.htmlBlockDelimiter;

    if (this.lookAheadFor(endHtmlBlockLookahead, this.pos + newLine.length)) {
      this.skip(this.htmlBlockIndent.length);
      this.skip(this.htmlBlockDelimiter.length);

      this.enterState(STATE.CONCISE_HTML_CONTENT);
      this.enterState(STATE.CHECK_TRAILING_WHITESPACE, {
        handler(err, eof) {
          if (err) {
            // This is a non-whitespace! We don't allow non-whitespace
            // after matching two or more hyphens. This is user error...
            this.notifyError(
              this.pos,
              "INVALID_CHARACTER",
              'A non-whitespace of "' +
                err.ch +
                '" was found on the same line as the ending delimiter ("' +
                this.htmlBlockDelimiter +
                '") for a multiline HTML block'
            );
            return;
          }

          this.endHtmlBlock();

          if (eof) {
            this.htmlEOF();
          }
        },
      });
      return;
    } else if (
      this.lookAheadFor(this.htmlBlockIndent, this.pos + newLine.length)
    ) {
      // We know the next line does not end the multiline HTML block, but we need to check if there
      // is any indentation that we need to skip over as we continue parsing the HTML in this
      // multiline HTML block

      this.skip(this.htmlBlockIndent.length);
      // We stay in the same state since we are still parsing a multiline, delimited HTML block
    } else if (this.htmlBlockIndent && !this.onlyWhitespaceRemainsOnLine()) {
      // the next line does not have enough indentation
      // so unless it is black (whitespace only),
      // we will end the block
      this.endHtmlBlock();
    }
  }

  enterHtmlContentState() {
    if (this.state !== STATE.HTML_CONTENT) {
      this.enterState(STATE.HTML_CONTENT);
    }
  }

  enterConciseHtmlContentState() {
    if (this.state !== STATE.CONCISE_HTML_CONTENT) {
      this.enterState(STATE.CONCISE_HTML_CONTENT);
    }
  }

  enterParsedTextContentState() {
    var last =
      this.blockStack.length && this.blockStack[this.blockStack.length - 1];

    if (!last || !last.tagName) {
      throw new Error(
        'The "parsed text content" parser state is only allowed within a tag'
      );
    }

    if (this.isConcise) {
      // We will transition into the STATE.PARSED_TEXT_CONTENT state
      // for each of the nested HTML blocks
      last.body = BODY_MODE.PARSED_TEXT;
      this.enterState(STATE.CONCISE_HTML_CONTENT);
    } else {
      this.enterState(STATE.PARSED_TEXT_CONTENT);
    }
  }

  enterJsContentState() {
    this.enterParsedTextContentState();
  }

  enterCssContentState() {
    this.enterParsedTextContentState();
  }

  enterStaticTextContentState() {
    var last =
      this.blockStack.length && this.blockStack[this.blockStack.length - 1];

    if (!last || !last.tagName) {
      throw new Error(
        'The "static text content" parser state is only allowed within a tag'
      );
    }

    if (this.isConcise) {
      // We will transition into the STATE.STATIC_TEXT_CONTENT state
      // for each of the nested HTML blocks
      last.body = BODY_MODE.STATIC_TEXT;
      this.enterState(STATE.CONCISE_HTML_CONTENT);
    } else {
      this.enterState(STATE.STATIC_TEXT_CONTENT);
    }
  }

  parse(data, filename) {
    super.parse(data, filename);
    this.notifiers.notifyFinish();
  }
}
