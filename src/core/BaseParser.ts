"use strict";

import { Parser, CODE, peek } from "../internal";

export interface Part {
  pos: number;
  endPos: number;
  parentState: StateDefinition;
}

export interface ValuePart extends Part {
  value: string;
}

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

export class BaseParser {
  public pos!: number;
  public maxPos!: number;
  public data!: string;
  public src!: string;
  public filename!: string;
  public state!: StateDefinition;
  public initialState!: StateDefinition;
  public parts!: Part[]; // Used to keep track of parts such as CDATA, expressions, declarations, etc.
  public activePart!: Part; // The current part at the top of the part stack
  public forward!: boolean;

  constructor() {
    this.reset();
  }

  reset() {
    // current absolute character position
    this.pos = -1;

    // The maxPos property is the last absolute character position that is
    // readable based on the currently received chunks
    this.maxPos = -1;

    this.parts = [];
    this.forward = true;
  }

  setInitialState(initialState: StateDefinition) {
    this.initialState = initialState;
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
    state.enter?.call(this as any, activePart, parentState);
    return this.activePart;
  }

  exitState(includedEndChars?: string) {
    if (includedEndChars) {
      for (let i = 0; i < includedEndChars.length; i++) {
        if (this.src[this.pos + i] !== includedEndChars[i]) {
          if (this.pos + i >= this.maxPos) {
            (this as any as Parser).notifyError(
              this.activePart.pos,
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
      childState.exit.call(this as any, childPart);
    }

    if (parentState.return) {
      parentState.return.call(this as any, childState, childPart, parentPart);
    }

    this.forward = false;
  }

  checkForTerminator(terminator: string | string[], ch: string) {
    if (typeof terminator === "string") {
      if (ch === terminator) {
        return true;
      } else if (terminator.length > 1) {
        for (let i = 0; i < terminator.length; i++) {
          if (this.src[this.pos + i] !== terminator[i]) {
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
    // Have we read enough chunks to read the string that we need?
    const endPos = startPos + str.length;

    if (endPos > this.maxPos + 1 || str !== this.substring(startPos, endPos)) {
      return undefined;
    }

    return str;
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

    let pos: number;
    while ((pos = this.pos) <= this.maxPos) {
      const ch = data[pos];
      const code = ch && ch.charCodeAt(0);
      const state = this.state;
      let length = 1;

      if (code === CODE.NEWLINE) {
        state.eol?.call(this as any, ch, this.activePart);
      } else if (code === CODE.CARRIAGE_RETURN) {
        const nextPos = pos + 1;
        if (
          nextPos < data.length &&
          data.charCodeAt(nextPos) === CODE.NEWLINE
        ) {
          state.eol?.call(this as any, "\r\n", this.activePart);
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
        state.char.call(this as any, ch, code, this.activePart);
      } else {
        state.eof?.call(this as any, this.activePart);
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
