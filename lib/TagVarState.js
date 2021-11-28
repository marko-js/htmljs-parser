'use strict';

var {
    CODE_OPEN_PAREN,
    CODE_PIPE,
} = require('../constants');

const BaseState = require("./BaseState");
const TagArgsState = require('./TagArgsState');
const TagParamsState = require('./TagParamsState');
const WithinOpenTagState = require('./WithinOpenTagState');

module.exports = class TagVarState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_TAG_VAR');
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
        parser.currentOpenTag.var = expression;
        if (parser.lookAtCharCodeAhead(1) === CODE_PIPE) {
            parser.enterState(TagParamsState);
        } else if (parser.lookAtCharCodeAhead(1) === CODE_OPEN_PAREN) {
            parser.enterState(TagArgsState);
        } else {
            parser.enterState(WithinOpenTagState);
        }
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
