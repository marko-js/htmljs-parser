'use strict';

const BaseState = require("./BaseState");

// We enter STATE_ATTRIBUTE_NAME when we see a non-whitespace
// character after reading the tag name
module.exports = class AttributeNameState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_ATTRIBUTE_NAME');
    }
    eol() {
        this.parser.openTagEOL();
    }
    eof() {
        this.parser.openTagEOF();
    }
    expression(expression) {
        const parser = this.parser;
        const argument = parser.getAndRemoveArgument(expression);
        const method = parser.getAndRemoveMethod(expression);

        const currentAttribute = parser.currentAttribute;

        if (expression.endedWithComma) {
            // consume all following whitespace,
            // including new lines (which allows attributes to
            // span multiple lines in concise mode)
            parser.consumeWhitespace();
            parser.currentOpenTag.requiresCommas = true;
            currentAttribute.endedWithComma = true;
        } else if(!parser.lookPastWhitespaceFor('=', 0)){
            parser.currentOpenTag.lastAttrNoComma = true;
        }

        currentAttribute.name = currentAttribute.name ? currentAttribute.name + expression.value : expression.value;
        currentAttribute.pos = expression.pos;
        currentAttribute.endPos = expression.endPos;

        if (!currentAttribute.name) {
            currentAttribute.name = "default";
            currentAttribute.default = true;
        }

        if (argument) {
            currentAttribute.argument = argument;
        } else if (method) {
            currentAttribute.method = true;
            currentAttribute.value = method.value;
            currentAttribute.pos = method.pos;
            currentAttribute.endPos = method.endPos;
        }

    }
    enter(oldState) {
        const parser = this.parser;
        const currentOpenTag = parser.currentOpenTag;
        if (currentOpenTag.requiresCommas && currentOpenTag.lastAttrNoComma) {
            const parseOptions = currentOpenTag.parseOptions;

            if (!parseOptions || parseOptions.relaxRequireCommas !== true) {
                return parser.notifyError(parser.pos,
                    'COMMAS_REQUIRED',
                    'if commas are used, they must be used to separate all attributes for a tag');
            }
        }

        if (oldState.name !== 'STATE_EXPRESSION') {
            parser.beginExpression();
        }
    }
    char() {
        throw new Error('Illegal state');
    }
};
