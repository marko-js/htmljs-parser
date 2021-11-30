'use strict';

var {
    CODE_CLOSE_ANGLE_BRACKET,
    CODE_FORWARD_SLASH,
    CODE_PERIOD,
    CODE_NUMBER_SIGN,
    CODE_OPEN_PAREN,
    CODE_PIPE,
} = require('./constants');

const BaseState = require("./BaseState");
const TagArgsState = require('./TagArgsState');
const TagParamsState = require('./TagParamsState');

// We enter STATE_TAG_NAME after we encounter a "<"
// followed by a non-special character
module.exports = class TagNameShorthandState extends BaseState {
    constructor(parser) {
        super(parser, 'STATE_TAG_NAME_SHORTHAND');
    }
    eol() {
        const parser = this.parser;
        parser.currentOpenTag.tagNameEnd = parser.pos;
        parser.endTagNameShorthand();

        if (parser.state.name !== 'STATE_WITHIN_OPEN_TAG') {
            // Make sure we transition into parsing within the open tag
            parser.enterWithinOpenTagState();
        }

        if (parser.isConcise) {
            parser.openTagEOL();
        }
    }
    eof() {
        var parser = this.parser;
        parser.endTagNameShorthand();

        if (parser.isConcise) {
            parser.openTagEOF();
        } else {
            return parser.notifyError(parser.currentPart.pos,
                'INVALID_TAG_SHORTHAND',
                'EOF reached will parsing id/class shorthand in tag name');
        }
    }
    placeholder(placeholder) {
        var shorthand = this.parser.currentPart;
        shorthand.currentPart.addPlaceholder(placeholder);
    }
    char(ch, code) {
        const parser = this.parser;
        const ignorePlaceholders = this.parser.options.ignorePlaceholders;
        var shorthand = parser.currentPart;
        if (!parser.isConcise) {
            if (code === CODE_CLOSE_ANGLE_BRACKET || code === CODE_FORWARD_SLASH) {
                parser.currentOpenTag.tagNameEnd = parser.pos;
                parser.endTagNameShorthand();
                parser.rewind(1);
                return;
            }
        }

        if (parser.isWhitespaceCode(code)) {
            parser.endTagNameShorthand();
            parser.currentOpenTag.tagNameEnd = parser.pos;
            if (parser.state.name !== 'STATE_WITHIN_OPEN_TAG') {
                parser.enterWithinOpenTagState();
            }
            return;
        }

        if (code === CODE_PERIOD) {
            if (shorthand.currentPart) {
                shorthand.currentPart.end();
            }

            shorthand.beginPart('class');
        } else if (code === CODE_NUMBER_SIGN) {
            if (shorthand.hasId) {
                return parser.notifyError(parser.currentPart.pos,
                    'INVALID_TAG_SHORTHAND',
                    'Multiple shorthand ID parts are not allowed on the same tag');
            }

            shorthand.hasId = true;

            if (shorthand.currentPart) {
                shorthand.currentPart.end();
            }

            shorthand.beginPart('id');
        }
        else if (!ignorePlaceholders && this.checkForEscapedEscapedPlaceholder(ch, code)) {
            shorthand.currentPart.text += '\\';
            parser.skip(1);
        }  else if (!ignorePlaceholders && this.checkForEscapedPlaceholder(ch, code)) {
            shorthand.currentPart.text += '$';
            parser.skip(1);
        } else if (!ignorePlaceholders && this.checkForPlaceholder(ch, code)) {
            // We went into placeholder state...
        } else if (code === CODE_OPEN_PAREN) {
            parser.endTagNameShorthand();
            parser.rewind(1);
            parser.enterState(TagArgsState);
        } else if (code === CODE_PIPE) {
            parser.endTagNameShorthand();
            parser.rewind(1);
            parser.enterState(TagParamsState);
        } else {
            shorthand.currentPart.text += ch;
        }
    }
};
