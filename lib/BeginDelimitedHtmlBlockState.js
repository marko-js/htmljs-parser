'use strict';

const {
    CODE_HTML_BLOCK_DELIMITER,
} = require('./constants');

const BaseState = require("./BaseState");

// In STATE_BEGIN_DELIMITED_HTML_BLOCK we have already found two consecutive hyphens. We expect
// to reach the end of the line with only whitespace characters
module.exports = class BeginDelimitedHtmlBlockState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_BEGIN_DELIMITED_HTML_BLOCK');
    }
    eol(newLine) {
        // We have reached the end of the first delimiter... we need to skip over any indentation on the next
        // line and we might also find that the multi-line, delimited block is immediately ended
        this.parser.beginHtmlBlock(this.parser.htmlBlockDelimiter);
        this.parser.handleDelimitedBlockEOL(newLine);
    }
    eof() {
        this.parser.htmlEOF();
    }
    char(ch, code) {
        const parser = this.parser;
        if (code === CODE_HTML_BLOCK_DELIMITER) {
            parser.htmlBlockDelimiter += ch;
        } else if(!parser.onlyWhitespaceRemainsOnLine()) {
            parser.isWithinSingleLineHtmlBlock = true;
            parser.beginHtmlBlock();
        }
    }
};
