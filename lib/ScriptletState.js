'use strict';

const {
    CODE_ASTERISK,
    CODE_BACK_SLASH,
    CODE_CLOSE_ANGLE_BRACKET,
    CODE_DOUBLE_QUOTE,
    CODE_FORWARD_SLASH,
    CODE_PERCENT,
    CODE_SINGLE_QUOTE,
} = require('./constants');

const BaseState = require("./BaseState");

// We enter STATE_SCRIPTLET after we encounter a "<%" while in STATE_HTML_CONTENT.
// We leave STATE_SCRIPTLET if we see a "%>".
module.exports = class ScriptletState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_SCRIPTLET');
    }
    eol(str) {
        this.parser.currentPart.value += str;
    }
    eof() {
        this.parser.notifyError(this.parser.currentPart.pos,
            'MALFORMED_SCRIPTLET',
            'EOF reached while parsing scriptlet');
    }
    comment(comment) {
        this.parser.currentPart.value += comment.rawValue;
    }
    char(ch, code) {
        var parser = this.parser;
        if (parser.currentPart.quoteCharCode) {
            parser.currentPart.value += ch;

            // We are within a string... only look for ending string code
            if (code === CODE_BACK_SLASH) {
                // Handle string escape sequence
                parser.currentPart.value += parser.lookAtCharAhead(1);
                parser.skip(1);
            } else if (code === parser.currentPart.quoteCharCode) {
                parser.currentPart.quoteCharCode = null;
            }
            return;
        } else if (code === CODE_FORWARD_SLASH) {
            if (parser.lookAtCharCodeAhead(1) === CODE_ASTERISK) {
                // Skip over code inside a JavaScript block comment
                parser.beginBlockComment();
                parser.skip(1);
                return;
            }
        } else if (code === CODE_SINGLE_QUOTE || code === CODE_DOUBLE_QUOTE) {
            parser.currentPart.quoteCharCode = code;
        } else if (code === CODE_PERCENT) {
            if (parser.lookAtCharCodeAhead(1) === CODE_CLOSE_ANGLE_BRACKET) {
                parser.endScriptlet(parser.pos + 2 /* end pos */);
                parser.skip(1); // Skip over the closing right angle bracket
                return;
            }
        }

        parser.currentPart.value += ch;
    }
};
