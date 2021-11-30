'use strict';

const {
    CODE_HYPHEN,
} = require('./constants');

const BaseState = require("./BaseState");

// We enter STATE_HTML_COMMENT after we encounter a "<--"
// while in the STATE_HTML_CONTENT.
// We leave STATE_HTML_COMMENT when we see a "-->".
module.exports = class HtmlCommentState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_HTML_COMMENT');
    }
    eol(newLineChars) {
        this.parser.currentPart.value += newLineChars;
    }
    eof() {
        this.parser.notifyError(this.parser.currentPart.pos,
            'MALFORMED_COMMENT',
            'EOF reached while parsing comment');
    }
    char(ch, code) {
        var parser = this.parser;
        if (code === CODE_HYPHEN) {
            var match = parser.lookAheadFor('->');
            if (match) {
                parser.currentPart.endPos = parser.pos + 3;
                parser.endHtmlComment();
                parser.skip(match.length);
            } else {
                parser.currentPart.value += ch;
            }
        } else {
            parser.currentPart.value += ch;
        }
    }
};
