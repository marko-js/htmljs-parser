'use strict';

const {
    CODE_ASTERISK,
    CODE_BACK_SLASH,
    CODE_BACKTICK,
    CODE_CLOSE_CURLY_BRACE,
    CODE_CLOSE_PAREN,
    CODE_CLOSE_SQUARE_BRACKET,
    CODE_DOUBLE_QUOTE,
    CODE_FORWARD_SLASH,
    CODE_OPEN_CURLY_BRACE,
    CODE_OPEN_PAREN,
    CODE_OPEN_SQUARE_BRACKET,
    CODE_SINGLE_QUOTE,
} = require('../constants');

const BaseState = require("./BaseState");

// We enter STATE_SCRIPTLET after we encounter a "<%" while in STATE_HTML_CONTENT.
// We leave STATE_SCRIPTLET if we see a "%>".
module.exports = class InlineScriptState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_INLINE_SCRIPT');
    }
    eol(str) {
        var parser = this.parser;
        if (parser.currentPart.endMatch || parser.currentPart.stringType === CODE_BACKTICK) {
            parser.currentPart.value += str;
        } else {
            parser.rewind(str.length);
            parser.endInlineScript(parser.pos);
        }
    }
    eof() {
        var parser = this.parser;
        if (parser.currentPart.endMatch || parser.currentPart.stringType) {
            parser.notifyError(parser.currentPart.pos,
                'MALFORMED_SCRIPTLET',
                'EOF reached while parsing scriptet');
        } else {
            parser.endInlineScript(parser.pos);
        }
    }
    comment(comment) {
        this.parser.currentPart.value += comment.rawValue;
    }
    char(ch, code) {
        var parser = this.parser;
        if (code === CODE_BACK_SLASH) {
            parser.currentPart.value += ch + parser.lookAtCharAhead(1);
            parser.skip(1);
            return;
        }

        if (parser.currentPart.stringType) {
            if (code === parser.currentPart.stringType) {
                parser.currentPart.stringType = null;
            }

            parser.currentPart.value += ch;
            return;
        }

        if (code === CODE_FORWARD_SLASH) {
            // Check next character to see if we are in a comment
            var nextCode = parser.lookAtCharCodeAhead(1);
            if (nextCode === CODE_FORWARD_SLASH) {
                parser.beginLineComment();
                parser.skip(1);
                return;
            } else if (nextCode === CODE_ASTERISK) {
                parser.beginBlockComment();
                parser.skip(1);
                return;
            }
        }

        parser.currentPart.value += ch;

        if (code === parser.currentPart.endMatch) {
            parser.currentPart.endMatch = parser.currentPart.endMatches.pop();
            return;
        }

        if (code === CODE_SINGLE_QUOTE || code === CODE_DOUBLE_QUOTE || code === CODE_BACKTICK) {
            parser.currentPart.stringType = code;
            return;
        }

        var nextMatch = null;

        if (code === CODE_OPEN_PAREN) {
            nextMatch = CODE_CLOSE_PAREN;
        } else if (code === CODE_OPEN_CURLY_BRACE) {
            nextMatch = CODE_CLOSE_CURLY_BRACE;
        } else if (code === CODE_OPEN_SQUARE_BRACKET) {
            nextMatch = CODE_CLOSE_SQUARE_BRACKET;
        }

        if (nextMatch) {
            if (parser.currentPart.endMatch) {
                parser.currentPart.endMatches.push(parser.currentPart.endMatch);
            }
            parser.currentPart.endMatch = nextMatch;
        }
    }
};
