import {
  createNotifiers,
  BODY_MODE,
  CODE,
  STATE,
  peek,
  isWhitespaceCode,
  Range,
} from "../internal";

export interface StateDefinition<P extends Range = Range> {
  name: string;
  eol?: (this: Parser, length: number, activeRange: P) => void;
  eof?: (this: Parser, activeRange: P) => void;
  enter?: (this: Parser, activeRange: P) => void;
  exit?: (this: Parser, activeRange: P) => void;
  return?: (
    this: Parser,
    childState: StateDefinition,
    childPart: Range,
    activeRange: P
  ) => void;
  char: (this: Parser, code: number, activeRange: P) => void;
}

export class Parser {
  public pos!: number;
  public maxPos!: number;
  public data!: string;
  public filename!: string;
  public activeState!: StateDefinition;
  public stateStack!: StateDefinition[]; // Used to keep track of nested states.
  public activeRange!: Range; // The current pos object at the top of the stack
  public rangeStack!: Range[]; // Used to keep track of parts such as CDATA, expressions, declarations, etc.
  public forward!: boolean;
  public notifiers: ReturnType<typeof createNotifiers>;
  public activeTag: STATE.OpenTagRange | undefined; // Used to reference the closest open tag
  public activeAttr: STATE.AttrRange | undefined; // Used to reference the current attribute that is being parsed
  public isInAttrGroup!: boolean; // Set to true if the parser is within a concise mode attribute group
  public isInSingleLineHtmlBlock!: boolean; // Set to true if the current block is for a single line HTML block
  public indent!: string; // Used to build the indent for the current concise line
  public isConcise!: boolean; // Set to true if parser is currently in concise mode
  public htmlBlockDelimiter?: string; // Current delimiter for multiline HTML blocks nested within a concise tag. e.g. "--"
  public htmlBlockIndent?: string; // Used to hold the indentation for a delimited, multiline HTML block
  public beginMixedMode?: boolean; // Used as a flag to mark that the next HTML block should enter the parser into HTML mode
  public endingMixedModeAtEOL?: boolean; // Used as a flag to record that the next EOL to exit HTML mode and go back to concise
  public textPos!: number; // Used to buffer text that is found within the body of a tag
  public textParseMode!: "html" | "cdata" | "parsed-text";
  public blockStack!: ((
    | STATE.OpenTagRange
    | {
        type: "html";
        delimiter?: string;
        indent: string;
      }
  ) & { body?: BODY_MODE; nestedIndent?: string })[]; // Used to keep track of HTML tags and HTML blocks

  constructor(listeners: any) {
    this.reset();
    this.notifiers = createNotifiers(this, listeners);
  }

  read(node: Range) {
    return this.data.slice(node.start, node.end);
  }

  reset() {
    this.pos = -1;
    this.maxPos = -1;
    this.rangeStack = [];
    this.stateStack = [];
    this.forward = true;
    this.textPos = -1;
    this.textParseMode = "html";
    this.activeTag = undefined;
    this.activeAttr = undefined;
    this.blockStack = [];
    this.indent = "";
    this.isConcise = true;
    this.isInAttrGroup = false;
    this.isInSingleLineHtmlBlock = false;
    this.htmlBlockDelimiter = undefined;
    this.htmlBlockIndent = undefined;
    this.beginMixedMode = false;
    this.endingMixedModeAtEOL = false;
  }

  enterState<P extends Range = Range>(
    state: StateDefinition<P>,
    range: Partial<P> = {}
  ): P {
    range.start = this.pos;
    this.stateStack.push((this.activeState = state as StateDefinition));
    this.rangeStack.push((this.activeRange = range as unknown as P));
    state.enter?.call(this, range as unknown as P);
    return this.activeRange as P;
  }

  exitState(includedEndChars?: string) {
    if (includedEndChars) {
      for (let i = 0; i < includedEndChars.length; i++) {
        if (this.data[this.pos + i] !== includedEndChars[i]) {
          if (this.pos + i >= this.maxPos) {
            this.notifyError(
              this.activeRange,
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

    const childPart = this.rangeStack.pop()!;
    const childState = this.stateStack.pop()!;
    this.activeState = peek(this.stateStack)!;
    this.activeRange = peek(this.rangeStack)!;
    childPart.end = this.pos;
    childState.exit?.call(this, childPart);
    this.activeState.return?.call(
      this,
      childState,
      childPart,
      this.activeRange
    );
    this.forward = false;
  }

  checkForTerminator(terminator: string | string[]) {
    if (typeof terminator === "string") {
      if (this.data[this.pos] === terminator) {
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
        if (this.checkForTerminator(terminator[i])) {
          return true;
        }
      }
    }
  }

  /**
   * Compare a position in the source to either another position, or a string.
   */
  matchAtPos(a: Range, b: Range | string) {
    const aPos = a.start;
    const aLen = a.end - aPos;
    let bPos = 0;
    let bLen = 0;
    let bSource = this.data;

    if (typeof b === "string") {
      bLen = b.length;
      bSource = b;
    } else {
      bPos = b.start;
      bLen = b.end - bPos;
    }

    if (aLen !== bLen) return false;
    for (let i = 0; i < aLen; i++) {
      if (this.data.charAt(aPos + i) !== bSource.charAt(bPos + i)) {
        return false;
      }
    }

    return true;
  }

  matchAnyAtPos(a: Range, list: (Range | string)[]) {
    for (const item of list) {
      if (this.matchAtPos(a, item)) return true;
    }

    return false;
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

  startText(offset = 0) {
    if (this.textPos === -1) {
      this.textPos = this.pos + offset;
    }
  }

  endText(offset = 0) {
    if (this.textPos !== -1) {
      const endPos = this.pos + offset;
      if (this.textPos < endPos) {
        this.notifiers.notifyText(this.textPos, endPos, this.textParseMode);
      }

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
    this.blockStack.push({
      type: "html",
      delimiter,
      indent: this.indent,
    });

    this.enterState(
      this.activeTag?.body === BODY_MODE.PARSED_TEXT
        ? STATE.PARSED_TEXT_CONTENT
        : STATE.HTML_CONTENT
    );
  }

  /**
   * This method gets called when we are in non-concise mode
   * and we are exiting out of non-concise mode.
   */
  endHtmlBlock() {
    // Make sure all tags in this HTML block are closed
    for (let i = this.blockStack.length; i--; ) {
      const block = this.blockStack[i];
      if (block.type === "html") {
        // Remove the HTML block from the stack since it has ended
        this.blockStack.pop();
        // We have reached the point where the HTML block started
        // so we can stop
        break;
      } else {
        // The current block is for an HTML tag and it still open. When a tag is tag is closed
        // it is removed from the stack
        this.notifyError(
          block,
          "MISSING_END_TAG",
          'Missing ending "' + this.read(block.tagName) + '" tag'
        );
        return;
      }
    }

    // Resert variables associated with parsing an HTML block
    this.htmlBlockIndent = undefined;
    this.htmlBlockDelimiter = undefined;
    this.isInSingleLineHtmlBlock = false;

    if (this.activeState !== STATE.CONCISE_HTML_CONTENT) {
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
            'Missing ending "' + this.read(curBlock.tagName) + '" tag'
          );
          return;
        }
      } else if (curBlock.type === "html") {
        // We reached the end of file while still within a single line HTML block. That's okay
        // though since we know the line is completed. We'll continue ending all open concise tags.
        this.blockStack.pop();
      } else {
        // There is a bug in our this...
        throw new Error(
          "Illegal state. There should not be any non-concise tags on the stack when in concise mode"
        );
      }
    }
  }

  notifyError(pos: number | Range, errorCode: string, message: string) {
    if (typeof pos === "number") {
      this.notifiers.notifyError(pos, errorCode, message);
    } else {
      this.notifiers.notifyError(pos.start, errorCode, message);
    }
    this.end();
  }

  closeTag(closeTag?: Range) {
    const lastBlock = this.blockStack.pop();

    if (closeTag) {
      const closeTagNameStart = closeTag.start + 2; // strip </
      const closeTagNameEnd = closeTag.end - 1; // strip >

      if (!lastBlock || lastBlock.type !== "tag") {
        return this.notifyError(
          closeTag!,
          "EXTRA_CLOSING_TAG",
          'The closing "' +
            this.read({ start: closeTagNameStart, end: closeTagNameEnd }) +
            '" tag was not expected'
        );
      }

      if (closeTagNameStart < closeTagNameEnd!) {
        const closeTagNamePos = {
          start: closeTagNameStart,
          end: closeTagNameEnd,
        };

        if (
          !this.matchAtPos(
            closeTagNamePos,
            lastBlock.tagName.end > lastBlock.tagName.start
              ? lastBlock.tagName
              : "div"
          )
        ) {
          const shorthandEndPos = Math.max(
            lastBlock.shorthandId ? lastBlock.shorthandId.end : 0,
            lastBlock.shorthandClassNames
              ? peek(lastBlock.shorthandClassNames)!.end
              : 0
          );

          if (
            shorthandEndPos === 0 ||
            !this.matchAtPos(closeTagNamePos, {
              start: lastBlock.tagName.start,
              end: shorthandEndPos,
            })
          ) {
            return this.notifyError(
              closeTag,
              "MISMATCHED_CLOSING_TAG",
              'The closing "' +
                this.read(closeTagNamePos) +
                '" tag does not match the corresponding opening "' +
                (this.read(lastBlock.tagName) || "div") +
                '" tag'
            );
          }
        }
      }

      this.notifiers.notifyCloseTag({
        start: closeTag.start,
        end: closeTag.end,
        value: {
          start: closeTagNameStart,
          end: closeTagNameEnd,
        },
      });
    } else {
      this.notifiers.notifyCloseTag({
        start: this.pos,
        end: this.pos,
      });
    }

    if (lastBlock?.type === "tag") {
      if (lastBlock.beginMixedMode) {
        this.endingMixedModeAtEOL = true;
      }

      for (let i = this.blockStack.length; i--; ) {
        const block = this.blockStack[i];
        if (block.type === "tag") {
          this.activeTag = block;
          break;
        }
      }

      if (this.activeTag === lastBlock) {
        this.activeTag = undefined;
      }
    }
  }

  // --------------------------

  lookPastWhitespaceFor(str: string, start = 1) {
    let ahead = start;
    while (isWhitespaceCode(this.lookAtCharCodeAhead(ahead))) ahead++;
    return !!this.lookAheadFor(str, this.pos + ahead);
  }

  getPreviousNonWhitespaceCharCode(start = -1) {
    let behind = start;
    while (isWhitespaceCode(this.lookAtCharCodeAhead(behind))) behind--;
    return this.lookAtCharCodeAhead(behind);
  }

  onlyWhitespaceRemainsOnLine(start = 1) {
    const maxOffset = this.maxPos - this.pos;
    let ahead = start;

    while (ahead < maxOffset) {
      const code = this.lookAtCharCodeAhead(ahead);
      if (isWhitespaceCode(code)) {
        switch (code) {
          case CODE.CARRIAGE_RETURN:
          case CODE.NEWLINE:
            return true;
        }
      } else {
        return false;
      }

      ahead++;
    }

    return true;
  }

  consumeWhitespaceOnLine(start = 1) {
    const maxOffset = this.maxPos - this.pos;
    let ahead = start;

    while (ahead < maxOffset) {
      const code = this.lookAtCharCodeAhead(ahead);
      if (isWhitespaceCode(code)) {
        switch (code) {
          case CODE.CARRIAGE_RETURN:
          case CODE.NEWLINE:
            this.skip(ahead);
            return true;
        }
      } else {
        this.skip(ahead);
        return false;
      }

      ahead++;
    }

    this.end();
    return true;
  }

  consumeWhitespace() {
    const maxOffset = this.maxPos - this.pos;
    let ahead = 0;
    while (
      ahead < maxOffset &&
      isWhitespaceCode(this.lookAtCharCodeAhead(ahead))
    ) {
      ahead++;
    }
    this.skip(ahead);
  }

  handleDelimitedBlockEOL(newLineLength: number) {
    // If we are within a delimited HTML block then we want to check if the next line is the end
    // delimiter. Since we are currently positioned at the start of the new line character our lookahead
    // will need to include the new line character, followed by the expected indentation, followed by
    // the delimiter.
    const endHtmlBlockLookahead =
      this.htmlBlockIndent! + this.htmlBlockDelimiter;

    if (this.lookAheadFor(endHtmlBlockLookahead, this.pos + newLineLength)) {
      this.startText(); // we want to at least include the newline as text.
      this.endText(newLineLength);
      this.skip(endHtmlBlockLookahead.length + newLineLength);

      if (this.consumeWhitespaceOnLine(0)) {
        this.endHtmlBlock();
      } else {
        this.notifyError(
          this.pos,
          "INVALID_CHARACTER",
          "A concise mode closing block delimiter can only be followed by whitespace."
        );
      }
    } else if (
      this.lookAheadFor(this.htmlBlockIndent!, this.pos + newLineLength)
    ) {
      // We know the next line does not end the multiline HTML block, but we need to check if there
      // is any indentation that we need to skip over as we continue parsing the HTML in this
      // multiline HTML block

      this.startText();
      this.skip(this.htmlBlockIndent!.length);
      // We stay in the same state since we are still parsing a multiline, delimited HTML block
    } else if (this.htmlBlockIndent && !this.onlyWhitespaceRemainsOnLine()) {
      this.endText();
      // the next line does not have enough indentation
      // so unless it is blank (whitespace only),
      // we will end the block
      this.endHtmlBlock();
    } else {
      this.startText();
    }
  }

  enterParsedTextContentState() {
    const lastBlock = peek(this.blockStack);

    if (
      !lastBlock ||
      lastBlock.type === "html" ||
      lastBlock.tagName.start === lastBlock.tagName.end
    ) {
      throw new Error(
        'The "parsed text content" parser state is only allowed within a tag'
      );
    }

    if (this.isConcise) {
      // We will transition into the STATE.PARSED_TEXT_CONTENT state
      // for each of the nested HTML blocks
      lastBlock.body = BODY_MODE.PARSED_TEXT;
      this.enterState(STATE.CONCISE_HTML_CONTENT);
    } else {
      this.enterState(STATE.PARSED_TEXT_CONTENT);
    }
  }

  parse(data: string, filename: string) {
    // call the constructor function again because we have a contract that
    // it will fully reset the parser
    this.reset();

    this.filename = filename;
    this.data = data;

    // Enter initial state
    this.enterState(STATE.CONCISE_HTML_CONTENT);

    // Move to first position
    // Skip the byte order mark (BOM) sequence
    // at the beginning of the file if there is one:
    // - https://en.wikipedia.org/wiki/Byte_order_mark
    // > The Unicode Standard permits the BOM in UTF-8, but does not require or recommend its use.
    this.pos = data.charCodeAt(0) === 0xfeff ? 1 : 0;
    this.maxPos = data.length;
    while (this.pos < this.maxPos) {
      const code = data.charCodeAt(this.pos);

      if (code === CODE.NEWLINE) {
        this.activeState.eol?.call(this, 1, this.activeRange);
      } else if (
        code === CODE.CARRIAGE_RETURN &&
        data.charCodeAt(this.pos + 1) === CODE.NEWLINE
      ) {
        this.activeState.eol?.call(this, 2, this.activeRange);
        this.pos++;
      } else {
        this.activeState.char.call(this, code, this.activeRange);
      }

      if (this.forward) {
        this.pos++;
      } else {
        this.forward = true;
      }
    }

    do {
      this.forward = true;
      this.activeState.eof?.call(this, this.activeRange);
    } while (!this.forward);

    this.notifiers.notifyFinish();
  }
}
