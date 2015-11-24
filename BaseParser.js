'use strict';

var CODE_NEWLINE = 10;

class Parser {
    static createState(mixins) {
        return mixins;
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
        this.data = null;

        // The 1-based line number
        this.lineNumber = 1;
    }

    setInitialState(initialState) {
        this.initialState = initialState;
    }

    enterState(state) {
        if (this.state === state) {
            // Re-entering the same state can lead to unexpected behavior
            // so we should throw error to catch these types of mistakes
            throw new Error('Re-entering the current state is illegal');
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
    lookAheadFor(str, callback) {
        // Have we read enough chunks to read the string that we need?
        var startPos = this.pos + 1; // Move past the current character
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
    lookAtCharAhead(offset, callback) {
        return this.data.charAt(this.pos + offset);
    }

    lookAtCharCodeAhead(offset, callback) {
        return this.data.charCodeAt(this.pos + offset);
    }

    skip(offset) {
        // console.log('-- ' + JSON.stringify(this.data.substring(this.pos, this.pos + offset)) + ' --  ' + 'SKIPPED'.gray);
        var i = this.pos;
        this.pos += offset;

        for (; i < this.pos; i++) {
            if (this.data.charCodeAt(this.pos) === CODE_NEWLINE) {
                this.lineNumber++;
            }
        }
    }

    parse(data) {
        if (data == null) {
            return;
        }

        // call the constructor function again because we have a contract that
        // it will fully reset the parser
        this.reset();

        if (Array.isArray(data)) {
            data = data.join('');
        }

        this.data = data;
        this.maxPos = data.length - 1;

        // Enter initial state
        if (this.initialState) {
            this.enterState(this.initialState);
        }

        // Move to first position
        this.pos = 0;

        if (!this.state) {
            // Cannot resume when parser has no state
            return;
        }

        var pos;
        while ((pos = this.pos) <= this.maxPos) {
            var ch = data[pos];
            var code = ch.charCodeAt(0);

            if (code === CODE_NEWLINE) {
                this.lineNumber++;
            }

            // console.log('-- ' + JSON.stringify(ch) + ' --  ' + this.state.name.gray);

            // We assume that every state will have "char" function
            this.state.char.call(this, ch, code);

            // move to next position
            this.pos++;
        }

        var state;
        if ((state = this.state) && state.eof) {
            state.eof.call(this);
        }
    }
}

module.exports = Parser;
