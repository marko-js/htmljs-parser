'use strict';

const {
    CODE_CLOSE_ANGLE_BRACKET,
    CODE_QUESTION,
} = require('../constants');

const BaseState = require("./BaseState");

// We enter STATE_DECLARATION after we encounter a "<?"
// while in the STATE_HTML_CONTENT.
// We leave STATE_DECLARATION if we see a "?>" or ">".
module.exports = class DeclarationState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_DECLARATION');
    }
    eol(str) {
        this.parser.currentPart.value += str;
    }
    eof() {
        this.parser.notifyError(this.parser.currentPart.pos,
            'MALFORMED_DECLARATION',
            'EOF reached while parsing declaration');
    }
    char(ch, code) {
        var parser = this.parser;
        if (code === CODE_QUESTION) {
            var nextCode = parser.lookAtCharCodeAhead(1);
            if (nextCode === CODE_CLOSE_ANGLE_BRACKET) {
                parser.currentPart.endPos = parser.pos + 2;
                parser.endDeclaration();
                parser.skip(1);
            }
        } else if (code === CODE_CLOSE_ANGLE_BRACKET) {
            parser.currentPart.endPos = parser.pos + 1;
            parser.endDeclaration();
        } else {
            parser.currentPart.value += ch;
        }
    }
};
