"use strict";

import { Parser, CODE } from "../internal";
export interface StateDefinition {
  name: string;
  eol?: (this: Parser, str?: string) => void;
  eof?: (this: Parser) => void;
  enter?: (this: Parser, parentState?: StateDefinition) => void;
  expression?: (this: Parser, expression: any) => void;
  placeholder?: (this: Parser, placeholder: any) => void;
  string?: (this: Parser, string: any) => void;
  templateString?: (this: Parser, templateString: any) => void;
  regularExpression?: (this: Parser, regularExpression: any) => void;
  endTrailingWhitespace?: (this: Parser, eof: any) => void;
  comment?: (this: Parser, comment: any) => void;
  char?: (this: Parser, char: string, code: number) => void;
}

export class BaseParser {
  public pos: number;
  public maxPos: number;
  public data: string;
  public src: string;
  public filename: string;
  public state: StateDefinition;
  public initialState: StateDefinition;

  static createState(def: StateDefinition) {
    return def;
  }

  constructor(options) {
    this.reset();
  }

  reset() {
    // current absolute character position
    this.pos = -1;

    // The maxPos property is the last absolute character position that is
    // readable based on the currently received chunks
    this.maxPos = -1;

    // the current parser state
    this.state = null;

    // The raw string that we are parsing
    this.data = this.src = null;

    this.filename = null;
  }

  setInitialState(initialState) {
    this.initialState = initialState;
  }

  enterState(state) {
    if (this.state === state) {
      // Re-entering the same state can lead to unexpected behavior
      // so we should throw error to catch these types of mistakes
      throw new Error(
        "Re-entering the current state is illegal - " + state.name
      );
    }

    var oldState;
    if ((oldState = this.state) && oldState.leave) {
      // console.log('Leaving state ' + oldState.name);
      oldState.leave.call(this, state);
    }

    // console.log('Entering state ' + state.name);

    this.state = state;

    if (state.enter) {
      state.enter.call(this, oldState);
    }
  }

  /**
   * Look ahead to see if the given str matches the substring sequence
   * beyond
   */
  lookAheadFor(str: string, startPos?: number) {
    // Have we read enough chunks to read the string that we need?
    if (startPos == null) {
      startPos = this.pos + 1;
    }
    var len = str.length;
    var endPos = startPos + len;

    if (endPos > this.maxPos + 1) {
      return undefined;
    }

    var found = this.data.substring(startPos, endPos);
    return found === str ? str : undefined;
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
    this.pos -= offset;
  }

  skip(offset: number) {
    // console.log('-- ' + JSON.stringify(this.data.substring(this.pos, this.pos + offset)) + ' --  ' + 'SKIPPED'.gray);
    this.pos += offset;
  }

  end() {
    this.pos = this.maxPos + 1;
  }

  substring(pos: number, endPos?: number) {
    return this.data.substring(pos, endPos);
  }

  parse(data: string, filename: string) {
    if (data == null) {
      return;
    }

    // call the constructor function again because we have a contract that
    // it will fully reset the parser
    this.reset();

    if (Array.isArray(data)) {
      data = data.join("");
    }

    this.src = data; // This is the unmodified data used for reporting warnings
    this.filename = filename;
    this.data = data;
    this.maxPos = data.length - 1;

    // Enter initial state
    if (this.initialState) {
      this.enterState(this.initialState);
    }

    // Move to first position
    // Skip the byte order mark (BOM) sequence
    // at the beginning of the file if there is one:
    // - https://en.wikipedia.org/wiki/Byte_order_mark
    // > The Unicode Standard permits the BOM in UTF-8, but does not require or recommend its use.
    this.pos = data.charCodeAt(0) === 0xfeff ? 1 : 0;

    if (!this.state) {
      // Cannot resume when parser has no state
      return;
    }

    var pos;
    while ((pos = this.pos) <= this.maxPos) {
      let ch = data[pos];
      let code = ch.charCodeAt(0);
      let state = this.state;

      if (code === CODE.NEWLINE) {
        if (state.eol) {
          state.eol.call(this, ch);
        }
        this.pos++;
        continue;
      } else if (code === CODE.CARRIAGE_RETURN) {
        let nextPos = pos + 1;
        if (
          nextPos < data.length &&
          data.charCodeAt(nextPos) === CODE.NEWLINE
        ) {
          if (state.eol) {
            state.eol.call(this, "\r\n");
          }
          this.pos += 2;
          continue;
        }
      }

      // console.log('-- ' + JSON.stringify(ch) + ' --  ' + this.state.name.gray);

      // We assume that every state will have "char" function
      state.char.call(this, ch, code);

      // move to next position
      this.pos++;
    }

    let state = this.state;
    if (state && state.eof) {
      state.eof.call(this);
    }
  }
}
