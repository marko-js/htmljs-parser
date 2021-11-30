'use strict';

const {
    CODE_ASTERISK,
    CODE_DOLLAR,
    CODE_FORWARD_SLASH,
    CODE_HTML_BLOCK_DELIMITER,
    CODE_OPEN_ANGLE_BRACKET,
} = require('./constants');

const BaseState = require("./BaseState");
const BeginDelimitedHtmlBlockState = require('./BeginDelimitedHtmlBlockState');

// In STATE_CONCISE_HTML_CONTENT we are looking for concise tags and text blocks based on indent
module.exports = class ConciseHtmlContentState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_CONCISE_HTML_CONTENT');
    }
    eol(newLine) {
        this.parser.text += newLine;
        this.parser.indent = '';
    }
    eof() {
        this.parser.htmlEOF();
    }
    enter() {
        this.parser.isConcise = true;
        this.parser.indent = '';
    }
    comment(comment) {
        var value = comment.value;

        value = value.trim();

        this.parser.notifiers.notifyComment({
            value: value,
            pos: comment.pos,
            endPos: comment.endPos
        });

        if (comment.type === 'block') {
            // Make sure there is only whitespace on the line
            // after the ending "*/" sequence
            this.parser.beginCheckTrailingWhitespace((err) => {
                if (!err) return;

                // This is a non-whitespace! We don't allow non-whitespace
                // after matching two or more hyphens. This is user error...
                this.parser.notifyError(this.parser.pos,
                    'INVALID_CHARACTER',
                    'A non-whitespace of "' + err.ch + '" was found after a JavaScript block comment.');
            });
        }
    }
    endTrailingWhitespace(eof) {
        this.parser.endHtmlBlock();

        if (eof) {
            this.parser.htmlEOF();
        }
    }
    char(ch, code) {
        var parser = this.parser;
        const blockStack = parser.blockStack;

        if (parser.isWhitespaceCode(code)) {
            parser.indent += ch;
        } else {
            while (true) {
                const len = blockStack.length;
                if (len) {
                    const curBlock = blockStack[len - 1];
                    if (curBlock.indent.length >= parser.indent.length) {
                        parser.closeTag(curBlock.expectedCloseTagName);
                    } else {
                        // Indentation is greater than the last tag so we are starting a
                        // nested tag and there are no more tags to end
                        break;
                    }
                } else {
                    if (parser.indent) {
                        parser.notifyError(parser.pos,
                            'BAD_INDENTATION',
                            'Line has extra indentation at the beginning');
                        return;
                    }
                    break;
                }
            }

            var parent = blockStack.length && blockStack[blockStack.length - 1];
            var body;

            if (parent) {
                body = parent.body;
                if (parent.openTagOnly) {
                    parser.notifyError(parser.pos,
                        'INVALID_BODY',
                        'The "' + parent.tagName + '" tag does not allow nested body content');
                    return;
                }

                if (parent.nestedIndent) {
                    if (parent.nestedIndent.length !== parser.indent.length) {
                        parser.notifyError(parser.pos,
                            'BAD_INDENTATION',
                            'Line indentation does match indentation of previous line');
                        return;
                    }
                } else {
                    parent.nestedIndent = parser.indent;
                }
            }

            if (body && code !== CODE_HTML_BLOCK_DELIMITER) {
                parser.notifyError(parser.pos,
                    'ILLEGAL_LINE_START',
                    'A line within a tag that only allows text content must begin with a "-" character');
                return;
            }

            const legacyCompatibility = parser.options.legacyCompatibility;
            if (code === CODE_OPEN_ANGLE_BRACKET || (legacyCompatibility && code === CODE_DOLLAR)) {
                if (code === CODE_DOLLAR) {
                    parser.outputDeprecationWarning('Handling of a placeholder (i.e. "${...}") at the start of a concise line will be changing.\nA placeholder at the start of a concise line will now be handled as a tag name placeholder instead of a body text placeholder.\nSwitch to using "-- ${...}" to avoid breakage.\nSee: https://github.com/marko-js/htmljs-parser/issues/48');
                }
                parser.beginMixedMode = true;
                parser.rewind(1);
                parser.beginHtmlBlock();
                return;
            }

            if (!legacyCompatibility && code === CODE_DOLLAR && parser.isWhitespaceCode(parser.lookAtCharCodeAhead(1))) {
                parser.skip(1);
                parser.beginInlineScript();
                return;
            }

            if (code === CODE_HTML_BLOCK_DELIMITER) {
                if (parser.lookAtCharCodeAhead(1) !== CODE_HTML_BLOCK_DELIMITER) {
                    if (parser.options.legacyCompatibility) {
                        parser.outputDeprecationWarning('The usage of a single hyphen at the start of a concise line is now deprecated. Use "--" instead.\nSee: https://github.com/marko-js/htmljs-parser/issues/43');
                    } else {
                        parser.notifyError(parser.pos,
                            'ILLEGAL_LINE_START',
                            'A line in concise mode cannot start with a single hyphen. Use "--" instead. See: https://github.com/marko-js/htmljs-parser/issues/43');
                        return;
                    }
                }

                parser.htmlBlockDelimiter = ch;
                return parser.enterState(BeginDelimitedHtmlBlockState);
            } else if (code === CODE_FORWARD_SLASH) {
                // Check next character to see if we are in a comment
                var nextCode = parser.lookAtCharCodeAhead(1);
                if (nextCode === CODE_FORWARD_SLASH) {
                    parser.beginLineComment();
                    parser.skip(1);
                    return;
                } else if (nextCode === CODE_ASTERISK) {
                    parser.beginBlockComment();
                    parser.skip(1);
                    return;
                } else {
                    parser.notifyError(parser.pos,
                        'ILLEGAL_LINE_START',
                        'A line in concise mode cannot start with "/" unless it starts a "//" or "/*" comment');
                    return;
                }
            } else {
                parser.beginOpenTag();
                parser.currentOpenTag.tagNameStart = parser.pos;
                parser.rewind(1); // START_TAG_NAME expects to start at the first character
            }

        }
    }
};
