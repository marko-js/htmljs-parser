'use strict';

const {
    CODE_OPEN_ANGLE_BRACKET,
    CODE_PERCENT,
    CODE_EXCLAMATION,
    CODE_QUESTION,
    CODE_FORWARD_SLASH,
    CODE_CLOSE_ANGLE_BRACKET,
    CODE_DOLLAR,
} = require('../constants');

const BaseState = require("./BaseState");

module.exports = class HtmlContentState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_HTML_CONTENT');
    }
    placeholder() {
        // We found a placeholder while parsing the HTML content. This function is called
        // from endPlaceholder(). We have already notified the listener of the placeholder so there is
        // nothing to do here
    }
    eol(newLine) {
        var parser = this.parser;
        parser.text += newLine;

        if (parser.beginMixedMode) {
            parser.beginMixedMode = false;
            parser.endHtmlBlock();
        } else if (parser.endingMixedModeAtEOL) {
            parser.endingMixedModeAtEOL = false;
            parser.endHtmlBlock();
        } else if (parser.isWithinSingleLineHtmlBlock) {
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
    eof() {
        this.parser.htmlEOF();
    }
    enter() {
        var parser = this.parser;
        parser.textParseMode = 'html';
        parser.isConcise = false; // Back into non-concise HTML parsing
    }
    char(ch, code) {
        const parser = this.parser;
        const {ignorePlaceholders, legacyCompatibility} = parser.options;
        if (code === CODE_OPEN_ANGLE_BRACKET) {
            if (parser.checkForCDATA()) {
                return;
            }

            var nextCode = parser.lookAtCharCodeAhead(1);

            if (nextCode === CODE_PERCENT) {
                parser.beginScriptlet();
                parser.skip(1);
            } else if (parser.lookAheadFor('!--')) {
                parser.beginHtmlComment();
                parser.skip(3);
            } else if (nextCode === CODE_EXCLAMATION) {
                // something like:
                // <!DOCTYPE html>
                // NOTE: We already checked for CDATA earlier and <!--
                parser.beginDocumentType();
                parser.skip(1);
            } else if (nextCode === CODE_QUESTION) {
                // something like:
                // <?xml version="1.0"?>
                parser.beginDeclaration();
                parser.skip(1);
            } else if (nextCode === CODE_FORWARD_SLASH) {
                parser.closeTagPos = parser.pos;
                parser.closeTagName = null;

                parser.skip(1);
                // something like:
                // </html>
                parser.endText();

                parser.enterCloseTagState();
            } else if (nextCode === CODE_CLOSE_ANGLE_BRACKET ||
                       nextCode === CODE_OPEN_ANGLE_BRACKET ||
                       parser.isWhitespaceCode(nextCode)) {
                // something like:
                // "<>"
                // "<<"
                // "< "
                // We'll treat this left angle brakect as text
                parser.text += '<';
            } else {
                parser.beginOpenTag();
                parser.currentOpenTag.tagNameStart = parser.pos+1;
            }
        } else if (!ignorePlaceholders && this.checkForEscapedEscapedPlaceholder(ch, code)) {
            parser.text += '\\';
            parser.skip(1);
        }  else if (!ignorePlaceholders && this.checkForEscapedPlaceholder(ch, code)) {
            parser.text += '$';
            parser.skip(1);
        } else if (!ignorePlaceholders && this.checkForPlaceholder(ch, code)) {
            // We went into placeholder state...
            parser.endText();
        } else if (!legacyCompatibility && code === CODE_DOLLAR && parser.isWhitespaceCode(parser.lookAtCharCodeAhead(1)) && this.isBeginningOfLine()) {
            parser.skip(1);
            parser.beginInlineScript();
        } else {
            parser.text += ch;
        }
    }
    isBeginningOfLine() {
        const before = this.parser.substring(0, this.parser.pos);
        const lines = before.split('\n');
        const lastLine = lines[lines.length-1];
        return /^\s*$/.test(lastLine);
    }
};
