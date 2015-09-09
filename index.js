
var Parser = require('./Parser');

function _isWhitespaceCode(code) {
    // For all practical purposes, the space character (32) and all the
    // control characters below it are whitespace.
    // NOTE: This might be slightly non-conforming.
    return (code <= 32);
}

var CODE_BACK_SLASH = 92;
var CODE_FORWARD_SLASH = 47;
var CODE_LEFT_ANGLE_BRACKET = 60;
var CODE_RIGHT_ANGLE_BRACKET = 62;
var CODE_EXCLAMATION = 33;
var CODE_QUESTION = 63;
var CODE_LEFT_SQUARE_BRACKET = 91;
var CODE_RIGHT_SQUARE_BRACKET = 93;
var CODE_EQUAL = 61;
var CODE_SINGLE_QUOTE = 39;
var CODE_DOUBLE_QUOTE = 34;
var CODE_LEFT_PARANTHESIS = 40;
var CODE_RIGHT_PARANTHESIS = 41;
var CODE_LEFT_CURLY_BRACE = 123;
var CODE_RIGHT_CURLY_BRACE = 125;
var CODE_ASTERISK = 42;
var CODE_NEWLINE = 10;
var CODE_DASH = 45;
var CODE_DOLLAR = 36;

exports.createParser = function(listeners, options) {

    var parser = new Parser(options);

    var tagName;
    var text = '';
    var comment;
    var attribute;
    var attributes;

    function _notifyText(txt) {
        if (listeners.ontext && (txt.length > 0)) {
            listeners.ontext({
                type: 'text',
                text: txt
            });
        }

        // always clear text buffer...
        text =  '';
    }

    function _notifyCDATA(txt) {
        if (listeners.ontext && (txt.length > 0)) {
            listeners.ontext({
                type: 'text',
                text: txt,
                cdata: true
            });
        }

        // always clear text buffer...
        text =  '';
    }

    function _notifyOpenTag(name, attributes, selfClosed) {
        if (listeners.onopentag) {
            var event = {
                type: 'opentag',
                name: name,
                attributes: attributes
            };

            if (selfClosed) {
                event.selfClosed = true;
            }

            listeners.onopentag.call(parser, event);
        }
    }

    function _notifyCloseTag(name, selfClosed) {
        if (listeners.onclosetag) {
            var event = {
                type: 'closetag',
                name: name
            };

            if (selfClosed) {
                event.selfClosed = true;
            }

            listeners.onclosetag.call(parser, event);
        }
    }

    function _notifyDTD(name) {
        if (listeners.ondtd) {
            listeners.ondtd({
                type: 'dtd',
                name: name
            });
        }
    }

    function _notifyDeclaration(name) {
        if (listeners.ondeclaration) {
            listeners.ondeclaration.call(parser, {
                type: 'declaration',
                name: name
            });
        }
    }

    function _notifyComment(comment) {
        if (listeners.oncomment) {
            listeners.oncomment.call(parser, {
                type: 'comment',
                comment: comment
            });
        }
    }

    function _notifyPlaceholder(txt, prefix) {
        if (listeners.onplaceholder) {
            var contents = txt.substring(prefix.length, txt.length - 1);

            listeners.onplaceholder.call(parser, {
                type: 'placeholder',
                contents: contents,
                prefix: prefix,
                suffix: '}'
            });
        }

        text = '';
    }

    function _attribute() {
        attribute = {};
        attributes.push(attribute);
        return attribute;
    }

    function _attributesToText() {
        text = '';
        for (var i = 0; i < attributes.length; i++) {
            var attr = attributes[i];
            text += ' ' + attr.name;
            if (attr.value !== undefined) {
                text += '=' + attr.value;
            }
        }
        return text;
    }

    function _afterOpenTag() {
        var origState = parser.state;

        _notifyOpenTag(tagName, attributes);

        // Was the parser transitioned into a new state as a result
        // of notifying listeners about opentag?
        if (parser.state === origState) {
            // The listener didn't transition the parser to a new state
            // so we use some simple rules to find the appropriate state.
            if (tagName === 'script') {
                parser.enterJsContentState();
            } else if (tagName === 'style') {
                parser.enterCssContentState();
            } else {
                parser.enterHtmlContentState();
            }
        }
    }

    function _afterSelfClosingTag() {
        _notifyOpenTag(tagName, attributes, true /* selfClosed */);
        _notifyCloseTag(tagName, true /* selfClosed */);
        parser.enterHtmlContentState();
    }

    // This is a simple stack that we use to handle parsing
    // expressions within expressions. When we start parsing
    // a delimited expression then we keep track of the start
    // and end delimiter. We use this for the following types
    // of expressions:
    // - Strings - "..." and '...'
    // - Arrays - [...]
    // - Paranthetic - (...)
    // - Object/Block - {...}
    var expressionStack = [];
    var expressionStartDelimiter;
    var expressionEndDelimiter;
    var expressionDepth;

    var commentHandler;
    var endTagName;

    function _enterStringState(ch, delimiter, stringState) {
        ___enterExpressionState(ch, delimiter, delimiter, stringState);
    }

    function _leaveStringState() {
        _leaveDelimitedExpressionState();
    }

    function _enterDelimitedExpressionState(startCh, startDelimiter, endDelimiter) {
        ___enterExpressionState(startCh, startDelimiter, endDelimiter, STATE_ATTRIBUTE_VALUE_DELIMITED_EXPRESSION);
    }

    function ___enterExpressionState(startCh, startDelimiter, endDelimiter, newState) {
        var top;

        var len = expressionStack.length;
        if (len > 0) {
            top = expressionStack[len - 1];
            top.depth = expressionDepth;
        }

        top = {
            parentState: parser.state
        };

        expressionDepth = 1;

        expressionStack.push(top);

        top.startDelimiter = expressionStartDelimiter = startDelimiter;
        top.endDelimiter = expressionEndDelimiter = endDelimiter;

        parser.enterState(newState);
    }

    function _leaveDelimitedExpressionState() {
        var top = expressionStack.pop();
        parser.enterState(top.parentState);

        var len = expressionStack.length;
        if (len > 0) {
            top = expressionStack[len - 1];
            expressionStartDelimiter = top.startDelimiter;
            expressionEndDelimiter = top.endDelimiter;
            expressionDepth = top.depth;
        } else {
            expressionStartDelimiter = undefined;
            expressionEndDelimiter = undefined;
            expressionDepth = undefined;
        }
    }

    function _enterBlockCommentState() {
        commentHandler = parser.state.comment;
        commentHandler.char('/*');
        parser.enterState(STATE_BLOCK_COMMENT);
    }

    function _enterLineCommentState() {
        commentHandler = parser.state.comment;
        commentHandler.char('//');
        parser.enterState(STATE_LINE_COMMENT);
    }

    function _checkForContentPlaceholder(ch, code) {
        if (code === CODE_DOLLAR) {
            var nextCode = parser.lookAtCharCodeAhead(1);
            if (nextCode === CODE_LEFT_CURLY_BRACE) {
                parser.skip(1);
                STATE_CONTENT_PLACEHOLDER.handle('${');
                return true;
            } else if (nextCode === CODE_EXCLAMATION) {
                var afterExclamationCode = parser.lookAtCharCodeAhead(2);
                if (afterExclamationCode === CODE_LEFT_CURLY_BRACE) {
                    parser.skip(2);
                    STATE_CONTENT_PLACEHOLDER.handle('$!{');
                    return true;
                }
            }
        }
    }

    function _checkForClosingTag() {
        // Look ahead to see if we found the closing tag that will
        // take us out of the EXPRESSION state...
        var match = parser.lookAheadFor('/' + endTagName + '>');
        if (match) {
            parser.skip(match.length);

            _notifyText(text);
            _notifyCloseTag(endTagName);

            parser.enterHtmlContentState();
            return true;
        }
    }

    var cdataParentState;

    function _checkForCDATA(ch) {
        var match = parser.lookAheadFor('![CDATA[');
        if (match) {
            parser.skip(match.length);

            _notifyText(text);

            cdataParentState = parser.state;
            parser.enterState(STATE_CDATA);
            return true;
        }
    }

    var CONTENT_eof = function() {
        _notifyText(text);
    };

    // In STATE_HTML_CONTENT we are looking for tags and placeholders but
    // everything in between is treated as text.
    var STATE_HTML_CONTENT = Parser.createState({
        name: 'STATE_HTML_CONTENT',

        eof: CONTENT_eof,

        char: function(ch, code) {
            if (code === CODE_LEFT_ANGLE_BRACKET) {
                if (_checkForCDATA()) {
                    return;
                }

                _notifyText(text);
                parser.enterState(STATE_START_BEGIN_ELEMENT);
            } else if (_checkForContentPlaceholder(ch, code)) {
                // STATE_CONTENT_PLACEHOLDER.handle was called which
                // called _notifyText
            } else {
                text += ch;
            }
        }
    });

    // We enter STATE_TEXT_CONTENT when a listener manually chooses
    // to enter this state after seeing an opentag event for a tag
    // whose content should not be parsed at all (except for the purpose
    // of looking for the end tag).
    var STATE_TEXT_CONTENT = Parser.createState({
        name: 'STATE_TEXT_CONTENT',

        enter: function() {
            // The end tag that we are looking for is the last tag
            // name that we saw
            endTagName = tagName;
        },

        eof: CONTENT_eof,

        char: function(ch, code) {
            // First, see if we need to see if we reached the closing tag...
            if (code === CODE_LEFT_ANGLE_BRACKET) {
                if (_checkForClosingTag()) {
                    return true;
                }
            }

            text += ch;
        }
    });

    // We enter STATE_JS_CONTENT when we are parsing the body of a tag
    // that contains JavaScript code.
    var STATE_JS_CONTENT = Parser.createState({
        name: 'STATE_JS_CONTENT',
        comment: {
            eof: function() {
                _notifyText(text);
            },

            end: function() {
                // go back to the JAVASCRIPT_CONTENT state
                parser.enterState(STATE_JS_CONTENT);
            },

            char: function(ch) {
                text += ch;
            }
        },

        eof: CONTENT_eof,

        char: function(ch, code) {
            var nextCode;

            // First, see if we need to see if we reached the closing tag...
            if (code === CODE_LEFT_ANGLE_BRACKET) {
                if (_checkForClosingTag()) {
                    return;
                } else if (_checkForCDATA) {
                    return;
                }
            } else if ((code === CODE_SINGLE_QUOTE) || (code === CODE_DOUBLE_QUOTE)) {
                // add the character to our buffer
                text += ch;

                // switch to string state
                _enterStringState(ch, code, STATE_STRING_IN_CONTENT);
                return;
            } else if (code === CODE_FORWARD_SLASH) {
                // Check next character to see if we are in a comment
                nextCode = parser.lookAtCharCodeAhead(1);
                if (nextCode === CODE_FORWARD_SLASH) {
                    parser.skip(1);
                    return _enterLineCommentState();
                } else if (nextCode === CODE_ASTERISK) {
                    parser.skip(1);
                    return _enterBlockCommentState();
                }
            } else if (_checkForContentPlaceholder(ch, code)) {
                // STATE_CONTENT_PLACEHOLDER.handle was called which
                // called _notifyText
                return;
            }

            text += ch;
        }
    });

    // We enter STATE_CSS_CONTENT when we are parsing the body of a tag
    // that contains CSS code.
    var STATE_CSS_CONTENT = Parser.createState({
        name: 'STATE_CSS_CONTENT',
        comment: {
            eof: function() {
                _notifyText(text);
            },

            end: function() {
                // go back to the STATE_CSS_CONTENT state
                parser.enterState(STATE_CSS_CONTENT);
            },

            char: function(ch) {
                text += ch;
            }
        },

        eof: CONTENT_eof,

        char: function(ch, code) {
            var nextCode;

            // First, see if we need to see if we reached the closing tag...
            if (code === CODE_LEFT_ANGLE_BRACKET) {
                if (_checkForClosingTag()) {
                    return;
                } else if (_checkForCDATA) {
                    return;
                }
            } else if ((code === CODE_SINGLE_QUOTE) || (code === CODE_DOUBLE_QUOTE)) {
                // add the character to our buffer
                text += ch;

                // switch to string state
                _enterStringState(ch, code, STATE_STRING_IN_CONTENT);
                return;
            } else if (code === CODE_FORWARD_SLASH) {
                // Check next character to see if we are in a comment...
                // CSS content only allows /* */ comments
                nextCode = parser.lookAtCharCodeAhead(1);
                if (nextCode === CODE_ASTERISK) {
                    parser.skip(1);
                    return _enterBlockCommentState();
                }
            } else if (_checkForContentPlaceholder(ch, code)) {
                // STATE_CONTENT_PLACEHOLDER.handle was called which
                // called _notifyText
                return;
            }

            text += ch;
        }
    });

    // State that we enter just after seeing a "<"
    var STATE_START_BEGIN_ELEMENT = Parser.createState({
        name: 'STATE_START_BEGIN_ELEMENT',
        enter: function() {
            tagName = '';
        },

        eof: function() {
            // Encountered a "<" at the end of the data
            _notifyText('<');
        },

        char: function(ch, code) {
            if (code === CODE_EXCLAMATION) {
                // something like:
                // <!DOCTYPE html>
                // <!-- comment
                // NOTE: We already checked for CDATA earlier

                // Look ahead to see if it is comment...
                var match = parser.lookAheadFor('--');
                if (match) {
                    // Found XML comment
                    parser.skip(2);
                    parser.enterState(STATE_XML_COMMENT);
                } else {
                    parser.enterState(STATE_DTD);
                }
            } else if (code === CODE_QUESTION) {
                // something like:
                // <?xml version="1.0"?>
                parser.enterState(STATE_DECLARATION);
            } else if (code === CODE_FORWARD_SLASH) {
                // something like:
                // </html>
                parser.enterState(STATE_END_ELEMENT);
            } else if (code === CODE_RIGHT_ANGLE_BRACKET) {
                // something like:
                // <>
                // We'll treat this as text
                _notifyText('<>');

                parser.enterHtmlContentState();
            } else if (code === CODE_LEFT_ANGLE_BRACKET) {
                // found something like:
                // ><
                // We'll treat the stray ">" as text and stay in
                // the START_BEGIN_ELEMENT since we saw a new "<"
                _notifyText('<');
            } else if (_isWhitespaceCode(code)) {
                // Found something like "< "
                _notifyText('<' + ch);

                parser.enterHtmlContentState();
            } else {
                tagName += ch;

                // just a normal element...
                parser.enterState(STATE_ELEMENT_NAME);
            }
        }
    });

    // We enter the ELEMENT_NAME state after we encounter a "<"
    // followed by a non-special character
    var STATE_ELEMENT_NAME = Parser.createState({
        name: 'STATE_ELEMENT_NAME',
        enter: function() {
            // reset attributes collection when we enter new element
            attributes = [];
        },

        eof: function() {
            // Data ended with an improperly opened tag
            _notifyText('<' + tagName);
        },

        char: function(ch, code) {
            if (code === CODE_RIGHT_ANGLE_BRACKET) {
                _afterOpenTag();
            } else if (code === CODE_FORWARD_SLASH) {
                var nextCode = parser.lookAtCharCodeAhead(1);
                parser.skip(1);

                if (nextCode === CODE_RIGHT_ANGLE_BRACKET) {
                    // we found a self-closing tag
                    _afterSelfClosingTag();
                } else {
                    parser.enterState(STATE_WITHIN_ELEMENT);
                }
            } else if (_isWhitespaceCode(code)) {
                parser.enterState(STATE_WITHIN_ELEMENT);
            } else {
                tagName += ch;
            }
        }
    });

    // We enter the CDATA state after we see "<![CDATA["
    var STATE_CDATA = Parser.createState({
        name: 'STATE_CDATA',

        eof: function() {
            // Not a properly delimited CDATA so
            // just include the CDATA prefix in the
            // text notification
            _notifyText('<![CDATA[' + text);
        },

        char: function(ch, code) {
            if (code === CODE_RIGHT_SQUARE_BRACKET) {
                var match = parser.lookAheadFor(']>');
                if (match) {
                    _notifyCDATA(text);

                    parser.skip(match.length);

                    parser.enterState(cdataParentState);
                }
            } else {
                text += ch;
            }
        }
    });

    // We enter the END_ELEMENT state after we see "</"
    var STATE_END_ELEMENT = Parser.createState({
        name: 'STATE_END_ELEMENT',
        eof: function() {
            // Data ended with an improperly closed tag
            _notifyText('</' + tagName);
        },

        char: function(ch, code) {
            if (code === CODE_RIGHT_ANGLE_BRACKET) {
                if (tagName.length > 0) {
                    _notifyCloseTag(tagName);
                } else {
                    // Treat </> as text block...
                    _notifyText('</>');
                }

                parser.enterState(STATE_HTML_CONTENT);
            } else {
                tagName += ch;
            }
        }
    });

    // We enter the WITHIN_ELEMENT state after we have fully
    // read in the tag name and encountered a whitespace character
    var STATE_WITHIN_ELEMENT = Parser.createState({
        name: 'STATE_WITHIN_ELEMENT',
        eof: function() {
            var text = '<' + tagName + _attributesToText(attributes);
            _notifyText(text);
        },

        char: function(ch, code) {
            if (code === CODE_RIGHT_ANGLE_BRACKET) {
                _afterOpenTag();
            } else if (code === CODE_FORWARD_SLASH) {
                var nextCode = parser.lookAtCharCodeAhead(1);
                if (nextCode === CODE_RIGHT_ANGLE_BRACKET) {
                    parser.skip(1);
                    _afterSelfClosingTag();
                }
            } else if (_isWhitespaceCode(code)) {
                // ignore whitespace within element...
            } else {
                // attribute name is initially the first non-whitespace
                // character that we found
                _attribute().name = ch;
                parser.enterState(STATE_ATTRIBUTE_NAME);
            }
        }
    });

    // We enter the ATTRIBUTE_NAME state when we see a non-whitespace
    // character after reading the tag name
    var STATE_ATTRIBUTE_NAME = Parser.createState({
        name: 'STATE_ATTRIBUTE_NAME',
        eof: function() {
            STATE_WITHIN_ELEMENT.eof();
        },

        char: function(ch, code) {
            if (code === CODE_EQUAL) {
                attribute.value = '';
                parser.enterState(STATE_ATTRIBUTE_VALUE);
            } else if (code === CODE_RIGHT_ANGLE_BRACKET) {
                _afterOpenTag();
            } else if (code === CODE_FORWARD_SLASH) {
                var nextCode = parser.lookAtCharCodeAhead(1);
                if (nextCode === CODE_RIGHT_ANGLE_BRACKET) {
                    // we found a self-closing tag
                    parser.skip(1);
                    _afterSelfClosingTag();
                } else {
                    // ignore the extra "/" and stop looking
                    // for attribute value
                    parser.enterState(STATE_WITHIN_ELEMENT);
                }
            } else if (_isWhitespaceCode(code)) {
                // when whitespace is encountered then we complete
                // the current attribute and don't bother looking
                // for attribute value
                parser.enterState(STATE_WITHIN_ELEMENT);
            } else {
                attribute.name += ch;
            }
        }
    });

    var ATTRIBUTE_VALUE_HANDLER = {
        eof: function() {
            STATE_WITHIN_ELEMENT.eof();
        },

        end: function() {
            // If we reach the end of the string then return
            // back to the ATTRIBUTE_VALUE state
            parser.enterState(STATE_ATTRIBUTE_VALUE);
        },

        char: function(ch) {
            // char will be called for each character in the
            // string (including the delimiters)
            attribute.value += ch;
        }
    };

    // We enter the ATTRIBUTE_VALUE state when we see a "=" while in
    // the ATTRIBUTE_NAME state.
    var STATE_ATTRIBUTE_VALUE = Parser.createState({
        name: 'STATE_ATTRIBUTE_VALUE',
        // We go into the LINE_COMMENT or BLOCK_COMMENT sub-state
        // when we see a // or /* character sequence while parsing
        // an attribute value.
        // The LINE_COMMENT or BLOCK_COMMENT state will bubble some
        // events up to the parent state.
        comment: ATTRIBUTE_VALUE_HANDLER,

        placeholder: {
            char: function(){

            },

            end: function() {

            }
        },

        eof: function() {
            STATE_WITHIN_ELEMENT.eof();
        },

        char: function(ch, code) {
            if (code === CODE_RIGHT_ANGLE_BRACKET) {
                _afterOpenTag();
            } else if (code === CODE_FORWARD_SLASH) {
                var nextCode = parser.lookAtCharCodeAhead(1);
                if (nextCode === CODE_RIGHT_ANGLE_BRACKET) {
                    // we found a self-closing tag
                    _afterSelfClosingTag();
                    parser.skip(1);
                } else if (nextCode === CODE_ASTERISK) {
                    parser.skip(1);
                    _enterBlockCommentState();
                } else {
                    // we encountered a "/" but it wasn't followed
                    // by a ">" so continue
                    attribute.value += ch;
                }
            } else if ((code === CODE_SINGLE_QUOTE) || (code === CODE_DOUBLE_QUOTE)) {
                attribute.value += ch;
                _enterStringState(ch, code, STATE_STRING_IN_ATTRIBUTE_VALUE);
            } else if (code === CODE_LEFT_PARANTHESIS) {
                attribute.value += ch;
                _enterDelimitedExpressionState(ch, code, CODE_RIGHT_PARANTHESIS);
            } else if (code === CODE_LEFT_CURLY_BRACE) {
                attribute.value += ch;
                _enterDelimitedExpressionState(ch, code, CODE_RIGHT_CURLY_BRACE);
            } else if (code === CODE_LEFT_SQUARE_BRACKET) {
                attribute.value += ch;
                _enterDelimitedExpressionState(ch, code, CODE_RIGHT_SQUARE_BRACKET);
            } else if (_isWhitespaceCode(code)) {
                parser.enterState(STATE_WITHIN_ELEMENT);
            } else {
                attribute.value += ch;
            }
        }
    });

    // We enter the STRING state after we encounter a single or double
    // quote character while in the ATTRIBUTE_VALUE or EXPRESSION state.
    var STATE_STRING_IN_ATTRIBUTE_VALUE = Parser.createState({
        name: 'STATE_STRING_IN_ATTRIBUTE_VALUE',
        eof: function() {
            STATE_WITHIN_ELEMENT.eof();
        },

        char: function(ch, code) {
            if (code === expressionEndDelimiter) {
                attribute.value += ch;
                _leaveStringState();
            } else {
                attribute.value += ch;
            }
        }
    });

    // We enter the DELIMITED_EXPRESSION state after we see an
    // expression delimiter while in the ATTRIBUTE_VALUE
    // state. The expression delimiters are the following: ({[
    var STATE_ATTRIBUTE_VALUE_DELIMITED_EXPRESSION = Parser.createState({
        name: 'STATE_ATTRIBUTE_VALUE_DELIMITED_EXPRESSION',
        // We go into the LINE_COMMENT or BLOCK_COMMENT sub-state
        // when we see a // or /* character sequence while parsing
        // an expression.
        // The LINE_COMMENT or BLOCK_COMMENT state will bubble some
        // events up to the parent state.
        comment: {
            eof: function() {
                STATE_ATTRIBUTE_VALUE.eof();
            },

            end: function() {
                // If we reach the end of the comment then return
                // back to the original expression state
                parser.enterState(STATE_ATTRIBUTE_VALUE_DELIMITED_EXPRESSION);
            },

            char: function(ch) {
                attribute.value += ch;
            }
        },

        eof: function() {
            STATE_ATTRIBUTE_VALUE.eof();
        },

        char: function(ch, code) {

            if ((code === CODE_SINGLE_QUOTE) || (code === CODE_DOUBLE_QUOTE)) {
                // string
                attribute.value += ch;
                _enterStringState(ch, code, STATE_STRING_IN_ATTRIBUTE_VALUE);
                return;
            } else if (code === CODE_FORWARD_SLASH) {
                // Check next character to see if we are in a comment
                var nextCode = parser.lookAtCharCodeAhead(1);
                if (nextCode === CODE_FORWARD_SLASH) {
                    _enterLineCommentState();
                    parser.skip(1);
                    return;
                } else if (nextCode === CODE_ASTERISK) {
                    _enterBlockCommentState();
                    parser.skip(1);
                    return;
                }
            }

            attribute.value += ch;

            if (code === expressionEndDelimiter) {
                expressionDepth--;

                if (expressionDepth === 0) {
                    _leaveDelimitedExpressionState();
                }

            } else if (code === expressionStartDelimiter) {
                expressionDepth++;
            }
        }
    });

    var contentPlaceholderParentState;
    var placeholderPrefix;
    var placeholderDepth;


    var STATE_CONTENT_PLACEHOLDER = Parser.createState({
        name: 'STATE_CONTENT_PLACEHOLDER',
        comment: {
            eof: function() {
                _notifyText(text);
            },

            end: function() {
                // If we reach the end of the comment then return
                // back to the original state
                parser.enterState(contentPlaceholderParentState);
            },

            char: function(ch) {
                text += ch;
            }
        },

        eof: function() {
            _notifyText(text);
        },

        handle: function(prefix) {
            // emit the current content text that has been collected
            _notifyText(text);

            contentPlaceholderParentState = parser.state;
            placeholderDepth = 1;
            text = placeholderPrefix = prefix;
            parser.enterState(this);
        },

        char: function(ch, code) {
            if ((code === CODE_SINGLE_QUOTE) || (code === CODE_DOUBLE_QUOTE)) {
                // single-quoted string
                _enterStringState(ch, code, STATE_STRING_IN_CONTENT_PLACEHOLDER);
                return true;
            } else if (code === CODE_FORWARD_SLASH) {
                // Check next character to see if we are in a comment
                var nextCode = parser.lookAtCharCodeAhead(1);
                if (nextCode === CODE_FORWARD_SLASH) {
                    _enterLineCommentState();
                    parser.skip(1);
                    return true;
                } else if (nextCode === CODE_ASTERISK) {
                    _enterBlockCommentState();
                    parser.skip(1);
                    return true;
                }
            } else if (code === CODE_RIGHT_CURLY_BRACE){
                text += ch;

                placeholderDepth--;
                if (placeholderDepth === 0) {
                    // end of placeholder
                    _notifyPlaceholder(text, placeholderPrefix);
                    parser.enterState(contentPlaceholderParentState);
                }
            } else if (code === CODE_LEFT_CURLY_BRACE){
                placeholderDepth++;
                text += ch;
            } else {
                text += ch;
            }
        }
    });

    var STATE_STRING_IN_CONTENT_PLACEHOLDER = Parser.createState({
        name: 'STATE_STRING_IN_CONTENT_PLACEHOLDER',
        eof: function() {
            _notifyText(text);
        },

        char: function(ch, code) {
            var nextCh;
            if (code === CODE_BACK_SLASH) {
                // Handle string escape sequence
                nextCh = parser.lookAtCharAhead(1);
                parser.skip(1);

                text += ch + nextCh;
            } else if ((code === expressionEndDelimiter) || (code === CODE_NEWLINE)) {
                text += ch;
                _leaveStringState();
            } else {
                text += ch;
            }
        }
    });

    // We enter the STATE_STRING_IN_CONTENT state after we encounter a single or double
    // quote character while in JavaScript or CSS content.
    var STATE_STRING_IN_CONTENT = Parser.createState({
        name: 'STATE_STRING_IN_CONTENT',
        eof: function() {
            _notifyText(text);
        },

        char: function(ch, code) {
            var nextCh;
            if (code === CODE_BACK_SLASH) {
                // Handle string escape sequence
                nextCh = parser.lookAtCharAhead(1);
                parser.skip(1);

                text += ch + nextCh;
            } else if ((code === expressionEndDelimiter) || (code === CODE_NEWLINE)) {
                text += ch;
                _leaveStringState();
            } else if (_checkForContentPlaceholder(ch, code)) {
                // STATE_CONTENT_PLACEHOLDER.handle was called which
                // called _notifyText
            } else {
                text += ch;
            }
        }
    });

    // We enter the BLOCK_COMMENT state after we encounter a "/*" sequence
    // while in the ATTRIBUTE_VALUE or EXPRESSION state.
    // We leave the BLOCK_COMMENT state when we see a "*/" sequence.
    var STATE_BLOCK_COMMENT = Parser.createState({
        name: 'STATE_BLOCK_COMMENT',
        eof: function() {
            commentHandler.eof();
        },

        char: function(ch, code) {
            if (code === CODE_ASTERISK) {
                commentHandler.char(ch);
                var nextCode = parser.lookAtCharCodeAhead(1);
                if (nextCode === CODE_FORWARD_SLASH) {
                    parser.skip(1);
                    commentHandler.char('/');
                    commentHandler.end();
                }
            } else {
                commentHandler.char(ch);
            }
        }
    });

    // We enter the LINE_COMMENT state after we encounter a "//" sequence
    // while in the EXPRESSION state.
    // We leave the LINE_COMMENT state when we see a newline character.
    var STATE_LINE_COMMENT = Parser.createState({
        name: 'STATE_LINE_COMMENT',
        eof: function() {
            commentHandler.eof();
        },

        char: function(ch, code) {
            // TODO: Not checking for end tag is slightly non-conforming
            //       Should we check for end tag while in comment?
            //       Might be necessary to handle something like this:
            //       <script>// this is a test</script>
            // if (code === CODE_LEFT_ANGLE_BRACKET) {
            //     var match = parser.lookAheadFor('/' + endTagName + '>');
            //     if (match) {
            //         parser.skip(match.length);
            //         _notifyText(text);
            //         _notifyCloseTag(endTagName);
            //         return parser.enterState(STATE_HTML_CONTENT);
            //     }
            // }

            commentHandler.char(ch);

            if (code === CODE_NEWLINE) {
                commentHandler.end();
            }
        }
    });

    // We enter the DTD state after we encounter a "<!" while in the
    // HTML state.
    // We leave the DTD state if we see a ">".
    var STATE_DTD = Parser.createState({
        name: 'STATE_DTD',
        enter: function() {
            tagName = '';
        },

        eof: function() {
            _notifyText('<!' + tagName);
        },

        char: function(ch, code) {
            if (code === CODE_RIGHT_ANGLE_BRACKET) {
                _notifyDTD(tagName);
                parser.enterState(STATE_HTML_CONTENT);
            } else {
                tagName += ch;
            }
        }
    });

    // We enter the DECLARATION state after we encounter a "<?"
    // while in the HTML state.
    // We leave the DECLARATION state if we see a "?>" or ">".
    var STATE_DECLARATION = Parser.createState({
        name: 'STATE_DECLARATION',
        enter: function() {
            tagName = '';
        },

        leave: function(){
            _notifyDeclaration(tagName);
        },

        eof: function() {
            _notifyText('<?' + tagName);
        },

        char: function(ch, code) {
            if (code === CODE_QUESTION) {
                var nextCode = parser.lookAtCharCodeAhead(1);
                if (nextCode === CODE_RIGHT_ANGLE_BRACKET) {
                    parser.skip(1);
                    parser.enterState(STATE_HTML_CONTENT);
                }
            } else if (code === CODE_RIGHT_ANGLE_BRACKET) {
                parser.enterState(STATE_HTML_CONTENT);
            } else {
                tagName += ch;
            }
        }
    });

    // We enter the XML_COMMENT state after we encounter a "<--"
    // while in the HTML state.
    // We leave the XML_COMMENT state if we see a "-->".
    var STATE_XML_COMMENT = Parser.createState({
        name: 'STATE_XML_COMMENT',
        enter: function() {
            comment = '';
        },

        eof: function() {
            _notifyComment(comment);
        },

        char: function(ch, code) {
            if (code === CODE_DASH) {
                var match = parser.lookAheadFor('->');
                if (match) {
                    _notifyComment(comment);

                    parser.skip(match.length);
                    parser.enterState(STATE_HTML_CONTENT);
                } else {
                    comment += ch;
                }
            } else {
                comment += ch;
            }
        }
    });

    parser.enterHtmlContentState = function() {
        parser.enterState(STATE_HTML_CONTENT);
    };

    parser.enterJsContentState = function() {
        endTagName = tagName;
        parser.enterState(STATE_JS_CONTENT);
    };

    parser.enterCssContentState = function() {
        endTagName = tagName;
        parser.enterState(STATE_CSS_CONTENT);
    };

    parser.enterTextContentState = function() {
        endTagName = tagName;
        parser.enterState(STATE_TEXT_CONTENT);
    };

    parser.setInitialState(STATE_HTML_CONTENT);

    return parser;
};
