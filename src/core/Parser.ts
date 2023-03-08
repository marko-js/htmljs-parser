import {
  TagType,
  CODE,
  STATE,
  isWhitespaceCode,
  Range,
  ParserOptions as Options,
  getLines,
  getLocation,
  getPosition,
  ErrorCode,
} from "../internal";

export interface Meta extends Range {
  parent: Meta;
  state: StateDefinition;
}
export interface StateDefinition<P extends Meta = Meta> {
  name: string;
  enter: (
    this: Parser,
    parent: Meta,
    pos: number
  ) => Partial<P & { state: unknown }>;
  exit: (this: Parser, activeRange: P) => void;
  char: (this: Parser, code: number, activeRange: P) => void;
  eol: (this: Parser, length: number, activeRange: P) => void;
  eof: (this: Parser, activeRange: P) => void;
  return: (this: Parser, child: Meta, activeRange: P) => void;
}

export class Parser {
  public declare pos: number;
  public declare maxPos: number;
  public declare data: string;
  public declare activeState: StateDefinition;
  public declare activeRange: Meta;
  public declare forward: number;
  public declare activeTag: STATE.OpenTagMeta | undefined; // Used to reference the closest open tag
  public declare activeAttr: STATE.AttrMeta | undefined; // Used to reference the current attribute that is being parsed
  public declare indent: string; // Used to build the indent for the current concise line
  public declare isConcise: boolean; // Set to true if parser is currently in concise mode
  public declare beginMixedMode?: boolean; // Used as a flag to mark that the next HTML block should enter the parser into HTML mode
  public declare endingMixedModeAtEOL?: boolean; // Used as a flag to record that the next EOL to exit HTML mode and go back to concise
  public declare textPos: number; // Used to buffer text that is found within the body of a tag
  public declare lines: undefined | number[]; // Keeps track of line indexes to provide line/column info.

  constructor(public options: Options) {}

  read(range: Range) {
    return this.data.slice(range.start, range.end);
  }

  positionAt(offset: number) {
    return getPosition(
      this.lines || (this.lines = getLines(this.data)),
      offset
    );
  }

  locationAt(range: Range) {
    return getLocation(
      this.lines || (this.lines = getLines(this.data)),
      range.start,
      range.end
    );
  }

  enterState<P extends Meta>(state: StateDefinition<P>): P {
    this.activeState = state as unknown as StateDefinition;
    return (this.activeRange = state.enter.call(
      this,
      this.activeRange,
      this.pos
    ) as P);
  }

  exitState() {
    const { activeRange, activeState } = this;
    const parent = (this.activeRange = activeRange.parent);
    this.activeState = parent.state;
    this.forward = 0;
    activeRange.end = this.pos;
    activeState.exit.call(this, activeRange);
    this.activeState.return.call(this, activeRange, parent);
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

  startText() {
    if (this.textPos === -1) {
      this.textPos = this.pos;
    }
  }

  endText() {
    const start = this.textPos;
    if (start !== -1) {
      this.options.onText?.({ start, end: this.pos });
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
    const content = this.enterState(
      this.activeTag?.type === TagType.text
        ? STATE.PARSED_TEXT_CONTENT
        : STATE.HTML_CONTENT
    );

    content.singleLine = singleLine;
    content.delimiter = delimiter;
    content.indent = this.indent;
  }

  emitError(range: number | Range, code: ErrorCode, message: string) {
    let start, end;

    if (typeof range === "number") {
      start = end = range;
    } else {
      start = range.start;
      end = range.end;
    }

    this.options.onError?.({
      start,
      end,
      code,
      message,
    });

    this.pos = this.maxPos + 1;
  }

  closeTagEnd(start: number, end: number, name: Range | undefined) {
    const { beginMixedMode, parentTag } = this.activeTag!;
    if (beginMixedMode) this.endingMixedModeAtEOL = true;
    this.activeTag = parentTag;

    if (name) this.options.onCloseTagName?.(name);
    this.options.onCloseTagEnd?.({ start, end });
  }

  // --------------------------

  consumeWhitespaceIfBefore(str: string, start = 0) {
    const { pos, data } = this;
    let cur = pos + start;
    while (isWhitespaceCode(data.charCodeAt(cur))) cur++;

    if (this.lookAheadFor(str, cur)) {
      this.pos = cur;
      if (this.forward > 1) this.forward = 1;
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
            this.pos += ahead;
            return true;
        }
      } else {
        this.pos += ahead;
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
    this.pos += ahead;
  }

  parse(data: string) {
    const maxPos = (this.maxPos = data.length);
    this.data = data;
    this.indent = "";
    this.textPos = -1;
    this.forward = 1;
    this.isConcise = true;
    this.beginMixedMode = this.endingMixedModeAtEOL = false;
    this.lines = this.activeTag = this.activeAttr = undefined;

    // Skip the byte order mark (BOM) sequence
    // at the beginning of the file if there is one:
    // - https://en.wikipedia.org/wiki/Byte_order_mark
    // > The Unicode Standard permits the BOM in UTF-8, but does not require or recommend its use.
    this.pos = data.charCodeAt(0) === 0xfeff ? 1 : 0;
    this.enterState(STATE.CONCISE_HTML_CONTENT);

    while (this.pos < maxPos) {
      const code = data.charCodeAt(this.pos);

      if (code === CODE.NEWLINE) {
        this.forward = 1;
        this.activeState.eol.call(this, 1, this.activeRange);
      } else if (
        code === CODE.CARRIAGE_RETURN &&
        data.charCodeAt(this.pos + 1) === CODE.NEWLINE
      ) {
        this.forward = 2;
        this.activeState.eol.call(this, 2, this.activeRange);
      } else {
        this.forward = 1;
        this.activeState.char.call(this, code, this.activeRange);
      }

      this.pos += this.forward;
    }

    while (this.pos === this.maxPos) {
      this.forward = 1;
      this.activeState.eof.call(this, this.activeRange);
      if (this.forward !== 0) break;
    }
  }
}
