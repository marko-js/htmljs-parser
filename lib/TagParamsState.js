'use strict';

const BaseState = require("./BaseState");
const WithinOpenTagState = require('./WithinOpenTagState');

module.exports = class TagParamsState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_TAG_PARAMS');
    }
    eol() {
        this.parser.openTagEOL();
    }
    eof() {
        this.parser.openTagEOF();
    }
    expression(expression) {
        const parser = this.parser;
        const value = expression.value;
        expression.value = value.slice(1);
        expression.pos += 1;
        parser.currentOpenTag.params = expression;
        parser.enterState(WithinOpenTagState);
    }
    enter(oldState) {
        if (oldState.name !== 'STATE_EXPRESSION') {
            this.parser.beginExpression();
        }
    }
    char() {
        throw new Error('Illegal state');
    }
};
