// A stub function that does not do anything
var NOOP = function() {};

function State() {

}

State.prototype = {
    // called when entering state
    enter: NOOP,

    // called when leaving state
    leave: NOOP,

    // called while processing single character in this state
    char: NOOP,

    // called if EOF reach while in this state
    eof: NOOP
};

function _extend(dest, src) {
    for (var key in src) {
        if (src.hasOwnProperty(key)) {
            dest[key] = src[key];
        }
    }
}

// Some of the property resets are redundant with what is in the constructor
// but this is just an optimization because the JavaScript engine can optimize
// the class instance when all of the the instance properties are set
// in the constructor.
function _reset(parser) {
    parser.pos = -1;
    parser.maxPos = -1;
    parser.curChunkIndex = -1;
    parser.curChunkStartPos = -1;
    parser.curChunk = undefined;
    parser.chunks = [];
    parser.waitFor = null;
    parser.ended = false;
    parser.state = null;
}

function _waitFor(parser, waitFor) {
    if (parser.waitFor) {
        throw new Error('Illegal look-ahead while there is already a pending look-ahead');
    }

    parser.waitFor = waitFor;
}

function Parser(options) {
    // current absolute character position
    this.pos = -1;

    // The maxPos property is the last absolute character position that is
    // readable based on the currently received chunks
    this.maxPos = -1;

    // The current chunk index
    this.curChunkIndex = -1;

    // The absolute position of the first character in the current chunk
    this.curChunkStartPos = -1;

    // The current chunk (a String) that we are on (if any).
    // If we haven't started processing any chunks then curChunk
    // will be undefined.
    // If we processed all of the chunks then value will be null
    this.curChunk = undefined;

    // all of the chunks (chunks that have been processed can be nulled-out)
    this.chunks = [];

    // Parsing will be paused if we are waiting for a character that
    // is beyond the currently received chunks.
    // If were waiting on data then "waitFor" will be an object with the
    // following properties:
    // - pos: The absolute position that needs to become available
    // - str: OPTIONAL - The string that we are looking for
    // - cb: The callback to invoke when all data is available
    this.waitFor = null;

    // Have all chunks been received?
    // This is set to true when end() is called
    this.ended = false;

    // the current parser state
    // NOTE: The code using the parser is responsible for calling
    // enterState(state) to provide the initial state.
    this.state = null;
}

Parser.createState = function(mixins) {
    var state = new State();
    _extend(state, mixins);
    return state;
};

// _readStrAhead will be called if we're looking ahead for a particular
// string AND we have already read in enough chunks.
// It is an error to call this function when there are not enough chunks
// available to satisfy looking ahead for the given length
function _readStrAhead(parser, lookingFor) {
    var length = lookingFor.length;
    var chunk = parser.curChunk;
    var chunkIndex = parser.curChunkIndex;
    var chunkStartPos = parser.curChunkStartPos;

    // Find relative start position within current chunk.
    // Since we're looking ahead we need to start from the position
    // that is one beyond our current position.
    var start = parser.pos - chunkStartPos;

    var str = '';

    var keepReading;

    do {
        // find relative end position within current chunk
        var end = start + length;

        // Do we need characters beyond the current chunk?
        keepReading = (end > chunk.length);
        if (keepReading) {
            // the relative end position is beyond the current chunk
            // so we need to keep reading into the next chunk

            // Pull back the end position to the current chunk length
            end = chunk.length;

            // Add substring from this chunk to the final string
            str += chunk.substring(start, end);

            // Reduce length by the amount that we were able to read so far
            length -= (end - start);

            // move to the next chunk...
            chunkIndex++;
            chunkStartPos = chunkStartPos + end;
            start = 0;

            chunk = parser.chunks[chunkIndex];
        } else {
            str += chunk.substring(start, end);
        }
    } while (keepReading);

    // console.log('Read ahead and found: ' + JSON.stringify(str));

    return (str === lookingFor) ? str : undefined;
}

function _checkEOF(parser) {
    if (parser.ended && (parser.pos > parser.maxPos)) {
        if (parser.state) {
            // console.log('EOF while in state ' + parser.state.name);
            parser.state.eof();
            // console.log('EOF');
        }

        // return to initial state in case someone tries to reuse parser
        _reset(parser);
    }

}
Parser.prototype = {
    setInitialState: function(initialState) {
        this.initialState = initialState;
    },

    end: function() {
        this.ended = true;

        var waitFor;
        if ((waitFor = this.waitFor)) {
            this.waitFor = null;

            // we were waiting for someting but the stream ended
            // before that request was satisfied
            waitFor.cb();

            // now that we handled the look-ahead, we need to resume
            // processing...
            this.resume();
        } else {
            _checkEOF(this);
        }
    },

    enterState: function(state) {
        if (this.state === state) {
            // Re-entering the same state can lead to unexpected behavior
            // so we should throw error to catch these types of mistakes
            throw new Error('Re-entering the current state is illegal');
        }

        if (this.state) {
            // console.log('Leaving state ' + this.state.name);
            this.state.leave(state);
        }

        this.state = state;

        // console.log('Entering state ' + state.name);

        state.enter();
    },

    /**
     * Look ahead to see if the given str matches the substring sequence
     * beyond
     */
    lookAheadFor: function(str, callback) {
        // console.log('looking ahead for "' + str + '"');

        // Have we read enough chunks to read the string that we need?
        var needPos = this.pos + str.length - 1;
        if (needPos > this.maxPos) {
            if (this.ended) {
                // console.log('we do not have enough chunks and stream has ended');

                // we've received everything so let the callback know
                // that we weren't able to satisfy their look-ahead...
                callback();
            } else {
                // console.log('we do not have enough chunks but will wait', this.waitFor);

                // Don't have enough characters so need to wait until
                // we receive more chunks...
                _waitFor(this, {
                    pos: needPos,
                    str: str,
                    cb: callback
                });
            }
        } else if (_readStrAhead(this, str)) {
            // console.log('read ahead and found ' + str);

            // found
            callback(str);
        } else {
            // console.log('read ahead and did not find ' + str);

            // not found
            callback();
        }
    },

    /**
     * Look ahead to a character at a specific offset.
     * The callback will be invoked with the character
     * at the given position.
     */
    lookAtCharAhead: function(offset, callback) {
        // Since we increment this.pos immediately after a read, the
        // look-ahead offset needs to be decremented by 1
        var needPos = this.pos + offset - 1;
        if (needPos > this.maxPos) {
            if (this.ended) {
                // we've received everything so let the callback know
                // that we weren't able to satisfy their look-ahead...
                callback();
            } else {
                _waitFor(this, {
                    pos: needPos,
                    cb: callback
                });
            }
        } else {
            var chunkIndex = this.curChunkIndex;
            var chunk = this.curChunk;
            var chunkStartPos = this.curChunkStartPos;

            // Calculate the absolute position of the character
            // that we are trying to read...

            // Calculate offset relative to current chunk and
            // move to the next chunk if it is not in range


            while ((offset = needPos - chunkStartPos) >= chunk.length) {
                chunkIndex++;
                chunkStartPos += chunk.length;
                chunk = this.chunks[chunkIndex];
            }

            callback(chunk[offset]);
        }
    },

    // Resume should be called after a new chunk is added
    // and when there are no pending look-aheads
    resume: function() {
        if (!this.state) {
            // Cannot resume when parser has no state
            return;
        }

        var chunk = this.curChunk;

        while (!this.waitFor && (this.pos <= this.maxPos)) {
            // save off our current position (before we increment it)
            var pos = this.pos;

            // move to next position
            this.pos++;

            // calculate the offset within the current chunk
            var offset = pos - this.curChunkStartPos;

            // if the offset is outside the range of the current chunk
            // then move ahead to the next chunk. If multiple characters
            // were skipped then it's possible that we might need to skip
            // chunks.
            while (offset >= chunk.length) {
                if ((chunk = this.nextChunk()) === null) {
                    // technically this shouldn't happen
                    throw new Error('Unexpectedly reached end of input');
                }

                // recalculate the offset
                offset = pos - this.curChunkStartPos;
            }

            var ch = chunk[offset];

            // console.log('-- ' + JSON.stringify(ch) + ' --  ' + this.state.name.gray);

            this.state.char(ch);

            // If the handling of the character caused the parser to be
            // paused (to wait for a character) then stop processing characters
            // until new chunks are added to satisfy the look ahead.
            // Also, processing characters if we reached the end of the data.
        }

        // In some cases resume() might be called after the end() was called
        _checkEOF(this);
    },

    skip: function(offset) {
        this.pos += offset;
    },

    nextChunk: function() {
        var numChunks = this.chunks.length;
        if (this.curChunkIndex >= numChunks - 1) {
            // reached last chunk...
            this.curChunkIndex = numChunks;
            return (this.curChunk = null);
        }

        this.curChunkIndex++;

        if (this.curChunk) {
            // Make sure we keep track of where this new chunk starts
            // (its absolute start position)
            this.curChunkStartPos = this.curChunkStartPos + this.curChunk.length;

            // null out the previous chunk since we are done with it
            this.chunks[this.curChunkIndex - 1] = null;
        } else {
            // There is no chunk before this chunk so its start position is 0
            this.curChunkStartPos = 0;
        }

        // update the curChunk property and return the new chunk
        return (this.curChunk = this.chunks[this.curChunkIndex]);
    },

    addChunk: function(chunk) {
        this.chunks.push(chunk);
        this.maxPos += chunk.length;

        // Since we're adding a new chunk, see if it satisfies a look-ahead
        // condition if one exists...
        var waitFor;
        if ((waitFor = this.waitFor)) {
            // Do we have enough chunks available to satisfy pending look-ahead?
            if (waitFor.pos <= this.maxPos) {
                // clear the waitFor since we satisfied it
                this.waitFor = null;

                // We have all of the chunks that we need to satisfy
                // the pending look ahead...
                if (waitFor.str) {
                    // there is a look ahead for a string
                    if (_readStrAhead(this, waitFor.str)) {
                        waitFor.cb(waitFor.str);
                    } else {
                        waitFor.cb();
                    }
                } else {
                    // there is a look ahead for a specific character at given position
                    var chunkStartPos = this.maxPos - chunk.length + 1;
                    var offset = waitFor.pos - chunkStartPos;
                    waitFor.cb(chunk[offset]);
                }
            }
        }
    },

    write: function(chunk) {
        // Add the chunk...
        this.addChunk(chunk);

        if (!this.curChunk) {
            if (this.initialState) {
                this.enterState(this.initialState);
            }
            this.nextChunk();
            this.pos = 0;
        }

        // Process the available chunks
        this.resume();
    },

    parse: function(data) {
        // console.log('-----------------');

        _reset(this);

        if (data == null) {
            return;
        }

        if (Array.isArray(data)) {
            this.chunks = data;

            // calculate max character position
            for (var i = 0; i < data.length; i++) {
                this.maxPos += data[i].length;
            }
        } else {
            // data is a single chunk
            this.chunks = [data.toString()];
            this.maxPos = data.length - 1;
        }

        // Enter initial state
        if (this.initialState) {
            this.enterState(this.initialState);
        }

        // Move to first chunk
        this.nextChunk();

        // Move to first position
        this.pos = 0;

        // Go ahead and set flag to indicate that all chunks have been received.
        // This is a little bit of an optimization because it will prevent
        // waitFor objects from being created in cases when we are looking ahead
        // because the parser will know that it has already received all of the
        // chunks to be parsed.
        this.end();

        // start processing data
        this.resume();
    }
};

module.exports = Parser;
