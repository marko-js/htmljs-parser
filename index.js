
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
        if (listeners.ontext && txt) {
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

    function _notifyBeginComment() {
        if (listeners.onbegincomment) {
            listeners.onbegincomment.call(parser, {
                type: 'begincomment'
            });
        }
    }

    function _notifyCommentText(txt) {
        if (listeners.oncomment && txt) {
            listeners.oncomment.call(parser, {
                type: 'comment',
                comment: txt
            });
        }
        comment = '';
    }

    function _notifyEndComment(comment) {
        if (listeners.onendcomment) {
            listeners.onendcomment.call(parser, {
                type: 'endcomment'
            });
        }
    }

    function _notifyPlaceholder(placeholder) {
        var eventFunc = listeners['on' + placeholder.type];
        if (eventFunc) {
            // remove unnecessary properties
            ['stringDelimiter', 'delimiterDepth', 'parentState', 'handler']
                .forEach(function(key) {
                    delete placeholder[key];
                });
            eventFunc.call(parser, placeholder);
        }
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
            if (attr.expression !== undefined) {
                text += '=' + attr.expression;
            }
        }
        return text;
    }

    function _afterOpenTag() {
        var origState = parser.state;

        _notifyOpenTag(tagName, attributes);

        // Did the parser stay in the same state after
        // notifying listeners about opentag?
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
    var currentExpression;

    var commentHandler;
    var endTagName;

    function _enterStringState(ch, delimiter, newStringState) {
        ___enterExpressionState(ch, delimiter, delimiter, newStringState);
    }

    function _leaveStringState() {
        _leaveDelimitedExpressionState();
    }

    function _enterDelimitedExpressionState(startCh, startDelimiter, endDelimiter) {
        ___enterExpressionState(startCh, startDelimiter, endDelimiter, STATE_ATTRIBUTE_VALUE_DELIMITED_EXPRESSION);
    }

    function ___enterExpressionState(startCh, startDelimiter, endDelimiter, newState) {
        currentExpression = {
            parentState: parser.state,
            depth: 1,
            startDelimiter: startDelimiter,
            endDelimiter: endDelimiter
        };

        expressionStack.push(currentExpression);

        parser.enterState(newState);
    }

    function _leaveDelimitedExpressionState() {
        var top = expressionStack.pop();

        var len = expressionStack.length;
        if (len > 0) {
            currentExpression = expressionStack[len - 1];
        } else {
            currentExpression = null;
        }

        parser.enterState(top.parentState);
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

    var placeholderStack = [];
    var currentPlaceholder;

    function _enterPlaceholderState(placeholder) {
        var currentState = parser.state;

        // Set the event type...
        // This property is used so that the placeholder
        // can be emitted as an event.
        placeholder.delimiterDepth = 1;
        placeholder.parentState = currentState;
        placeholder.contents = '';
        placeholder.handler = currentState.placeholder;

        var len = placeholderStack.length;
        if (len) {
            var top = placeholderStack[len - 1];
            if (top.ancestorEscaped) {
                placeholder.ancestorEscaped = true;
                placeholder.escape = false;
            }

            placeholder.type = top.type;
        } else {
            placeholder.type = placeholder.handler.type;
        }

        placeholderStack.push(placeholder);

        currentPlaceholder = placeholder;

        parser.enterState(STATE_PLACEHOLDER);
    }

    function _leavePlaceholderState(placeholder) {
        var top = placeholderStack.pop();
        var newState = top.parentState;

        var len = placeholderStack.length;
        if (len) {
            currentPlaceholder = placeholderStack[len - 1];
        } else {
            currentPlaceholder = null;
        }

        top.handler.end(top);

        parser.enterState(newState);
    }

    function _checkForPlaceholder(ch, code, stringDelimiter) {
        if (code === CODE_DOLLAR) {
            var nextCode = parser.lookAtCharCodeAhead(1);
            if (nextCode === CODE_LEFT_CURLY_BRACE) {
                parser.skip(1);
                _enterPlaceholderState({
                    escape: true,
                    stringDelimiter: stringDelimiter
                });
                return true;
            } else if (nextCode === CODE_EXCLAMATION) {
                var afterExclamationCode = parser.lookAtCharCodeAhead(2);
                if (afterExclamationCode === CODE_LEFT_CURLY_BRACE) {
                    parser.skip(2);
                    _enterPlaceholderState({
                        escape: false,
                        stringDelimiter: stringDelimiter
                    });
                    return true;
                }
            }
        }
    }

    function _buildConcatenatedString(str, placeholder, stringDelimiter) {
        stringDelimiter = String.fromCharCode(stringDelimiter);
        return str +  stringDelimiter + '+' + '(' + placeholder.contents + ')+' + stringDelimiter;
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

        placeholder: {
            type: 'contentplaceholder',

            end: function(placeholder) {
                _notifyText(text);
                _notifyPlaceholder(placeholder);
            },

            eof: function() {
                // TODO: implement this
            }
        },

        char: function(ch, code) {
            if (code === CODE_LEFT_ANGLE_BRACKET) {
                if (_checkForCDATA()) {
                    return;
                }

                var match = parser.lookAheadFor('!--');
                if (match) {
                    parser.skip(match.length);

                    _notifyText(text);

                    cdataParentState = parser.state;

                    _notifyBeginComment();

                    parser.enterState(STATE_XML_COMMENT);
                    return;
                }

                _notifyText(text);
                parser.enterState(STATE_START_BEGIN_ELEMENT);
            } else if (_checkForPlaceholder(ch, code)) {
                // We went into placeholder state...
            } else {
                text += ch;
            }
        }
    });

    // We enter STATE_STATIC_TEXT_CONTENT when a listener manually chooses
    // to enter this state after seeing an opentag event for a tag
    // whose content should not be parsed at all (except for the purpose
    // of looking for the end tag).
    var STATE_STATIC_TEXT_CONTENT = Parser.createState({
        name: 'STATE_STATIC_TEXT_CONTENT',

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
                    return;
                }
            }

            text += ch;
        }
    });

    // We enter STATE_PARSED_TEXT_CONTENT when we are parsing
    // the body of a tag does not contain HTML tags but may contains
    // placeholders
    var STATE_PARSED_TEXT_CONTENT = Parser.createState({
        name: 'STATE_PARSED_TEXT_CONTENT',

        placeholder: {
            type: 'contentplaceholder',

            end: function(placeholder) {
                _notifyText(text);
                _notifyPlaceholder(placeholder);
            },

            eof: function() {
                // TODO: implement this
            }
        },

        eof: CONTENT_eof,

        char: function(ch, code) {
            if (code === CODE_LEFT_ANGLE_BRACKET) {
                // First, see if we need to see if we reached the closing tag
                // and then check if we encountered CDATA
                if (_checkForClosingTag()) {
                    return;
                } else if (_checkForCDATA()) {
                    return;
                }
            } else if (_checkForPlaceholder(ch, code)) {
                // We went into placeholder state...
                return;
            }

            text += ch;
        }
    });

    // State that we enter just after seeing a "<" while in STATE_HTML_CONTENT.
    // NOTE: We have already ruled out CDATA and XML comment via a look-ahead
    // so we just need to handle other entities that start with "<"
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
                // NOTE: We already checked for CDATA earlier and <!--
                parser.enterState(STATE_DTD);
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
                // We encountered "=" which means we need to start reading
                // the attribute value.
                // Set the attribute value to empty string (since it is
                // initially undefined when start reading a new attribute)
                attribute.expression = '';
                parser.enterState(STATE_ATTRIBUTE_VALUE);
            } else if (code === CODE_RIGHT_ANGLE_BRACKET) {
                // While reading attribute name, see if we encounter end tag
                _afterOpenTag();
            } else if (code === CODE_FORWARD_SLASH) {
                // Check for self-closing tag
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
                // Just a normal attribute name character
                attribute.name += ch;
            }
        }
    });

    // We enter the ATTRIBUTE_VALUE state when we see a "=" while in
    // the ATTRIBUTE_NAME state.
    var STATE_ATTRIBUTE_VALUE = Parser.createState({
        name: 'STATE_ATTRIBUTE_VALUE',
        // We go into the LINE_COMMENT or BLOCK_COMMENT sub-state
        // when we see a // or /* character sequence while parsing
        // an attribute value.
        // The LINE_COMMENT or BLOCK_COMMENT state will bubble some
        // events up to the parent state.
        comment: {
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
                attribute.expression += ch;
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
                    attribute.expression += ch;
                }
            } else if ((code === CODE_SINGLE_QUOTE) || (code === CODE_DOUBLE_QUOTE)) {
                attribute.expression += ch;
                _enterStringState(ch, code, STATE_STRING_IN_ATTRIBUTE_VALUE);
            } else if (code === CODE_LEFT_PARANTHESIS) {
                attribute.expression += ch;
                _enterDelimitedExpressionState(ch, code, CODE_RIGHT_PARANTHESIS);
            } else if (code === CODE_LEFT_CURLY_BRACE) {
                attribute.expression += ch;
                _enterDelimitedExpressionState(ch, code, CODE_RIGHT_CURLY_BRACE);
            } else if (code === CODE_LEFT_SQUARE_BRACKET) {
                attribute.expression += ch;
                _enterDelimitedExpressionState(ch, code, CODE_RIGHT_SQUARE_BRACKET);
            } else if (_isWhitespaceCode(code)) {
                parser.enterState(STATE_WITHIN_ELEMENT);
            } else {
                attribute.expression += ch;
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

        placeholder: {
            type: 'attributeplaceholder',

            end: function(placeholder) {
                var stringDelimiter = placeholder.stringDelimiter;

                _notifyPlaceholder(placeholder);

                attribute.expression =
                    _buildConcatenatedString(
                        attribute.expression,
                        placeholder,
                        stringDelimiter);
            },

            eof: function() {
                // TODO: implement this
            }
        },

        char: function(ch, code) {
            var stringDelimiter = currentExpression.endDelimiter;
            if (code === stringDelimiter) {
                attribute.expression += ch;
                _leaveStringState();
            } else if (_checkForPlaceholder(ch, code, stringDelimiter)) {

            } else {
                attribute.expression += ch;
            }
        }
    });

    // We enter STATE_ATTRIBUTE_VALUE_DELIMITED_EXPRESSION after we see an
    // expression delimiter while in STATE_ATTRIBUTE_VALUE.
    // The expression delimiters are the following: ({[
    //
    // While in this state we keep reading characters until we find the
    // matching delimiter (while ignoring any expression delimiters that
    // we might see inside strings and comments).
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
                attribute.expression += ch;
            }
        },

        eof: function() {
            STATE_ATTRIBUTE_VALUE.eof();
        },

        char: function(ch, code) {

            if ((code === CODE_SINGLE_QUOTE) || (code === CODE_DOUBLE_QUOTE)) {
                // string
                attribute.expression += ch;
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

            attribute.expression += ch;


            if (code === currentExpression.endDelimiter) {
                if (--currentExpression.depth === 0) {
                    _leaveDelimitedExpressionState();
                }
            } else if (code === currentExpression.startDelimiter) {
                currentExpression.depth++;
            }
        }
    });



    var STATE_PLACEHOLDER = Parser.createState({
        name: 'STATE_PLACEHOLDER',
        comment: {
            eof: function() {
                currentPlaceholder.handler.eof(currentPlaceholder);
            },

            end: function() {
                // If we reach the end of the comment then return
                // back to the original state
                parser.enterState(STATE_PLACEHOLDER);
            },

            char: function(ch) {
                currentPlaceholder.contents += ch;
            }
        },

        eof: function() {
            currentPlaceholder.handler.eof(currentPlaceholder);
        },

        char: function(ch, code) {
            if ((code === CODE_SINGLE_QUOTE) || (code === CODE_DOUBLE_QUOTE)) {
                // string
                currentPlaceholder.contents += ch;
                _enterStringState(ch, code, STATE_STRING_IN_PLACEHOLDER);
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
            } else if (code === CODE_RIGHT_CURLY_BRACE) {
                if (--currentPlaceholder.delimiterDepth === 0) {
                    _leavePlaceholderState();
                } else {
                    currentPlaceholder.contents += ch;
                }
            } else if (code === CODE_LEFT_CURLY_BRACE) {
                currentPlaceholder.delimiterDepth++;
                currentPlaceholder.contents += ch;
            } else {
                currentPlaceholder.contents += ch;
            }
        }
    });

    var STATE_STRING_IN_PLACEHOLDER = Parser.createState({
        name: 'STATE_STRING_IN_PLACEHOLDER',
        eof: function() {
            // TODO: Implement
        },

        placeholder: {
            end: function(placeholder) {
                var stringDelimiter = placeholder.stringDelimiter;

                _notifyPlaceholder(placeholder);

                currentPlaceholder.contents =
                    _buildConcatenatedString(
                        currentPlaceholder.contents,
                        placeholder,
                        stringDelimiter);
            },

            eof: function() {
                // TODO: implement this
            }
        },

        char: function(ch, code) {
            var nextCh;
            var stringDelimiter = currentExpression.endDelimiter;

            if (code === CODE_BACK_SLASH) {
                // Handle string escape sequence
                nextCh = parser.lookAtCharAhead(1);
                parser.skip(1);

                currentPlaceholder.contents += ch + nextCh;
            } else if ((code === stringDelimiter) || (code === CODE_NEWLINE)) {
                // We encountered the end delimiter or the newline character
                currentPlaceholder.contents += ch;
                _leaveStringState();
            } else if (_checkForPlaceholder(ch, code, stringDelimiter)) {
                // We encountered nested placeholder...
            } else {
                currentPlaceholder.contents += ch;
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

        leave: function() {
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

        placeholder: {
            type: 'contentplaceholder',

            end: function(placeholder) {
                _notifyCommentText(comment);
                _notifyPlaceholder(placeholder);
            },

            eof: function() {
                // TODO: implement this
            }
        },

        enter: function() {
            comment = '';
        },

        eof: function() {
            _notifyCommentText(comment);
        },

        char: function(ch, code) {
            if (code === CODE_DASH) {
                var match = parser.lookAheadFor('->');
                if (match) {
                    parser.skip(match.length);

                    _notifyCommentText(comment);
                    _notifyEndComment();

                    parser.enterState(STATE_HTML_CONTENT);
                } else {
                    comment += ch;
                }
            } else if (_checkForPlaceholder(ch, code)) {
                // STATE_PLACEHOLDER.handle was called which
                // called _notifyText
                return;
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
        parser.enterState(STATE_PARSED_TEXT_CONTENT);
    };

    parser.enterCssContentState = function() {
        endTagName = tagName;
        parser.enterState(STATE_PARSED_TEXT_CONTENT);
    };

    parser.enterParsedTextContentState = function() {
        endTagName = tagName;
        parser.enterState(STATE_PARSED_TEXT_CONTENT);
    };

    parser.enterStaticTextContentState = function() {
        endTagName = tagName;
        parser.enterState(STATE_STATIC_TEXT_CONTENT);
    };

    parser.setInitialState(STATE_HTML_CONTENT);

    return parser;
};
