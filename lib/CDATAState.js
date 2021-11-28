'use strict';

const {
    CODE_CLOSE_SQUARE_BRACKET,
} = require('../constants');

const BaseState = require("./BaseState");

// We enter STATE_CDATA after we see "<![CDATA["
module.exports = class CDATAState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_CDATA');
    }
    enter() {
        this.parser.textParseMode = 'cdata';
    }
    eof() {
        this.parser.notifyError(this.parser.currentPart.pos,
            'MALFORMED_CDATA',
            'EOF reached while parsing CDATA');
    }
    char(ch, code) {
        const parser = this.parser;
        if (code === CODE_CLOSE_SQUARE_BRACKET) {
            var match = parser.lookAheadFor(']>');
            if (match) {
                parser.endCDATA();
                parser.skip(match.length);
                return;
            }
        }

        parser.currentPart.value += ch;
    }
};
