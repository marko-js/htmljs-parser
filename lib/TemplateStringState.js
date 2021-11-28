'use strict';

const {
    CODE_DOLLAR,
    CODE_OPEN_CURLY_BRACE,
    CODE_BACK_SLASH,
    CODE_BACKTICK,
} = require('../constants');

const BaseState = require("./BaseState");

// We enter STATE_CDATA after we see "<![CDATA["
module.exports = class TemplateStringState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_TEMPLATE_STRING');
    }
    placeholder(arg) {
        this.parser.currentPart.value += '${' + arg.value + '}';
    }
    eol(str) {
        this.parser.currentPart.value += str;
    }
    eof() {
        this.parser.notifyError(this.parser.pos,
            'INVALID_TEMPLATE_STRING',
            'EOF reached while parsing template string expression');
    }
    char(ch, code) {
        const parser = this.parser;
        let nextCh;
        if (code === CODE_DOLLAR && parser.lookAtCharCodeAhead(1) === CODE_OPEN_CURLY_BRACE) {
            parser.beginPlaceholder(false);
        } else {
            parser.currentPart.value += ch;
            if (code === CODE_BACK_SLASH) {
                // Handle string escape sequence
                nextCh = parser.lookAtCharAhead(1);
                parser.skip(1);

                parser.currentPart.value += nextCh;
            } else if (code === CODE_BACKTICK) {
                parser.endTemplateString();
            }
        }
    }
};
