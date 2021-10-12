"use strict";

import { Parser, CODE, peek } from "../internal";
export type StateDefinition = {
  name: string;
  eol?: (this: Parser, str?: string, activePart?: any) => void;
  eof?: (this: Parser, activePart?: any) => void;
  enter?: (
    this: Parser,
    parentState?: StateDefinition,
    activePart?: any
  ) => unknown;
  exit?: (this: Parser, activePart?: any) => unknown;
  return?: (
    this: Parser,
    childState?: StateDefinition,
    childPart?: any,
    activePart?: any
  ) => unknown;
  char?: (this: Parser, char: string, code: number, activePart?: any) => void;
};

export class BaseParser {
  public pos: number;
  public maxPos: number;
  public data: string;
  public src: string;
  public filename: string;
  public state: StateDefinition;
  public initialState: StateDefinition;
  public parts: any[]; // Used to keep track of parts such as CDATA, expressions, declarations, etc.
  public activePart: any; // The current part at the top of the part stack
  public forward: boolean;

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

    this.parts = [];
    this.activePart = undefined;
    this.forward = true;
  }

  setInitialState(initialState) {
    this.initialState = initialState;
  }

  enterState(state: StateDefinition, part = {}) {
    // if (this.state === state) {
    //   // Re-entering the same state can lead to unexpected behavior
    //   // so we should throw error to catch these types of mistakes
    //   throw new Error(
    //     "Re-entering the current state is illegal - " + state.name
    //   );
    // }

    var parentState = this.state;
    var activePart = (this.activePart = Object.assign(part, {
      pos: this.pos,
      parentState: parentState,
    }));

    this.state = state;
    this.parts.push(activePart);

    if (state.enter) {
      state.enter.call(this, parentState, activePart);
    }

    return this.activePart;
  }

  enterStateIfNotParent(state: StateDefinition, part = {}) {
    if (this.activePart.parentState !== state) {
      return this.enterState(state, part);
    }
  }

  exitState(includedEndChars?: string) {
    if (includedEndChars) {
      for (let i = 0; i < includedEndChars.length; i++) {
        if (this.src[this.pos+i] !== includedEndChars[i]) {
          if (this.pos+i >= this.maxPos) {
            (this as any as Parser).notifyError(
              this.activePart.pos,
              "UNEXPECTED_EOF",
              "EOF reached with current part incomplete"
            );
          } else {
            throw new Error(
              "Unexpected end character at position " + (this.pos+i)
            );
          }
        }
      }
      this.skip(includedEndChars.length);
    }

    const childPart = this.parts.pop();
    const childState = this.state;
    const parentState = (this.state = childPart.parentState);
    const parentPart = (this.activePart = this.parts.length
      ? peek(this.parts)
      : undefined);

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
        for (var i = 0; i < terminator.length; i++) {
          if (this.src[this.pos+i] !== terminator[i]) {
            return false;
          }
        }
        return true;
      }
    } else {
      for (var i = 0; i < terminator.length; i++) {
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
    this.maxPos = data.length;

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
      let code = ch && ch.charCodeAt(0);
      let state = this.state;
      let length = 1;

      if (code === CODE.NEWLINE) {
        if (state.eol) {
          state.eol.call(this, ch, this.activePart);
        }
      } else if (code === CODE.CARRIAGE_RETURN) {
        let nextPos = pos + 1;
        if (
          nextPos < data.length &&
          data.charCodeAt(nextPos) === CODE.NEWLINE
        ) {
          if (state.eol) {
            state.eol.call(this, "\r\n", this.activePart);
          }
          length = 2;
        }
      } else if (code) {
        // We assume that every state will have "char" function
        if (!state.char) {
          throw new Error(
            `State ${state.name} has no "char" function (${JSON.stringify(
              ch
            )}, ${code})`
          );
        }
        state.char.call(this, ch, code, this.activePart);
      } else {
        if (state.eof) {
          state.eof.call(this, this.activePart);
        }
      }

      // move to next position
      if (this.forward) {
        this.pos += length;
      } else {
        this.forward = true;
      }
    }    
  }
}
