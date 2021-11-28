'use strict';

const {
    CODE_ASTERISK,
    CODE_BACKTICK,
    CODE_CLOSE_ANGLE_BRACKET,
    CODE_CLOSE_CURLY_BRACE,
    CODE_CLOSE_PAREN,
    CODE_CLOSE_SQUARE_BRACKET,
    CODE_COLON,
    CODE_COMMA,
    CODE_DOLLAR,
    CODE_DOUBLE_QUOTE,
    CODE_EQUAL,
    CODE_FORWARD_SLASH,
    CODE_NUMBER_SIGN,
    CODE_OPEN_ANGLE_BRACKET,
    CODE_OPEN_CURLY_BRACE,
    CODE_OPEN_PAREN,
    CODE_OPEN_SQUARE_BRACKET,
    CODE_PERIOD,
    CODE_PIPE,
    CODE_SEMICOLON,
    CODE_SINGLE_QUOTE,
} = require('../constants');

const AttributeValueState = require("./AttributeValueState");
const BaseState = require("./BaseState");
const TagArgsState = require("./TagArgsState");
const TagParamsState = require("./TagParamsState");
const TagVarState = require("./TagVarState");
const WithinOpenTagState = require("./WithinOpenTagState");

module.exports = class ExpressionState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_EXPRESSION');
    }
    eol(str) {
        var parser = this.parser;
        const currentPart = parser.currentPart;
        const depth = parser.currentPart.groupStack.length;

        if (depth === 0) {
            if (currentPart.parentState.name === 'STATE_ATTRIBUTE_NAME' || currentPart.parentState.name === 'STATE_ATTRIBUTE_VALUE') {
                currentPart.endPos = parser.pos;
                parser.endExpression();
                // We encountered a whitespace character while parsing the attribute name. That
                // means the attribute name has ended and we should continue parsing within the
                // open tag
                parser.endAttribute();

                if (parser.isConcise) {
                    parser.openTagEOL();
                }
                return;
            } else if (currentPart.parentState.name === 'STATE_TAG_NAME') {
                currentPart.endPos = parser.pos;
                parser.endExpression();

                // We encountered a whitespace character while parsing the attribute name. That
                // means the attribute name has ended and we should continue parsing within the
                // open tag
                if (parser.state.name !== 'STATE_WITHIN_OPEN_TAG') {
                    // Make sure we transition into parsing within the open tag
                    parser.enterState(WithinOpenTagState);
                }

                if (parser.isConcise) {
                    parser.openTagEOL();
                }

                return;
            }
        }

        currentPart.value += str;
    }
    eof() {
        const parser = this.parser;
        const currentPart = parser.currentPart;
        if (parser.isConcise && currentPart.groupStack.length === 0) {
            currentPart.endPos = parser.pos;
            parser.endExpression();
            parser.openTagEOF();
        } else {
            const parentState = currentPart.parentState;

            switch (parentState.name) {
                case 'STATE_ATTRIBUTE_NAME':
                    return parser.notifyError(currentPart.pos,
                        'MALFORMED_OPEN_TAG',
                        'EOF reached while parsing attribute name for the "' + parser.currentOpenTag.tagName + '" tag');
                case 'STATE_ATTRIBUTE_VALUE':
                    return parser.notifyError(currentPart.pos,
                        'MALFORMED_OPEN_TAG',
                        'EOF reached while parsing attribute value for the "' + parser.currentAttribute.name + '" attribute');
                case 'STATE_TAG_NAME':
                    return parser.notifyError(currentPart.pos,
                        'MALFORMED_OPEN_TAG',
                        'EOF reached while parsing tag name');
                case 'STATE_PLACEHOLDER':
                    return parser.notifyError(currentPart.pos,
                        'MALFORMED_PLACEHOLDER',
                        'EOF reached while parsing placeholder');
                default:
                    return parser.notifyError(currentPart.pos,
                        'INVALID_EXPRESSION',
                        'EOF reached while parsing expression');
            }
        }
    }
    string(string) {
        const parser = this.parser;
        if (parser.currentPart.value === '') {
            parser.currentPart.isStringLiteral = string.isStringLiteral === true;
        } else {
            // More than one strings means it is for sure not a string literal...
            parser.currentPart.isStringLiteral = false;
        }

        parser.currentPart.value += string.value;
    }
    comment(comment) {
        const parser = this.parser;
        parser.currentPart.isStringLiteral = false;
        parser.currentPart.value += comment.rawValue;
    }
    templateString(templateString) {
        const parser = this.parser;
        parser.currentPart.isStringLiteral = false;
        parser.currentPart.value += templateString.value;
    }
    regularExpression(regularExpression) {
        const parser = this.parser;
        parser.currentPart.isStringLiteral = false;
        parser.currentPart.value += regularExpression.value;
    }
    char(ch, code) {
        const parser = this.parser;
        const depth = parser.currentPart.groupStack.length;
        const parentState = parser.currentPart.parentState;

        if (code === CODE_SINGLE_QUOTE) {
            return parser.beginString("'", CODE_SINGLE_QUOTE);
        } else if (code === CODE_DOUBLE_QUOTE) {
            return parser.beginString('"', CODE_DOUBLE_QUOTE);
        } else if (code === CODE_BACKTICK) {
            return parser.beginTemplateString();
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
            } else if (depth === 0 && !parser.isConcise && nextCode === CODE_CLOSE_ANGLE_BRACKET) {
                // Let the STATE_WITHIN_OPEN_TAG state deal with the ending tag sequence
                parser.currentPart.endPos = parser.pos;
                parser.endExpression();
                parser.rewind(1);

                if (parser.state.name !== 'STATE_WITHIN_OPEN_TAG') {
                    // Make sure we transition into parsing within the open tag
                    parser.enterState(WithinOpenTagState);
                }
                return;
            } else if (!/[\]})A-Z0-9.<%]/i.test(parser.getPreviousNonWhitespaceChar())) {
                parser.beginRegularExpression();
                return;
            }
        } else if (code === CODE_PIPE && parentState.name === 'STATE_TAG_PARAMS') {
            if (depth === 0) {
                parser.currentPart.groupStack.push(code);
                parser.currentPart.isStringLiteral = false;
                parser.currentPart.value += ch;
                return;
            } else if (depth === 1) {
                parser.endExpression();
                return;
            }
        } else if (code === CODE_OPEN_PAREN ||
                 code === CODE_OPEN_SQUARE_BRACKET ||
                 code === CODE_OPEN_CURLY_BRACE) {

            if (depth === 0 && code === CODE_OPEN_PAREN) {
                parser.currentPart.lastLeftParenPos = parser.currentPart.value.length;
            }

            parser.currentPart.groupStack.push(code);
            parser.currentPart.isStringLiteral = false;
            parser.currentPart.value += ch;
            return;
        } else if (code === CODE_CLOSE_PAREN ||
                 code === CODE_CLOSE_SQUARE_BRACKET ||
                 code === CODE_CLOSE_CURLY_BRACE) {

            if (depth === 0) {
                if (code === CODE_CLOSE_SQUARE_BRACKET) {
                    // We are ending the attribute group so end this expression and let the
                    // STATE_WITHIN_OPEN_TAG state deal with the ending attribute group
                    if (parser.currentOpenTag.withinAttrGroup) {
                        parser.currentPart.endPos = parser.pos + 1;
                        parser.endExpression();
                        // Let the STATE_WITHIN_OPEN_TAG state deal with the ending tag sequence
                        parser.rewind(1);
                        if (parser.state.name !== 'STATE_WITHIN_OPEN_TAG') {
                            // Make sure we transition into parsing within the open tag
                            parser.enterState(WithinOpenTagState);
                        }
                        return;
                    }
                } else {
                    return parser.notifyError(parser.currentPart.pos,
                        'INVALID_EXPRESSION',
                        'Mismatched group. A closing "' + ch + '" character was found but it is not matched with a corresponding opening character.');
                }
            }


            const matchingGroupCharCode = parser.currentPart.groupStack.pop();

            if ((code === CODE_CLOSE_PAREN && matchingGroupCharCode !== CODE_OPEN_PAREN) ||
              (code === CODE_CLOSE_SQUARE_BRACKET && matchingGroupCharCode !== CODE_OPEN_SQUARE_BRACKET) ||
              (code === CODE_CLOSE_CURLY_BRACE && matchingGroupCharCode !== CODE_OPEN_CURLY_BRACE)) {
                return parser.notifyError(parser.currentPart.pos,
                    'INVALID_EXPRESSION',
                    'Mismatched group. A "' + ch + '" character was found when "' + String.fromCharCode(matchingGroupCharCode) + '" was expected.');
            }

            parser.currentPart.value += ch;

            if (parser.currentPart.groupStack.length === 0) {
                if (code === CODE_CLOSE_PAREN) {
                    parser.currentPart.lastRightParenPos = parser.currentPart.value.length - 1;
                    if  ((parentState.name == 'STATE_ATTRIBUTE_NAME' || parentState.name == 'STATE_TAG_ARGS' || parentState.name == 'STATE_WITHIN_OPEN_TAG') && parser.lookPastWhitespaceFor('{')) {
                        parser.currentPart.method = true;
                        parser.currentPart.value += parser.consumeWhitespace();
                        return;
                    }
                }
                var endPlaceholder = code === CODE_CLOSE_CURLY_BRACE && parentState.name === 'STATE_PLACEHOLDER';
                var endTagArgs = code === CODE_CLOSE_PAREN && parentState.name === 'STATE_TAG_ARGS';
                if (endPlaceholder || endTagArgs) {
                    parser.currentPart.endPos = parser.pos + 1;
                    parser.endExpression();
                    return;
                }
            }

            return;
        }

        if (depth === 0) {

            if (!parser.isConcise) {
                if (code === CODE_CLOSE_ANGLE_BRACKET &&
                  (parentState.name === 'STATE_TAG_NAME' ||
                   parentState.name === 'STATE_ATTRIBUTE_NAME' ||
                   parentState.name === 'STATE_ATTRIBUTE_VALUE' ||
                   parentState.name === 'STATE_WITHIN_OPEN_TAG')) {
                    parser.currentPart.endPos = parser.pos;
                    parser.endExpression();
                    parser.endAttribute();
                    // Let the STATE_WITHIN_OPEN_TAG state deal with the ending tag sequence
                    parser.rewind(1);
                    if (parser.state.name !== 'STATE_WITHIN_OPEN_TAG') {
                        // Make sure we transition into parsing within the open tag
                        parser.enterState(WithinOpenTagState);
                    }
                    return;
                }
            }

            if (code === CODE_SEMICOLON) {
                parser.endExpression();
                parser.endAttribute();
                if (parser.isConcise) {
                    parser.finishOpenTag();
                    parser.beginCheckTrailingWhitespace(function(hasChar) {
                        if(hasChar) {
                            var code = hasChar.ch.charCodeAt(0);

                            if(code === CODE_FORWARD_SLASH) {
                                if(parser.lookAheadFor('/')) {
                                    parser.beginLineComment();
                                    parser.skip(1);
                                    return;
                                } else if(parser.lookAheadFor('*')) {
                                    parser.beginBlockComment();
                                    parser.skip(1);
                                    return;
                                }
                            } else if (code === CODE_OPEN_ANGLE_BRACKET && parser.lookAheadFor('!--')) {
                                // html comment
                                parser.beginHtmlComment();
                                parser.skip(3);
                                return;
                            }

                            parser.notifyError(parser.pos,
                                'INVALID_CODE_AFTER_SEMICOLON',
                                'A semicolon indicates the end of a line.  Only comments may follow it.');
                        }
                    });
                }
                return;
            }

            if (code === CODE_COMMA || parser.isWhitespaceCode(code)) {
                if (code === CODE_COMMA || parser.lookPastWhitespaceFor(',')) {
                    if(code !== CODE_COMMA) {
                        parser.consumeWhitespace();
                        parser.skip(1);
                    }

                    parser.currentPart.endedWithComma = true;
                } else if (parser.currentPart.parentState.name === 'STATE_ATTRIBUTE_NAME' && parser.lookPastWhitespaceFor('=')) {
                    parser.consumeWhitespace();
                    return;
                } else if (parentState.name !== 'STATE_TAG_NAME') {
                    var typeofExpression = parser.checkForTypeofOperator();
                    if (typeofExpression) {
                        parser.currentPart.value += typeofExpression;
                        parser.currentPart.isStringLiteral = false;
                        parser.currentPart.hasUnenclosedWhitespace = true;
                        parser.skip(typeofExpression.length-1);
                        return;
                    }

                    var prevPos = parser.pos;
                    var operator = parser.checkForOperator();

                    if (parser.src[parser.pos] === ":" && parser.src[parser.pos+1] === "=") {
                        parser.currentPart.endPos = prevPos;
                        parser.endExpression();
                        if (parentState.name === 'STATE_ATTRIBUTE_NAME') {
                            parser.skip(1);
                            parser.enterState(AttributeValueState);
                            parser.currentAttribute.bound = true;
                            parser.consumeWhitespace();
                        } else {
                            parser.rewind(1);
                            parser.beginAttribute();
                        }
                        return;
                    }

                    if (operator) {
                        parser.currentPart.isStringLiteral = false;
                        parser.currentPart.hasUnenclosedWhitespace = true;
                        parser.currentPart.value += operator;
                        return;
                    }
                }

                parser.currentPart.endPos = parser.pos;
                parser.endExpression();
                parser.endAttribute();
                if (parser.state.name !== 'STATE_WITHIN_OPEN_TAG') {
                    // Make sure we transition into parsing within the open tag
                    parser.enterState(WithinOpenTagState);
                }
                return;
            } else if ((code === CODE_EQUAL || (code === CODE_COLON && parser.lookAtCharCodeAhead(1) === CODE_EQUAL)) && parentState.name === 'STATE_ATTRIBUTE_NAME') {
                parser.currentPart.endPos = parser.pos;
                parser.endExpression();
                // We encountered "=" which means we need to start reading
                // the attribute value.

                if (code === CODE_COLON) {
                    parser.skip(1);
                }
                parser.enterState(AttributeValueState);
                if (code === CODE_COLON) {
                    parser.currentAttribute.bound = true;
                }
                parser.consumeWhitespace();
                return;
            }

            if (parser.currentPart.value === '') {
                const typeofExpression = parser.checkForTypeofOperatorAtStart();
                if (typeofExpression) {
                    parser.currentPart.value += typeofExpression;
                    parser.currentPart.isStringLiteral = false;
                    parser.currentPart.hasUnenclosedWhitespace = true;
                    parser.skip(typeofExpression.length-1);
                    return;
                }
            }

            if (parser.currentPart.parentState.name === 'STATE_TAG_PARAMS') {
                if (code === CODE_PIPE) {
                    parser.endExpression();
                    parser.rewind(1);
                    parser.enterState(TagParamsState);
                    return;
                }
            }

            if (parser.currentPart.parentState.name === 'STATE_TAG_VAR') {
                if (code === CODE_EQUAL || (code === CODE_COLON && parser.lookAtCharCodeAhead(1) === CODE_EQUAL) || code === CODE_CLOSE_ANGLE_BRACKET) {
                    parser.endExpression();
                    parser.rewind(1);
                    if (parser.state.name !== 'STATE_WITHIN_OPEN_TAG') {
                        // Make sure we transition into parsing within the open tag
                        parser.enterState(WithinOpenTagState);
                    }
                    return;
                }
            }

            if (parser.currentPart.parentState.name === 'STATE_TAG_NAME') {
                if (this.checkForEscapedEscapedPlaceholder(ch, code)) {
                    parser.currentPart.value += '\\';
                    parser.skip(1);
                    return;
                } else if (this.checkForEscapedPlaceholder(ch, code)) {
                    parser.currentPart.value += '$';
                    parser.skip(1);
                    return;
                } else if (code === CODE_DOLLAR && parser.lookAtCharCodeAhead(1) === CODE_OPEN_CURLY_BRACE) {
                    parser.currentPart.endPos = parser.pos;
                    parser.endExpression();
                    // We expect to start a placeholder at the first curly brace (the next character)
                    parser.beginPlaceholder(true, true /* tag name */);
                    return;
                } else if (code === CODE_PERIOD || code === CODE_NUMBER_SIGN) {
                    parser.endExpression();
                    parser.rewind(1);
                    parser.beginTagNameShorthand();
                    return;
                } else if (code === CODE_FORWARD_SLASH) {
                    parser.endExpression();
                    parser.rewind(1);
                    parser.enterState(TagVarState);
                    return;
                }
            }

            if (parser.currentPart.parentState.name === 'STATE_TAG_NAME' || parser.currentPart.parentState.name === 'STATE_TAG_VAR') {
                if (code === CODE_PIPE) {
                    parser.endExpression();
                    parser.rewind(1);
                    parser.enterState(TagParamsState);
                    return;
                } else if (code === CODE_EQUAL || (code === CODE_COLON && parser.lookAtCharCodeAhead(1) === CODE_EQUAL)) {
                    parser.endExpression();
                    parser.rewind(1);
                    parser.enterState(WithinOpenTagState);
                    return;
                } else if (
                    parser.lookAtCharCodeAhead(1) === CODE_OPEN_PAREN &&
                  (parser.currentPart.parentState.name === 'STATE_TAG_NAME' || parser.currentPart.value)
                ) {
                    parser.currentPart.value += ch;
                    parser.endExpression();
                    parser.enterState(TagArgsState);
                    return;
                }
            }
        }

        // If we got here then we didn't find a string part so we know
        // the current expression is not a string literal
        parser.currentPart.isStringLiteral = false;
        parser.currentPart.value += ch;
    }
};
