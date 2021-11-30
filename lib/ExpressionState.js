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
} = require('./constants');

const AttributeValueState = require("./AttributeValueState");
const BaseState = require("./BaseState");
const TagArgsState = require("./TagArgsState");
const TagParamsState = require("./TagParamsState");
const TagVarState = require("./TagVarState");

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
                    parser.enterWithinOpenTagState();
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
        const currentPart = parser.currentPart;
        const depth = currentPart.groupStack.length;
        const parentState = currentPart.parentState;

        switch (code) {
            case CODE_SINGLE_QUOTE:
                return parser.beginString("'", CODE_SINGLE_QUOTE);
            case CODE_DOUBLE_QUOTE:
                return parser.beginString('"', CODE_DOUBLE_QUOTE);
            case CODE_BACKTICK:
                return parser.beginTemplateString();
            case CODE_FORWARD_SLASH: {
                const nextCode = parser.lookAtCharCodeAhead(1);
                if (nextCode === CODE_FORWARD_SLASH) {
                    parser.beginLineComment();
                    parser.skip(1);
                    return;
                } else if (nextCode === CODE_ASTERISK) {
                    parser.beginBlockComment();
                    parser.skip(1);
                    return;
                } else if (!depth && !parser.isConcise && nextCode === CODE_CLOSE_ANGLE_BRACKET) {
                    // Let the STATE_WITHIN_OPEN_TAG state deal with the ending tag sequence
                    currentPart.endPos = parser.pos;
                    parser.endExpression();
                    parser.rewind(1);

                    if (parser.state.name !== 'STATE_WITHIN_OPEN_TAG') {
                        // Make sure we transition into parsing within the open tag
                        parser.enterWithinOpenTagState();
                    }
                    return;
                } else if (!/[\]})A-Z0-9.<%]/i.test(parser.getPreviousNonWhitespaceChar())) {
                    parser.beginRegularExpression();
                    return;
                }
                break;
            }
            case CODE_PIPE: {
                if (parentState.name !== 'STATE_TAG_PARAMS') break;
                if (!depth) {
                    currentPart.groupStack.push(code);
                    currentPart.isStringLiteral = false;
                    currentPart.value += ch;
                    return;
                } else if (depth === 1) {
                    parser.endExpression();
                    return;
                }
                break;
            }
            case CODE_OPEN_PAREN: {
                if (!depth) {
                    currentPart.lastLeftParenPos = currentPart.value.length;
                }
                currentPart.groupStack.push(code);
                currentPart.isStringLiteral = false;
                currentPart.value += ch;
                return;
            }
            case CODE_OPEN_SQUARE_BRACKET:
            case CODE_OPEN_CURLY_BRACE: {
                currentPart.groupStack.push(code);
                currentPart.isStringLiteral = false;
                currentPart.value += ch;
                return;
            }
            case CODE_CLOSE_PAREN: {
                if (!depth) {
                    return parser.notifyError(currentPart.pos,
                        'INVALID_EXPRESSION',
                        'Mismatched group. A closing "' + ch + '" character was found but it is not matched with a corresponding opening character.');
                }
                if (!this.popAndMatchGroupCharCode(ch, CODE_OPEN_PAREN)) return;

                currentPart.value += ch;

                if (currentPart.groupStack.length > 0) return;

                currentPart.lastRightParenPos = currentPart.value.length - 1;

                if  (['STATE_ATTRIBUTE_NAME', 'STATE_TAG_ARGS', 'STATE_WITHIN_OPEN_TAG'].includes(parentState.name) && parser.lookPastWhitespaceFor('{')) {
                    currentPart.method = true;
                    currentPart.value += parser.consumeWhitespace();
                } else if (parentState.name === 'STATE_TAG_ARGS') {
                    currentPart.endPos = parser.pos + 1;
                    parser.endExpression();
                }

                return;
            }
            case CODE_CLOSE_SQUARE_BRACKET: {
                if (!depth) {
                    // We are ending the attribute group so end this expression and let the
                    // STATE_WITHIN_OPEN_TAG state deal with the ending attribute group
                    if (parser.currentOpenTag.withinAttrGroup) {
                        currentPart.endPos = parser.pos + 1;
                        parser.endExpression();
                        // Let the STATE_WITHIN_OPEN_TAG state deal with the ending tag sequence
                        parser.rewind(1);
                        if (parser.state.name !== 'STATE_WITHIN_OPEN_TAG') {
                            // Make sure we transition into parsing within the open tag
                            parser.enterWithinOpenTagState();
                        }
                        return;
                    }
                }
                if (!this.popAndMatchGroupCharCode(ch, CODE_OPEN_SQUARE_BRACKET)) return;

                parser.currentPart.value += ch;

                return;
            }
            case CODE_CLOSE_CURLY_BRACE: {
                if (!depth) {
                    return parser.notifyError(currentPart.pos,
                        'INVALID_EXPRESSION',
                        'Mismatched group. A closing "' + ch + '" character was found but it is not matched with a corresponding opening character.');
                }
                if (!this.popAndMatchGroupCharCode(ch, CODE_OPEN_CURLY_BRACE)) return;

                currentPart.value += ch;

                if (currentPart.groupStack.length === 0 && parentState.name === 'STATE_PLACEHOLDER') {
                    currentPart.endPos = parser.pos + 1;
                    parser.endExpression();
                }

                return;
            }
            case CODE_COMMA: {
                if (depth) break;

                currentPart.endedWithComma = true;
                currentPart.endPos = parser.pos;
                parser.endExpression();
                parser.endAttribute();
                if (parser.state.name !== 'STATE_WITHIN_OPEN_TAG') {
                    // Make sure we transition into parsing within the open tag
                    parser.enterWithinOpenTagState();
                }
                return;
            }
            case CODE_EQUAL: {
                if (depth) break;

                if (parentState.name === 'STATE_ATTRIBUTE_NAME') {
                    currentPart.endPos = parser.pos;
                    parser.endExpression();
                    // We encountered "=" which means we need to start reading
                    // the attribute value.

                    parser.enterState(AttributeValueState);
                    parser.consumeWhitespace();
                    return;
                }

                if (this.isEndExpression()) return;
                break;
            }
            case CODE_COLON: {
                if (depth) break;

                if (parentState.name === 'STATE_ATTRIBUTE_NAME' && parser.lookAtCharCodeAhead(1) === CODE_EQUAL) {
                    currentPart.endPos = parser.pos;
                    parser.endExpression();
                    // We encountered "=" which means we need to start reading
                    // the attribute value.

                    parser.skip(1);
                    parser.enterState(AttributeValueState);
                    parser.currentAttribute.bound = true;
                    parser.consumeWhitespace();
                    return;
                }

                if (this.isEndExpression()) return;
                break;
            }
            case CODE_CLOSE_ANGLE_BRACKET: {
                if (depth) break;

                if (!parser.isConcise) {
                    if (['STATE_TAG_NAME', 'STATE_ATTRIBUTE_NAME', 'STATE_ATTRIBUTE_VALUE', 'STATE_WITHIN_OPEN_TAG'].includes(parentState.name)) {
                        currentPart.endPos = parser.pos;
                        parser.endExpression();
                        parser.endAttribute();
                        // Let the STATE_WITHIN_OPEN_TAG state deal with the ending tag sequence
                        parser.rewind(1);
                        if (parser.state.name !== 'STATE_WITHIN_OPEN_TAG') {
                            // Make sure we transition into parsing within the open tag
                            parser.enterWithinOpenTagState();
                        }
                        return;
                    }
                }

                if (this.isEndExpression()) return;
                break;
            }
            case CODE_SEMICOLON: {
                if (depth) break;

                parser.endExpression();
                parser.endAttribute();

                if (!parser.isConcise) return;

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
                return;
            }
        }

        if (!depth) {
            if (parser.isWhitespaceCode(code)) {
                if (parser.lookPastWhitespaceFor(',')) {
                    parser.consumeWhitespace();
                    parser.skip(1);
                    currentPart.endedWithComma = true;
                } else if (parentState.name === 'STATE_ATTRIBUTE_NAME' && parser.lookPastWhitespaceFor('=')) {
                    parser.consumeWhitespace();
                    return;
                } else if (parentState.name !== 'STATE_TAG_NAME') {
                    var typeofExpression = parser.checkForTypeofOperator();
                    if (typeofExpression) {
                        currentPart.value += typeofExpression;
                        currentPart.isStringLiteral = false;
                        currentPart.hasUnenclosedWhitespace = true;
                        parser.skip(typeofExpression.length-1);
                        return;
                    }

                    const prevPos = parser.pos;
                    const operator = parser.checkForOperator();

                    if (parser.src[parser.pos] === ":" && parser.src[parser.pos + 1] === "=") {
                        currentPart.endPos = prevPos;
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
                        currentPart.isStringLiteral = false;
                        currentPart.hasUnenclosedWhitespace = true;
                        currentPart.value += operator;
                        return;
                    }
                }

                currentPart.endPos = parser.pos;
                parser.endExpression();
                parser.endAttribute();
                if (parser.state.name !== 'STATE_WITHIN_OPEN_TAG') {
                    // Make sure we transition into parsing within the open tag
                    parser.enterWithinOpenTagState();
                }
                return;
            }

            if (parser.currentPart.value === '') {
                const typeofExpression = parser.checkForTypeofOperatorAtStart();
                if (typeofExpression) {
                    currentPart.value += typeofExpression;
                    currentPart.isStringLiteral = false;
                    currentPart.hasUnenclosedWhitespace = true;
                    parser.skip(typeofExpression.length-1);
                    return;
                }
            }

            if (currentPart.parentState.name === 'STATE_TAG_NAME') {
                if (this.checkForEscapedEscapedPlaceholder(ch, code)) {
                    currentPart.value += '\\';
                    parser.skip(1);
                    return;
                } else if (this.checkForEscapedPlaceholder(ch, code)) {
                    currentPart.value += '$';
                    parser.skip(1);
                    return;
                } else if (code === CODE_DOLLAR && parser.lookAtCharCodeAhead(1) === CODE_OPEN_CURLY_BRACE) {
                    currentPart.endPos = parser.pos;
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

            if (currentPart.parentState.name === 'STATE_TAG_NAME' || currentPart.parentState.name === 'STATE_TAG_VAR') {
                if (code === CODE_PIPE) {
                    parser.endExpression();
                    parser.rewind(1);
                    parser.enterState(TagParamsState);
                    return;
                } else if (code === CODE_EQUAL || (code === CODE_COLON && parser.lookAtCharCodeAhead(1) === CODE_EQUAL)) {
                    parser.endExpression();
                    parser.rewind(1);
                    parser.enterWithinOpenTagState();
                    return;
                } else if (
                    parser.lookAtCharCodeAhead(1) === CODE_OPEN_PAREN &&
                  (currentPart.parentState.name === 'STATE_TAG_NAME' || currentPart.value)
                ) {
                    currentPart.value += ch;
                    parser.endExpression();
                    parser.enterState(TagArgsState);
                    return;
                }
            }
        }

        // If we got here then we didn't find a string part so we know
        // the current expression is not a string literal
        currentPart.isStringLiteral = false;
        currentPart.value += ch;
    }
    popAndMatchGroupCharCode(ch, openCode) {
        const parser = this.parser;
        const matchingGroupCharCode = parser.currentPart.groupStack.pop();

        if (openCode !== matchingGroupCharCode) {
            return parser.notifyError(parser.currentPart.pos,
                'INVALID_EXPRESSION',
                'Mismatched group. A "' + ch + '" character was found when "' + String.fromCharCode(matchingGroupCharCode) + '" was expected.');
        }
        return true;
    }
    isEndExpression() {
        const parser = this.parser;
        const currentPart = parser.currentPart;
        if (currentPart.value === '' || currentPart.parentState.name !== 'STATE_TAG_VAR') return;

        parser.endExpression();
        parser.rewind(1);
        if (parser.state.name !== 'STATE_WITHIN_OPEN_TAG') {
            // Make sure we transition into parsing within the open tag
            parser.enterWithinOpenTagState();
        }
        return true;
    }
};
