'use strict';

var {
    CODE_CLOSE_ANGLE_BRACKET,
} = require('../constants');

const BaseState = require("./BaseState");
const HtmlContentState = require('./HtmlContentState');

module.exports = class CloseTagState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_CLOSE_TAG');
    }
    eol() {
        this.parser.openTagEOL();
    }
    eof() {
        this.parser.notifyError(this.closeTagPos,
            'MALFORMED_CLOSE_TAG',
            'EOF reached while parsing closing tag');
    }
    enter() {
        this.parser.closeTagName = '';
    }
    char(ch, code) {
        const parser = this.parser;
        if (code === CODE_CLOSE_ANGLE_BRACKET) {
            if (parser.closeTagName.length > 0) {
                parser.closeTag(parser.closeTagName, parser.closeTagPos, parser.pos + 1);
            } else {
                parser.closeTag(parser.expectedCloseTagName, parser.closeTagPos, parser.pos + 1);
            }

            parser.enterState(HtmlContentState);
        } else {
            parser.closeTagName += ch;
        }
    }
};
