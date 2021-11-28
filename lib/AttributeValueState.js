'use strict';

const BaseState = require("./BaseState");

const NUMBER_REGEX = /^[-+]?\d*(?:\.\d+)?(?:e[-+]?\d+)?$/;

// We enter STATE_ATTRIBUTE_VALUE when we see a "=" while in
// the ATTRIBUTE_NAME state.
module.exports = class AttributeValueState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_ATTRIBUTE_VALUE');
    }
    expression(expression) {
        var parser = this.parser;
        var currentOpenTag = parser.currentOpenTag;
        var currentAttribute = parser.currentAttribute;
        var value = expression.value;

        if (value === '') {
            return parser.notifyError(expression.pos,
                'ILLEGAL_ATTRIBUTE_VALUE',
                'No attribute value found after "="');
        }

        if (expression.endedWithComma) {
            // consume all following whitespace,
            // including new lines (which allows attributes to
            // span multiple lines in concise mode)
            parser.consumeWhitespace();
            currentOpenTag.requiresCommas = true;
            currentAttribute.endedWithComma = true;
        } else {
            currentOpenTag.lastAttrNoComma = true;
        }

        if (expression.hasUnenclosedWhitespace) {
            currentOpenTag.hasUnenclosedWhitespace = true;
        }

        currentAttribute.value = value;
        currentAttribute.pos = expression.pos;
        currentAttribute.endPos = expression.endPos;

        // If the expression evaluates to a literal value then add the
        // `literalValue` property to the attribute
        if (expression.isStringLiteral) {
            currentAttribute.literalValue = this.evaluateStringExpression(value, expression.pos);
        } else if (value === 'true') {
            currentAttribute.literalValue = true;
        } else if (value === 'false') {
            currentAttribute.literalValue = false;
        } else if (value === 'null') {
            currentAttribute.literalValue = null;
        } else if (value === 'undefined') {
            currentAttribute.literalValue = undefined;
        } else if (NUMBER_REGEX.test(value)) {
            currentAttribute.literalValue = Number(value);
        }

        // We encountered a whitespace character while parsing the attribute name. That
        // means the attribute name has ended and we should continue parsing within the
        // open tag
        parser.endAttribute();
    }
    eol() {
        this.parser.openTagEOL();
    }
    eof() {
        this.parser.openTagEOF();
    }
    enter(oldState) {
        if (oldState.name !== 'STATE_EXPRESSION') {
            this.parser.beginExpression();
        }
    }
    char() {
        throw new Error('Illegal state');
    }
    /**
    * Takes a string expression such as `"foo"` or `'foo "bar"'`
    * and returns the literal String value.
    */
    evaluateStringExpression(expression, pos) {
        // We could just use eval(expression) to get the literal String value,
        // but there is a small chance we could be introducing a security threat
        // by accidently running malicous code. Instead, we will use
        // JSON.parse(expression). JSON.parse() only allows strings
        // that use double quotes so we have to do extra processing if
        // we detect that the String uses single quotes

        if (expression.charAt(0) === "'") {
            expression = expression.substring(1, expression.length - 1);

            // Make sure there are no unescaped double quotes in the string expression...
            expression = expression.replace(/\\\\|\\[']|\\["]|["]/g, (match) => {
                if (match === "\\'"){
                    // Don't escape single quotes since we are using double quotes
                    return "'";
                } else if (match === '"'){
                    // Return an escaped double quote if we encounter an
                    // unescaped double quote
                    return '\\"';
                } else {
                    // Return the escape sequence
                    return match;
                }
            });

            expression = '"' + expression + '"';
        }

        try {
            return JSON.parse(expression);
        } catch(e) {
            this.parser.notifyError(pos,
                'INVALID_STRING',
                'Invalid string (' + expression + '): ' + e);
        }
    }
};
