'use strict';

var {
    CODE_OPEN_PAREN,
} = require('./constants');

const BaseState = require("./BaseState");
const TagArgsState = require('./TagArgsState');

// We enter STATE_TAG_NAME after we encounter a "<"
// followed by a non-special character
module.exports = class TagNameState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_TAG_NAME');
    }
    eol() {
        this.parser.openTagEOL();
    }
    eof() {
        this.parser.openTagEOF();
    }
    expression(expression) {
        const parser = this.parser;
        const currentOpenTag = parser.currentOpenTag;
        currentOpenTag.tagNameEnd = expression.endPos;

        if (expression.value) {
            currentOpenTag.tagName += expression.value;

            if (currentOpenTag.tagNameParts) {
                currentOpenTag.tagNameParts.push(JSON.stringify(expression.value));
            }
        }
    }
    placeholder(placeholder) {
        const parser = this.parser;
        const currentOpenTag = parser.currentOpenTag;
        if (!currentOpenTag.tagNameParts) {
            currentOpenTag.tagNameParts = [];

            if (currentOpenTag.tagName) {
                currentOpenTag.tagNameParts.push(JSON.stringify(currentOpenTag.tagName));
            }
        }

        currentOpenTag.tagName += parser.substring(placeholder.pos, placeholder.endPos);
        currentOpenTag.tagNameParts.push('(' + placeholder.value + ')');
        currentOpenTag.tagNameEnd = placeholder.endPos;
        if (parser.lookAtCharCodeAhead(1) === CODE_OPEN_PAREN) {
            parser.endExpression();
            parser.enterState(TagArgsState);
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
