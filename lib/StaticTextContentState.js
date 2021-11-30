'use strict';

const {
    CODE_OPEN_ANGLE_BRACKET,
} = require('./constants');

const BaseState = require("./BaseState");

// We enter STATE_STATIC_TEXT_CONTENT when a listener manually chooses
// to enter this state after seeing an openTag event for a tag
// whose content should not be parsed at all (except for the purpose
// of looking for the end tag).
module.exports = class StaticTextContentState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_STATIC_TEXT_CONTENT');
    }
    enter() {
        this.parser.textParseMode = 'static-text';
    }
    eol(newLine) {
        var parser = this.parser;
        parser.text += newLine;

        if (parser.isWithinSingleLineHtmlBlock) {
            // We are parsing "HTML" and we reached the end of the line. If we are within a single
            // line HTML block then we should return back to the state to parse concise HTML.
            // A single line HTML block can be at the end of the tag or on its own line:
            //
            // span class="hello" - This is an HTML block at the end of a tag
            //     - This is an HTML block on its own line
            //
            parser.endHtmlBlock();
        } else if (parser.htmlBlockDelimiter) {
            parser.handleDelimitedBlockEOL(newLine);
        }
    }
    char(ch, code) {
        var parser = this.parser;

        // See if we need to see if we reached the closing tag...
        if (!parser.isConcise && code === CODE_OPEN_ANGLE_BRACKET) {
            if (parser.checkForClosingTag()) {
                return;
            }
        }

        parser.text += ch;
    }
};

