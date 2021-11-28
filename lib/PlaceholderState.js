'use strict';

const BaseState = require("./BaseState");

module.exports = class PlaceholderState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_PLACEHOLDER');
    }
    expression(expression) {
        var parser = this.parser;
        parser.currentPart.value = expression.value.slice(1, -1); // Chop off the curly braces
        parser.currentPart.endPos = expression.endPos;
        parser.endPlaceholder();
    }
    eol() {
        throw new Error('Illegal state. EOL not expected');
    }
    eof() {
        throw new Error('Illegal state. EOF not expected');
    }
    enter(oldState) {
        if (oldState.name !== 'STATE_EXPRESSION') {
            this.parser.beginExpression();
        }
    }
};
