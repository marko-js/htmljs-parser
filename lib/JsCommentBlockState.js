'use strict';

const {
    CODE_ASTERISK,
    CODE_FORWARD_SLASH,
} = require('./constants');

const BaseState = require("./BaseState");

// We enter STATE_JS_COMMENT_BLOCK after we encounter a "/*" sequence
// while in STATE_ATTRIBUTE_VALUE or STATE_DELIMITED_EXPRESSION.
// We leave STATE_JS_COMMENT_BLOCK when we see a "*/" sequence.
module.exports = class JsCommentBlockState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_JS_COMMENT_BLOCK');
    }
    eol(str) {
        this.parser.currentPart.value += str;
    }
    eof() {
        this.parser.notifyError(this.parser.currentPart.pos,
            'MALFORMED_COMMENT',
            'EOF reached while parsing multi-line JavaScript comment');
    }
    char(ch, code) {
        var parser = this.parser;
        if (code === CODE_ASTERISK) {
            var nextCode = parser.lookAtCharCodeAhead(1);
            if (nextCode === CODE_FORWARD_SLASH) {
                parser.currentPart.endPos = parser.pos + 2;
                parser.endJavaScriptComment();
                parser.skip(1);
                return;
            }
        }

        parser.currentPart.value += ch;
    }
};
