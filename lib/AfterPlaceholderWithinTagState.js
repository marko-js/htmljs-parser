'use strict';

const {
    CODE_CLOSE_ANGLE_BRACKET,
    CODE_FORWARD_SLASH,
} = require('./constants');

const BaseState = require("./BaseState");

module.exports = class AfterPlaceholderWithinTagState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_AFTER_PLACEHOLDER_WITHIN_TAG');
    }
    eol() {
        this.parser.openTagEOL();
    }
    eof() {
        this.parser.openTagEOF();
    }
    char(ch, code) {
        var parser = this.parser;
        if (!parser.isConcise) {
            if (code === CODE_CLOSE_ANGLE_BRACKET) {
                parser.finishOpenTag();
                return;
            } else if (code === CODE_FORWARD_SLASH) {
                const nextCode = parser.lookAtCharCodeAhead(1);
                if (nextCode === CODE_CLOSE_ANGLE_BRACKET) {
                    parser.finishOpenTag(true /* self closed */);
                    parser.skip(1);
                    return;
                }
            }
        }

        if (parser.isWhitespaceCode(code)) {
            parser.enterWithinOpenTagState();
        } else {
            parser.notifyError(parser.pos,
                'UNEXPECTED_TEXT_AFTER_PLACEHOLDER_IN_TAG',
                `An unexpected "${ch}" character was found after a placeoholder within the open tag.`);
            return;
        }
    }
};
