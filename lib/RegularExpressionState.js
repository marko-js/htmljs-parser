'use strict';

const {
    CODE_BACK_SLASH,
    CODE_OPEN_SQUARE_BRACKET,
    CODE_CLOSE_SQUARE_BRACKET,
    CODE_FORWARD_SLASH,
} = require('./constants');

const BaseState = require("./BaseState");

module.exports = class RegularExpressionState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_REGULAR_EXPRESSION');
    }
    eol() {
        this.parser.notifyError(this.parser.pos,
            'INVALID_REGULAR_EXPRESSION',
            'EOL reached while parsing regular expression');
    }
    eof() {
        this.parser.notifyError(this.parser.pos,
            'INVALID_REGULAR_EXPRESSION',
            'EOF reached while parsing regular expression');
    }
    char(ch, code) {
        var parser = this.parser;
        var nextCh;
        parser.currentPart.value += ch;
        if (code === CODE_BACK_SLASH) {
            // Handle escape sequence
            nextCh = parser.lookAtCharAhead(1);
            parser.skip(1);
            parser.currentPart.value += nextCh;
        } else if (code === CODE_OPEN_SQUARE_BRACKET && parser.currentPart.inCharacterSet) {
            parser.currentPart.inCharacterSet = true;
        } else if (code === CODE_CLOSE_SQUARE_BRACKET && parser.currentPart.inCharacterSet) {
            parser.currentPart.inCharacterSet = false;
        } else if (code === CODE_FORWARD_SLASH && !parser.currentPart.inCharacterSet) {
            parser.endRegularExpression();
        }
    }
};
