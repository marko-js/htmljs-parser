"use strict";
import {
  createNotifiers,
  BODY_MODE,
  CODE,
  STATE,
  peek,
  isWhitespaceCode,
  htmlTags,
  getTagName,
  Pos,
  ExpressionPos,
  TemplatePos,
} from "../internal";

export interface PartMeta {
  parentState: StateDefinition;
}
export interface Part extends PartMeta, Pos {}
export interface ExpressionPart extends PartMeta, ExpressionPos {}
export interface TemplatePart extends PartMeta, TemplatePos {}
export interface StateDefinition<P extends Part = Part> {
  name: string;
  eol?: (this: Parser, str: string, activePart: P) => void;
  eof?: (this: Parser, activePart: P) => void;
  enter?: (
    this: Parser,
    activePart: P,
    parentState: StateDefinition | undefined
  ) => void;
  exit?: (this: Parser, activePart: P) => void;
  return?: (
    this: Parser,
    childState: StateDefinition,
    childPart: Part,
    activePart: P
  ) => void;
  char?: (this: Parser, char: string, code: number, activePart: P) => void;
}

export class Parser {
  public pos!: number;
  public maxPos!: number;
  public data!: string;
  public filename!: string;
  public state!: StateDefinition;
  public parts!: Part[]; // Used to keep track of parts such as CDATA, expressions, declarations, etc.
  public activePart!: Part; // The current part at the top of the part stack
  public forward!: boolean;
  public notifiers: ReturnType<typeof createNotifiers>;
  public currentOpenTag: STATE.OpenTagPart | undefined; // Used to reference the current open tag that is being parsed
  public currentAttribute: STATE.AttrPart | undefined; // Used to reference the current attribute that is being parsed
  public withinAttrGroup!: boolean; // Set to true if the parser is within a concise mode attribute group
  public indent!: string; // Used to build the indent for the current concise line
  public isConcise!: boolean; // Set to true if parser is currently in concise mode
  public isWithinSingleLineHtmlBlock!: boolean; // Set to true if the current block is for a single line HTML block
  public isWithinRegExpCharset!: boolean; // Set to true if the current regexp entered a charset.
  public htmlBlockDelimiter?: string; // Current delimiter for multiline HTML blocks nested within a concise tag. e.g. "--"
  public htmlBlockIndent?: string; // Used to hold the indentation for a delimited, multiline HTML block
  public beginMixedMode?: boolean; // Used as a flag to mark that the next HTML block should enter the parser into HTML mode
  public endingMixedModeAtEOL?: boolean; // Used as a flag to record that the next EOL to exit HTML mode and go back to concise
  public textPos!: number; // Used to buffer text that is found within the body of a tag
  public text!: string; // Used to buffer text that is found within the body of a tag
  public textParseMode!: "html" | "cdata" | "parsed-text" | "static-text";
  public blockStack!: ((
    | STATE.OpenTagPart
    | {
        type: "html";
        delimiter?: string;
        indent: string;
      }
  ) & { body?: BODY_MODE; nestedIndent?: string })[]; // Used to keep track of HTML tags and HTML blocks

  constructor(listeners) {
    this.reset();
    this.notifiers = createNotifiers(this, listeners);
  }

  read(node: Pos) {
    return this.substring(node.pos, node.endPos);
  }

  reset() {
    this.pos = -1;
    this.maxPos = -1;
    this.parts = [];
    this.forward = true;
    this.textPos = -1;
    this.text = "";
    this.textParseMode = "html";
    this.currentOpenTag = undefined;
    this.currentAttribute = undefined;
    this.blockStack = [];
    this.indent = "";
    this.isConcise = true;
    this.withinAttrGroup = false;
    this.isWithinRegExpCharset = false;
    this.isWithinSingleLineHtmlBlock = false;
    this.htmlBlockDelimiter = undefined;
    this.htmlBlockIndent = undefined;
    this.beginMixedMode = false;
    this.endingMixedModeAtEOL = false;
  }

  enterState<P extends Part = Part>(
    state: StateDefinition<P>,
    part: Partial<P> = {}
  ) {
    // if (this.state === state) {
    //   // Re-entering the same state can lead to unexpected behavior
    //   // so we should throw error to catch these types of mistakes
    //   throw new Error(
    //     "Re-entering the current state is illegal - " + state.name
    //   );
    // }

    const parentState = this.state;
    const activePart = (this.activePart = part as unknown as P);
    this.state = state as StateDefinition;
    this.parts.push(activePart);
    part.pos = this.pos;
    part.parentState = parentState;
    state.enter?.call(this, activePart, parentState);
    return this.activePart;
  }

  exitState(includedEndChars?: string) {
    if (includedEndChars) {
      for (let i = 0; i < includedEndChars.length; i++) {
        if (this.data[this.pos + i] !== includedEndChars[i]) {
          if (this.pos + i >= this.maxPos) {
            this.notifyError(
              this.activePart,
              "UNEXPECTED_EOF",
              "EOF reached with current part incomplete"
            );
          } else {
            throw new Error(
              "Unexpected end character at position " + (this.pos + i)
            );
          }
        }
      }
      this.skip(includedEndChars.length);
    }

    const childPart = this.parts.pop()!;
    const childState = this.state;
    const parentState = (this.state = childPart.parentState);
    const parentPart = (this.activePart = peek(this.parts)!);

    childPart.endPos = this.pos;

    if (childState.exit) {
      childState.exit.call(this, childPart);
    }

    if (parentState.return) {
      parentState.return.call(this, childState, childPart, parentPart);
    }

    this.forward = false;
  }

  checkForTerminator(terminator: string | string[], ch: string) {
    if (typeof terminator === "string") {
      if (ch === terminator) {
        return true;
      } else if (terminator.length > 1) {
        for (let i = 0; i < terminator.length; i++) {
          if (this.data[this.pos + i] !== terminator[i]) {
            return false;
          }
        }
        return true;
      }
    } else {
      for (let i = 0; i < terminator.length; i++) {
        if (this.checkForTerminator(terminator[i], ch)) {
          return true;
        }
      }
    }
  }

  /**
   * Look ahead to see if the given str matches the substring sequence
   * beyond
   */
  lookAheadFor(str: string, startPos = this.pos + 1) {
    let i = str.length;
    if (startPos + i <= this.maxPos) {
      const { data } = this;
      for (; i--; ) {
        if (str[i] !== data[startPos + i]) {
          return undefined;
        }
      }

      return str;
    }
  }

  /**
   * Look ahead to a character at a specific offset.
   * The callback will be invoked with the character
   * at the given position.
   */
  lookAtCharAhead(offset: number, startPos = this.pos) {
    return this.data.charAt(startPos + offset);
  }

  lookAtCharCodeAhead(offset: number, startPos = this.pos) {
    return this.data.charCodeAt(startPos + offset);
  }

  rewind(offset: number) {
    return (this.pos -= offset);
  }

  skip(offset: number) {
    return (this.pos += offset);
  }

  end() {
    this.pos = this.maxPos + 1;
  }

  substring(pos: number, endPos?: number) {
    return this.data.substring(pos, endPos);
  }

  /**
   * This is called to determine if a tag is an "open only tag". Open only tags such as <img>
   * are immediately closed.
   */
  isOpenTagOnly(tagName: string) {
    return tagName ? htmlTags.isOpenTagOnly(tagName.toLowerCase()) : false;
  }

  addText(text: string) {
    if (this.text) {
      this.text += text;
    } else {
      this.textPos = this.pos;
      this.text = text;
    }
  }

  /**
   * Clear out any buffered body text and this.notifiers.notify any listeners
   */
  endText() {
    if (this.textPos !== -1) {
      this.notifiers.notifyText(
        this.textPos,
        this.textPos + this.text.length,
        this.text,
        this.textParseMode
      );
      // always clear text buffer...
      this.text = "";
      this.textPos = -1;
    }
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

    const parent = peek(this.blockStack);
    this.blockStack.push({
      type: "html",
      delimiter,
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
      const curBlock = this.blockStack[i];
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
          curBlock,
          "MISSING_END_TAG",
          'Missing ending "' + curBlock.tagName.value + '" tag'
        );
        return;
      }
    }

    // Resert variables associated with parsing an HTML block
    this.htmlBlockIndent = undefined;
    this.htmlBlockDelimiter = undefined;
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
      const curBlock = peek(this.blockStack)!;
      if (curBlock.type === "tag") {
        if (curBlock.concise) {
          this.closeTag();
        } else {
          // We found an unclosed tag on the stack that is not for a concise tag. That means
          // there is a problem with the template because all open tags should have a closing
          // tag
          //
          // NOTE: We have already closed tags that are open tag only or self-closed
          this.notifyError(
            curBlock,
            "MISSING_END_TAG",
            'Missing ending "' + curBlock.tagName.value + '" tag'
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

  notifyError(pos: number | Pos, errorCode: string, message: string) {
    if (typeof pos === "number") {
      this.notifiers.notifyError(pos, errorCode, message);
    } else {
      this.notifiers.notifyError(pos.pos, errorCode, message);
    }
    this.end();
  }

  closeTag(pos?: number, endPos?: number, tagName?: ValuePart) {
    const lastTag = this.blockStack.pop();

    if (!lastTag || lastTag.type !== "tag") {
      return this.notifyError(
        pos!,
        "EXTRA_CLOSING_TAG",
        'The closing "' + tagName!.value + '" tag was not expected'
      );
    }

    if (tagName?.value) {
      const expectedCloseTagName = getTagName(lastTag);

      if (tagName.value !== (expectedCloseTagName || "div")) {
        const shorthandEndPos = Math.max(
          lastTag.shorthandId ? lastTag.shorthandId.endPos : 0,
          lastTag.shorthandClassNames
            ? lastTag.shorthandClassNames[
                lastTag.shorthandClassNames.length - 1
              ].endPos
            : 0
        );

        if (
          !shorthandEndPos ||
          // accepts including the tag class/id shorthands as part of the close tag name.
          tagName.value !== this.substring(lastTag.tagName.pos, shorthandEndPos)
        ) {
          return this.notifyError(
            pos!,
            "MISMATCHED_CLOSING_TAG",
            'The closing "' +
              tagName.value +
              '" tag does not match the corresponding opening "' +
              (expectedCloseTagName || "div") +
              '" tag'
          );
        }
      }
    }

    this.notifiers.notifyCloseTag(pos, endPos, tagName);

    if (lastTag.beginMixedMode) {
      this.endingMixedModeAtEOL = true;
    }
  }

  // --------------------------

  lookPastWhitespaceFor(str: string, start = 1) {
    let ahead = start;
    while (isWhitespaceCode(this.lookAtCharCodeAhead(ahead))) ahead++;
    return !!this.lookAheadFor(str, this.pos + ahead);
  }

  getPreviousNonWhitespaceChar(start = -1) {
    let behind = start;
    while (isWhitespaceCode(this.lookAtCharCodeAhead(behind))) behind--;
    return this.lookAtCharAhead(behind);
  }

  onlyWhitespaceRemainsOnLine(offset = 1) {
    for (let i = this.pos + offset; i < this.maxPos; i++) {
      const code = this.data.charCodeAt(i);
      if (code === CODE.NEWLINE) return true;
      if (!isWhitespaceCode(code)) break;
    }

    return false;
  }

  consumeWhitespace() {
    let ahead = 1;
    let whitespace = "";
    while (isWhitespaceCode(this.lookAtCharCodeAhead(ahead))) {
      whitespace += this.lookAtCharAhead(ahead++);
    }
    this.skip(whitespace.length);
    return whitespace;
  }

  checkForClosingTag() {
    // Look ahead to see if we found the closing tag that will
    // take us out of the EXPRESSION state...
    const match =
      this.lookAheadFor("/>") ||
      this.lookAheadFor("/" + getTagName(peek(this.blockStack)) + ">");

    if (match) {
      if (this.state === STATE.JS_COMMENT_LINE) {
        this.exitState();
      }

      const pos = this.pos;
      const endPos = this.skip(match.length + 1);
      this.endText();
      this.closeTag(pos, endPos, {
        value: match.slice(1, -1),
        pos: pos + 2,
        endPos: endPos - 1,
      } as ValuePart);
      this.enterState(STATE.HTML_CONTENT);
      this.forward = false;
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

  handleDelimitedBlockEOL(newLine: string) {
    // If we are within a delimited HTML block then we want to check if the next line is the end
    // delimiter. Since we are currently positioned at the start of the new line character our lookahead
    // will need to include the new line character, followed by the expected indentation, followed by
    // the delimiter.
    const endHtmlBlockLookahead =
      this.htmlBlockIndent! + this.htmlBlockDelimiter;

    if (this.lookAheadFor(endHtmlBlockLookahead, this.pos + newLine.length)) {
      this.skip(this.htmlBlockIndent!.length);
      this.skip(this.htmlBlockDelimiter!.length);

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
      this.lookAheadFor(this.htmlBlockIndent!, this.pos + newLine.length)
    ) {
      // We know the next line does not end the multiline HTML block, but we need to check if there
      // is any indentation that we need to skip over as we continue parsing the HTML in this
      // multiline HTML block

      this.skip(this.htmlBlockIndent!.length);
      // We stay in the same state since we are still parsing a multiline, delimited HTML block
    } else if (this.htmlBlockIndent && !this.onlyWhitespaceRemainsOnLine()) {
      // the next line does not have enough indentation
      // so unless it is blank (whitespace only),
      // we will end the block
      this.endHtmlBlock();
    }
  }

  enterParsedTextContentState() {
    const last =
      this.blockStack.length && this.blockStack[this.blockStack.length - 1];

    if (!last || last.type === "html" || !last.tagName.value) {
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
    const last =
      this.blockStack.length && this.blockStack[this.blockStack.length - 1];

    if (!last || last.type === "html" || !last.tagName.value) {
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

  parse(data: string, filename: string) {
    // call the constructor function again because we have a contract that
    // it will fully reset the parser
    this.reset();

    this.filename = filename;
    this.data = data;
    this.maxPos = data.length;

    // Enter initial state
    this.enterState(STATE.CONCISE_HTML_CONTENT);

    // Move to first position
    // Skip the byte order mark (BOM) sequence
    // at the beginning of the file if there is one:
    // - https://en.wikipedia.org/wiki/Byte_order_mark
    // > The Unicode Standard permits the BOM in UTF-8, but does not require or recommend its use.
    this.pos = data.charCodeAt(0) === 0xfeff ? 1 : 0;

    let pos: number;
    while ((pos = this.pos) <= this.maxPos) {
      const ch = data[pos];
      const code = ch && ch.charCodeAt(0);
      const state = this.state;
      let length = 1;

      if (code === CODE.NEWLINE) {
        state.eol?.call(this, ch, this.activePart);
      } else if (code === CODE.CARRIAGE_RETURN) {
        const nextPos = pos + 1;
        if (
          nextPos < data.length &&
          data.charCodeAt(nextPos) === CODE.NEWLINE
        ) {
          state.eol?.call(this, "\r\n", this.activePart);
          length = 2;
        }
      } else if (code) {
        // We assume that every state will have "char" function
        // TODO: only check during debug.
        if (!state.char) {
          throw new Error(
            `State ${state.name} has no "char" function (${JSON.stringify(
              ch
            )}, ${code})`
          );
        }
        state.char.call(this, ch, code, this.activePart);
      } else {
        state.eof?.call(this, this.activePart);
      }

      // move to next position
      if (this.forward) {
        this.pos += length;
      } else {
        this.forward = true;
      }
    }

    this.notifiers.notifyFinish();
  }
}
