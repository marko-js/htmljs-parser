'use strict';

const {
    CODE_OPEN_ANGLE_BRACKET,
} = require('../constants');

const BaseState = require("./BaseState");

// We enter STATE_JS_COMMENT_LINE after we encounter a "//" sequence
// when parsing JavaScript code.
// We leave STATE_JS_COMMENT_LINE when we see a newline character.
module.exports = class JsCommentLineState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_JS_COMMENT_LINE');
    }
    eol(str) {
        var parser = this.parser;
        parser.rewind(str.length);
        parser.currentPart.endPos = parser.pos;
        parser.endJavaScriptComment();
    }
    eof() {
        var parser = this.parser;
        parser.currentPart.endPos = parser.pos;
        parser.endJavaScriptComment();
    }
    char(ch, code) {
        var parser = this.parser;
        if (parser.currentPart.parentState.name === 'STATE_PARSED_TEXT_CONTENT') {
            if (!parser.isConcise && code === CODE_OPEN_ANGLE_BRACKET) {
                // First, see if we need to see if we reached the closing tag
                // and then check if we encountered CDATA
                if (parser.checkForClosingTag()) {
                    return;
                }
            }
        }

        parser.currentPart.value += ch;
    }
};
