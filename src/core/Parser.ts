import {
  BODY_MODE,
  CODE,
  STATE,
  peek,
  isWhitespaceCode,
  Range,
  Handlers,
} from "../internal";

export interface StateDefinition<P extends Range = Range> {
  name: string;
  enter: (this: Parser, activeRange: P) => void;
  exit: (this: Parser, activeRange: P) => void;
  char: (this: Parser, code: number, activeRange: P) => void;
  eol: (this: Parser, length: number, activeRange: P) => void;
  eof: (this: Parser, activeRange: P) => void;
  return: (
    this: Parser,
    childState: StateDefinition,
    childPart: Range,
    activeRange: P
  ) => void;
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
  public activeTag: STATE.OpenTagMeta | undefined; // Used to reference the closest open tag
  public activeAttr: STATE.AttrMeta | undefined; // Used to reference the current attribute that is being parsed
  public isInAttrGroup!: boolean; // Set to true if the parser is within a concise mode attribute group
  public indent!: string; // Used to build the indent for the current concise line
  public isConcise!: boolean; // Set to true if parser is currently in concise mode
  public beginMixedMode?: boolean; // Used as a flag to mark that the next HTML block should enter the parser into HTML mode
  public endingMixedModeAtEOL?: boolean; // Used as a flag to record that the next EOL to exit HTML mode and go back to concise
  public textPos!: number; // Used to buffer text that is found within the body of a tag
  public blockStack!: (
    | STATE.OpenTagMeta
    | {
        type: "html";
        delimiter?: string;
        indent: string;
      }
  )[]; // Used to keep track of HTML tags and HTML blocks

  constructor(public handlers: Handlers) {
    this.handlers = handlers;
    this.reset();
  }

  reset() {
    this.pos = this.maxPos = this.textPos = -1;
    this.data = this.filename = this.indent = "";
    this.activeTag = this.activeAttr = undefined;
    this.isInAttrGroup =
      this.beginMixedMode =
      this.endingMixedModeAtEOL =
        false;
    this.blockStack = [];
    this.rangeStack = [];
    this.stateStack = [];
    this.forward = true;
    this.isConcise = true;
    this.enterState(STATE.CONCISE_HTML_CONTENT);
  }

  read(node: Range) {
    return this.data.slice(node.start, node.end);
  }

  enterState<P extends Range = Range>(
    state: StateDefinition<P>,
    range: Partial<P> = {}
  ): P {
    range.start = this.pos;
    this.stateStack.push((this.activeState = state as StateDefinition));
    this.rangeStack.push((this.activeRange = range as unknown as P));
    state.enter.call(this, range as unknown as P);
    return this.activeRange as P;
  }

  exitState() {
    const childPart = this.rangeStack.pop()!;
    const childState = this.stateStack.pop()!;
    const last = this.rangeStack.length - 1;
    this.activeState = this.stateStack[last];
    this.activeRange = this.rangeStack[last];
    childPart.end = this.pos;
    childState.exit.call(this, childPart);
    this.activeState.return.call(this, childState, childPart, this.activeRange);
    this.forward = false;
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

  lookAtCharCodeAhead(offset: number, startPos = this.pos) {
    return this.data.charCodeAt(startPos + offset);
  }

  rewind(offset: number) {
    return (this.pos -= offset);
  }

  skip(offset: number) {
    return (this.pos += offset);
  }

  startText() {
    if (this.textPos === -1) {
      this.textPos = this.pos;
    }
  }

  endText() {
    const start = this.textPos;
    if (start !== -1) {
      this.handlers.onText?.({ start, end: this.pos });
      this.textPos = -1;
    }
  }

  /**
   * This is used to enter into "HTML" parsing mode instead
   * of concise HTML. We push a block on to the stack so that we know when
   * return back to the previous parsing mode and to ensure that all
   * tags within a block are properly closed.
   */
  beginHtmlBlock(delimiter: string | undefined, singleLine: boolean) {
    this.blockStack.push({
      type: "html",
      delimiter,
      indent: this.indent,
    });

    this.enterState(
      this.activeTag?.bodyMode === BODY_MODE.PARSED_TEXT
        ? STATE.PARSED_TEXT_CONTENT
        : STATE.HTML_CONTENT,
      {
        singleLine,
        delimiter,
        indent: this.indent,
      }
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
        this.emitError(
          block,
          "MISSING_END_TAG",
          'Missing ending "' + this.read(block.tagName) + '" tag'
        );
        return;
      }
    }

    // Resert variables associated with parsing an HTML block
    this.enterState(STATE.CONCISE_HTML_CONTENT);
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
          this.closeTag(this.pos, this.pos, undefined);
        } else {
          // We found an unclosed tag on the stack that is not for a concise tag. That means
          // there is a problem with the template because all open tags should have a closing
          // tag
          //
          // NOTE: We have already closed tags that are open tag only or self-closed
          return this.emitError(
            curBlock,
            "MISSING_END_TAG",
            'Missing ending "' + this.read(curBlock.tagName) + '" tag'
          );
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

  emitError(range: number | Range, code: string, message: string) {
    let start, end;

    if (typeof range === "number") {
      start = end = range;
    } else {
      start = range.start;
      end = range.end;
    }

    this.handlers.onError?.({
      start,
      end,
      code,
      message,
    });

    this.pos = this.maxPos + 1;
  }

  closeTag(start: number, end: number, value: Range | undefined) {
    const lastTag = this.blockStack.pop() as STATE.OpenTagMeta;

    if (lastTag.beginMixedMode) {
      this.endingMixedModeAtEOL = true;
    }

    for (let i = this.blockStack.length; i--; ) {
      const block = this.blockStack[i];
      if (block.type === "tag") {
        this.activeTag = block;
        break;
      }
    }

    if (this.activeTag === lastTag) {
      this.activeTag = undefined;
    }

    this.handlers.onCloseTag?.({
      start,
      end,
      value,
    });
  }

  // --------------------------

  consumeWhitespaceIfBefore(str: string, start = 0) {
    const { pos, data } = this;
    let cur = pos + start;
    while (isWhitespaceCode(data.charCodeAt(cur))) cur++;

    if (this.lookAheadFor(str, cur)) {
      this.pos = cur;
      return true;
    }

    return false;
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

    this.pos = this.maxPos;
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

  parse(data: string, filename: string) {
    this.data = data;
    this.filename = filename;
    const maxPos = (this.maxPos = data.length);

    // Skip the byte order mark (BOM) sequence
    // at the beginning of the file if there is one:
    // - https://en.wikipedia.org/wiki/Byte_order_mark
    // > The Unicode Standard permits the BOM in UTF-8, but does not require or recommend its use.
    this.pos = data.charCodeAt(0) === 0xfeff ? 1 : 0;

    while (this.pos < maxPos) {
      const code = data.charCodeAt(this.pos);

      if (code === CODE.NEWLINE) {
        this.activeState.eol.call(this, 1, this.activeRange);
      } else if (
        code === CODE.CARRIAGE_RETURN &&
        data.charCodeAt(this.pos + 1) === CODE.NEWLINE
      ) {
        this.activeState.eol.call(this, 2, this.activeRange);
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

    while (this.pos === this.maxPos) {
      this.forward = true;
      this.activeState.eof.call(this, this.activeRange);
      if (this.forward) break;
    }
  }
}
