'use strict';

var {
    CODE_CLOSE_PAREN,
    CODE_PIPE,
} = require('./constants');

const BaseState = require("./BaseState");
const TagParamsState = require('./TagParamsState');

module.exports = class TagNameState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_TAG_ARGS');
    }
    eol() {
        this.parser.openTagEOL();
    }
    eof() {
        this.parser.openTagEOF();
    }
    expression(expression) {
        var parser = this.parser;
        var method = parser.getAndRemoveMethod(expression);
        if (method) {
            const currentAttribute = parser.beginAttribute();
            currentAttribute.name = "default";
            currentAttribute.default = true;
            currentAttribute.method = true;
            currentAttribute.value = method.value;
            currentAttribute.pos = method.pos;
            currentAttribute.endPos = method.endPos;
            parser.endAttribute();
            if (parser.state.name !== 'STATE_WITHIN_OPEN_TAG') {
                parser.enterWithinOpenTagState();
            }
        } else {
            var value = expression.value;
            if (value.charCodeAt(value.length-1) !== CODE_CLOSE_PAREN) {
                throw new Error('Invalid argument');
            }
            expression.value = value.slice(1, value.length-1);
            expression.pos += 1;
            expression.endPos -= 1;
            parser.currentOpenTag.argument = expression;

            if (parser.lookAtCharCodeAhead(1) === CODE_PIPE) {
                parser.enterState(TagParamsState);
            } else {
                parser.enterWithinOpenTagState();
            }
        }
    }
    enter() {
        this.parser.beginExpression();
    }
    char() {
        throw new Error('Illegal state');
    }
};
