'use strict';

var CODE_NEWLINE = 10;
var CODE_CARRIAGE_RETURN = 13;

class Parser {
    static createState(mixins) {
        return mixins;
    }

    constructor(options) {
        this.options = options;
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

    enterDefaultState() {
        this.enterState(this.initialState);
    }

    enterState(state) {
        if (this.state === state) {
            // Re-entering the same state can lead to unexpected behavior
            // so we should throw error to catch these types of mistakes
            throw new Error('Re-entering the current state is illegal - ' + state.name);
        }

        var oldState;
        if ((oldState = this.state) && oldState.leave) {
            // console.log('Leaving state ' + oldState.name);
            oldState.leave.call(this, state);
        }

        // console.log('Entering state ' + state.name);

        this.state = state;

        if (state.enter) {
            state.enter(oldState);
        }
    }

    /**
     * Look ahead to see if the given str matches the substring sequence
     * beyond
     */
    lookAheadFor(str, startPos) {
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
        return (found === str) ? str : undefined;
    }

    /**
     * Look ahead to a character at a specific offset.
     * The callback will be invoked with the character
     * at the given position.
     */
    lookAtCharAhead(offset, startPos) {
        if (startPos == null) {
            startPos = this.pos;
        }
        return this.data.charAt(startPos + offset);
    }

    lookAtCharCodeAhead(offset, startPos) {
        if (startPos == null) {
            startPos = this.pos;
        }
        return this.data.charCodeAt(startPos + offset);
    }

    rewind(offset) {
        this.pos -= offset;
    }

    skip(offset) {
        // console.log('-- ' + JSON.stringify(this.data.substring(this.pos, this.pos + offset)) + ' --  ' + 'SKIPPED'.gray);
        this.pos += offset;
    }

    end() {
        this.pos = this.maxPos + 1;
    }

    substring(pos, endPos) {
        return this.data.substring(pos, endPos);
    }

    parse(data, filename) {
        if (data == null) {
            return;
        }

        // call the constructor function again because we have a contract that
        // it will fully reset the parser
        this.reset();

        if (Array.isArray(data)) {
            data = data.join('');
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
        this.pos = data.charCodeAt(0) === 0xFEFF ? 1 : 0;

        if (!this.state) {
            // Cannot resume when parser has no state
            return;
        }

        var pos;
        while ((pos = this.pos) <= this.maxPos) {
            const ch = data[pos];
            const code = ch.charCodeAt(0);
            const state = this.state;

            if (code === CODE_NEWLINE) {
                if (state.eol) {
                    state.eol(ch);
                }
                this.pos++;
                continue;
            } else if (code === CODE_CARRIAGE_RETURN) {
                const nextPos = pos + 1;
                if (nextPos < data.length && data.charCodeAt(nextPos) === CODE_NEWLINE) {
                    if (state) {
                        state.eol('\r\n');
                    }
                    this.pos+=2;
                    continue;
                }
            }

            // console.log('-- ' + JSON.stringify(ch) + ' --  ' + this.state.name.gray);

            // We assume that every state will have "char" function
            state.char(ch, code);

            // move to next position
            this.pos++;
        }

        const state = this.state;
        if (state) {
            state.eof();
        }
    }
    isWhitespaceCode(code) {
        return (code <= 32);
    }
    consumeWhitespace() {
        var ahead = 1;
        var whitespace = '';
        while (this.isWhitespaceCode(this.lookAtCharCodeAhead(ahead))) {
            whitespace += this.lookAtCharAhead(ahead++);
        }
        this.skip(whitespace.length);
        return whitespace;
    }
}

module.exports = Parser;
