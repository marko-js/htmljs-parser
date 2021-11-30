'use strict';

const {
    CODE_BACK_SLASH,
    CODE_DOLLAR,
    CODE_OPEN_CURLY_BRACE,
    CODE_EXCLAMATION,
} = require('./constants');

module.exports = class BaseState {
    constructor(parser, name) {
        this.parser = parser;
        this.name = name;
    }
    enter() {}
    expression() {}
    placeholder() {}
    eol() {}
    eof() {
        this.parser.htmlEOF();
    }
    char() {}
    checkForEscapedEscapedPlaceholder(ch, code) {
        var parser = this.parser;
        // Look for \\${ and \\$!{
        if (code === CODE_BACK_SLASH) {
            if (parser.lookAtCharCodeAhead(1) === CODE_BACK_SLASH) {
                if (parser.lookAtCharCodeAhead(2) === CODE_DOLLAR) {
                    if (parser.lookAtCharCodeAhead(3) === CODE_OPEN_CURLY_BRACE) {
                        return true;
                    } else if (parser.lookAtCharCodeAhead(3) === CODE_EXCLAMATION) {
                        if (parser.lookAtCharCodeAhead(4) === CODE_OPEN_CURLY_BRACE) {
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    }
    checkForPlaceholder(ch, code) {
        if (code !== CODE_DOLLAR) return false;

        var parser = this.parser;
        var nextCode = parser.lookAtCharCodeAhead(1);
        if (nextCode === CODE_OPEN_CURLY_BRACE) {
            // We expect to start a placeholder at the first curly brace (the next character)
            parser.beginPlaceholder(true);
            return true;
        } else if (nextCode === CODE_EXCLAMATION) {
            var afterExclamationCode = parser.lookAtCharCodeAhead(2);
            if (afterExclamationCode === CODE_OPEN_CURLY_BRACE) {
                // We expect to start a placeholder at the first curly brace so skip
                // past the exclamation point
                parser.beginPlaceholder(false);
                parser.skip(1);
                return true;
            }
        }

        return false;
    }
    checkForEscapedPlaceholder(ch, code) {
        if (code !== CODE_BACK_SLASH) return false;

        // Look for \${ and \$!{
        var parser = this.parser;
        if (parser.lookAtCharCodeAhead(1) === CODE_DOLLAR) {
            if (parser.lookAtCharCodeAhead(2) === CODE_OPEN_CURLY_BRACE) {
                return true;
            } else if (parser.lookAtCharCodeAhead(2) === CODE_EXCLAMATION) {
                if (parser.lookAtCharCodeAhead(3) === CODE_OPEN_CURLY_BRACE) {
                    return true;
                }
            }
        }

        return false;
    }
    toString() {
        return this.name;
    }
};
