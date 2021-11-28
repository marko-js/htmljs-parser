'use strict';

const {
    CODE_ASTERISK,
    CODE_BACKTICK,
    CODE_FORWARD_SLASH,
    CODE_OPEN_ANGLE_BRACKET,
    CODE_PERCENT,
} = require("../constants");

const BaseState = require("./BaseState");

// We enter STATE_PARSED_TEXT_CONTENT when we are parsing
// the body of a tag does not contain HTML tags but may contains
// placeholders
module.exports = class ParsedTextContentState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_PARSED_TEXT_CONTENT');
    }
    enter() {
        this.parser.textParseMode = 'parsed-text';
    }
    comment(comment) {
        var parser = this.parser;
        parser.text += comment.rawValue;

        if (parser.htmlBlockDelimiter && comment.eol) {
            parser.handleDelimitedBlockEOL(comment.eol);
        }
    }
    templateString(templateString) {
        this.parser.text += templateString.value;
    }
    eol(newLine) {
        const parser = this.parser;
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
        if (!parser.isConcise && code === CODE_OPEN_ANGLE_BRACKET) {
            // First, see if we need to see if we reached the closing tag
            // and then check if we encountered CDATA
            if (parser.checkForClosingTag()) {
                return;
            } else if (parser.checkForCDATA()) {
                return;
            } else if (parser.lookAtCharCodeAhead(1) === CODE_PERCENT) {
                parser.beginScriptlet();
                parser.skip(1);
                return;
            }
        }


        if (code === CODE_FORWARD_SLASH) {
            if (parser.lookAtCharCodeAhead(1) === CODE_ASTERISK) {
                // Skip over code inside a JavaScript block comment
                parser.beginBlockComment();
                parser.skip(1);
                return;
            } else if (parser.lookAtCharCodeAhead(1) === CODE_FORWARD_SLASH) {
                parser.beginLineComment();
                parser.skip(1);
                return;
            }
        }

        if (code === CODE_BACKTICK) {
            parser.beginTemplateString();
            return;
        }

        const ignorePlaceholders = parser.options.ignorePlaceholders;
        if (!ignorePlaceholders && this.checkForEscapedEscapedPlaceholder(ch, code)) {
            parser.skip(1);
        }  else if (!ignorePlaceholders && this.checkForEscapedPlaceholder(ch, code)) {
            parser.text += '$';
            parser.skip(1);
            return;
        } else if (!ignorePlaceholders && this.checkForPlaceholder(ch, code)) {
            // We went into placeholder state...
            parser.endText();
            return;
        }

        parser.text += ch;
    }
};

