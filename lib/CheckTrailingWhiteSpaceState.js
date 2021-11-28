'use strict';

const BaseState = require("./BaseState");

// In STATE_HTML_CONTENT we are looking for tags and placeholders but
// everything in between is treated as text.
module.exports = class CheckTrailingWhitespaceState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_CHECK_TRAILING_WHITESPACE');
    }
    eol() {
        this.endCheckTrailingWhitespace(null /* no error */, false /* not EOF */);
    }
    eof() {
        this.endCheckTrailingWhitespace(null /* no error */, true /* EOF */);
        this.parser.htmlEOF();
    }
    char(ch, code) {
        if (this.parser.isWhitespaceCode(code)) {
            // Just whitespace... we are still good
        } else {
            this.endCheckTrailingWhitespace({
                ch
            });
        }
    }
    endCheckTrailingWhitespace(err, eof) {
        var part = this.parser.endPart();
        part.handler(err, eof);
    }
};

