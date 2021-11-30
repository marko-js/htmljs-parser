'use strict';

var {
    CODE_ASTERISK,
    CODE_CLOSE_ANGLE_BRACKET,
    CODE_CLOSE_SQUARE_BRACKET,
    CODE_FORWARD_SLASH,
    CODE_HTML_BLOCK_DELIMITER,
    CODE_OPEN_ANGLE_BRACKET,
    CODE_OPEN_PAREN,
    CODE_OPEN_SQUARE_BRACKET,
} = require('./constants');

const BaseState = require("./BaseState");
const AfterPlaceholderWithinTagState = require('./AfterPlaceholderWithinTagState');
const BeginDelimitedHtmlBlockState = require('./BeginDelimitedHtmlBlockState');

// We enter STATE_WITHIN_OPEN_TAG after we have fully
// read in the tag name and encountered a whitespace character
module.exports = class WithinOpenTagState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_WITHIN_OPEN_TAG');
    }
    eol() {
        this.parser.openTagEOL();
    }
    eof() {
        this.parser.openTagEOF();
    }
    enter() {
        const parser = this.parser;
        const currentOpenTag = parser.currentOpenTag;
        if (!currentOpenTag.notifiedOpenTagName) {
            currentOpenTag.notifiedOpenTagName = true;
            currentOpenTag.tagNameEndPos = parser.pos;
            parser.notifiers.notifyOpenTagName(currentOpenTag);
        }
    }
    expression(expression) {
        const parser = this.parser;
        const currentOpenTag = parser.currentOpenTag;
        const argument = parser.getAndRemoveArgument(expression);
        const method = parser.getAndRemoveMethod(expression);

        if (method) {
            let targetAttribute;
            if (currentOpenTag.attributes.length === 0) {
                targetAttribute = parser.beginAttribute();
                targetAttribute.name = "default";
                targetAttribute.default = true;
            } else {
                targetAttribute = parser.currentAttribute || peek(currentOpenTag.attributes);
            }
            targetAttribute.method = true;
            targetAttribute.value = method.value;
            targetAttribute.pos = method.pos;
            targetAttribute.endPos = method.endPos;
        } else if (argument) {
            // We found an argument... the argument could be for an attribute or the tag
            if (currentOpenTag.attributes.length === 0) {
                if (currentOpenTag.argument != null) {
                    parser.notifyError(expression.endPos,
                        'ILLEGAL_TAG_ARGUMENT',
                        'A tag can only have one argument');
                    return;
                }
                currentOpenTag.argument = argument;
            } else {
                const targetAttribute = parser.currentAttribute || peek(currentOpenTag.attributes);

                if (targetAttribute.argument != null) {
                    parser.notifyError(expression.endPos,
                        'ILLEGAL_ATTRIBUTE_ARGUMENT',
                        'An attribute can only have one argument');
                    return;
                }
                targetAttribute.argument = argument;
            }
        }
    }
    placeholder(placeholder) {
        const parser = this.parser;
        const attr = parser.beginAttribute();
        attr.value = placeholder.value;
        parser.endAttribute();
        parser.enterState(AfterPlaceholderWithinTagState);
    }
    comment() {
        /* Ignore comments within an open tag */
    }
    char(ch, code) {
        const parser = this.parser;
        const currentOpenTag = parser.currentOpenTag;
        if (parser.isConcise) {
            switch (code) {
                case CODE_HTML_BLOCK_DELIMITER: {
                    if (parser.lookAtCharCodeAhead(1) !== CODE_HTML_BLOCK_DELIMITER) {
                        if (parser.options.legacyCompatibility) {
                            parser.outputDeprecationWarning('The usage of a single hyphen in a concise line is now deprecated. Use "--" instead.\nSee: https://github.com/marko-js/htmljs-parser/issues/43');
                        } else {
                            parser.notifyError(currentOpenTag.pos,
                                'MALFORMED_OPEN_TAG',
                                '"-" not allowed as first character of attribute name');
                            return;
                        }
                    }

                    if (currentOpenTag.withinAttrGroup) {
                        parser.notifyError(parser.pos,
                            'MALFORMED_OPEN_TAG',
                            'Attribute group was not properly ended');
                        return;
                    }

                    // The open tag is complete
                    parser.finishOpenTag();

                    parser.htmlBlockDelimiter = ch;
                    var nextIndent = this.getNextIndent();
                    if (nextIndent > parser.indent) {
                        parser.indent = nextIndent;
                    }
                    parser.enterState(BeginDelimitedHtmlBlockState);
                    return;
                }
                case CODE_OPEN_SQUARE_BRACKET: {
                    if (currentOpenTag.withinAttrGroup) {
                        parser.notifyError(parser.pos,
                            'MALFORMED_OPEN_TAG',
                            'Unexpected "[" character within open tag.');
                        return;
                    }

                    currentOpenTag.withinAttrGroup = true;
                    return;
                }
                case CODE_CLOSE_SQUARE_BRACKET: {
                    if (!currentOpenTag.withinAttrGroup) {
                        parser.notifyError(parser.pos,
                            'MALFORMED_OPEN_TAG',
                            'Unexpected "]" character within open tag.');
                        return;
                    }

                    currentOpenTag.withinAttrGroup = false;
                    return;
                }
            }
        } else {
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

        if (this.checkForEscapedEscapedPlaceholder(ch, code)) {
            const attr = parser.beginAttribute();
            attr.name = '\\';
            parser.skip(1);
            return;
        }  else if (this.checkForEscapedPlaceholder(ch, code)) {
            const attr = parser.beginAttribute();
            attr.name = '$';
            parser.skip(1);
            return;
        } else if (this.checkForPlaceholder(ch, code)) {
            return;
        }

        if (code === CODE_OPEN_ANGLE_BRACKET) {
            return parser.notifyError(parser.pos,
                'ILLEGAL_ATTRIBUTE_NAME',
                'Invalid attribute name. Attribute name cannot begin with the "<" character.');
        }

        if (code === CODE_FORWARD_SLASH && parser.lookAtCharCodeAhead(1) === CODE_ASTERISK) {
            // Skip over code inside a JavaScript block comment
            parser.beginBlockComment();
            parser.skip(1);
            return;
        }

        if (parser.isWhitespaceCode(code)) {
            // ignore whitespace within element...
        } else if (code === CODE_OPEN_PAREN) {
            parser.rewind(1);
            parser.beginExpression();
            // encountered something like:
            // <for (var i = 0; i < len; i++)>
        } else {
            parser.rewind(1);
            // attribute name is initially the first non-whitespace
            // character that we found
            parser.beginAttribute();
        }
    }
    getNextIndent() {
        const parser = this.parser;
        var match = /[^\n]*\n(\s+)/.exec(parser.substring(parser.pos));
        if (match) {
            var whitespace = match[1].split(/\n/g);
            return whitespace[whitespace.length-1];
        }
    }
};

function peek(array) {
    var len = array.length;
    if (!len) {
        return undefined;
    }
    return array[len - 1];
}
