'use strict';

var {
    CODE_CLOSE_ANGLE_BRACKET,
} = require('./constants');

const BaseState = require("./BaseState");

// We enter STATE_DTD after we encounter a "<!" while in the STATE_HTML_CONTENT.
// We leave STATE_DTD if we see a ">".
module.exports = class DTDState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_DTD');
    }
    eol(str) {
        this.parser.currentPart.value += str;
    }
    eof() {
        this.parser.notifyError(this.parser.currentPart.pos,
            'MALFORMED_DOCUMENT_TYPE',
            'EOF reached while parsing document type');
    }
    char(ch, code) {
        var parser = this.parser;
        if (code === CODE_CLOSE_ANGLE_BRACKET) {
            parser.currentPart.endPos = parser.pos + 1;
            parser.endDocumentType();
        } else {
            parser.currentPart.value += ch;
        }
    }
};
