'use strict';
var BaseParser = require('./BaseParser');

var notifyUtil = require('./notify-util');

function _isWhitespaceCode(code) {
    // For all practical purposes, the space character (32) and all the
    // control characters below it are whitespace. We simplify this
    // condition for performance reasons.
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

var EMPTY_ATTRIBUTES = [];

class Parser extends BaseParser {
    constructor(listeners, options) {
        super(options);

        var parser = this;

        var notifiers = notifyUtil.createNotifiers(parser, listeners);
        this.notifiers = notifiers;

        var tagName;
        var text = '';
        var comment;
        var attribute;
        var attributes;
        var elementArgument;
        var tagPos;
        var placeholderPos;
        var withinTag = false;
        // This is a simple stack that we use to handle parsing
        // expressions within expressions. When we start parsing
        // a delimited expression then we keep track of the start
        // and end delimiter. We use this for the following types
        // of expressions:
        // - Strings: "..." and '...'
        // - Arrays: [...]
        // - Paranthetic: (...)
        // - Object/Block: {...}
        var expressionStack = [];

        // the current expression info at the top of the stack
        var currentExpression;

        // the top-most expression handler
        var expressionHandler;

        var commentHandler;
        var endTagName;
        var expressionStr;
        var placeholderStack = [];
        var currentPlaceholder;
        var currentAttributeForAgument;
        var ignoreArgument;
        var cdataParentState;

        this.reset = function() {
            BaseParser.prototype.reset.call(this);
            text = '';
            comment = undefined;
            attribute = undefined;
            attributes = undefined;
            elementArgument = undefined;
            tagPos = undefined;
            placeholderPos = undefined;
            withinTag = false;
            expressionStack = [];
            currentExpression = undefined;
            expressionHandler = undefined;
            commentHandler = undefined;
            endTagName = undefined;
            expressionStr = undefined;
            placeholderStack = [];
            currentPlaceholder = undefined;
            currentAttributeForAgument = undefined;
            ignoreArgument = undefined;
            cdataParentState = undefined;
        };

        function _notifyText(txt) {
            notifiers.notifyText(txt);

            // always clear text buffer...
            text =  '';
        }

        var _notifyCDATA = notifiers.notifyCDATA;
        var _notifyCommentText = notifiers.notifyCommentText;
        var _notifyError = notifiers.notifyError;
        var _notifyOpenTag = notifiers.notifyOpenTag;
        var _notifyCloseTag = notifiers.notifyCloseTag;
        var _notifyDTD = notifiers.notifyDTD;
        var _notifyDeclaration = notifiers.notifyDeclaration;
        var _notifyPlaceholder = notifiers.notifyPlaceholder;

        function _attribute() {
            attribute = {};
            if (attributes === EMPTY_ATTRIBUTES) {
                attributes = [attribute];
            } else {
                attributes.push(attribute);
            }
            return attribute;
        }

        function _afterOpenTag() {
            var origState = parser.state;

            _notifyOpenTag(tagName, attributes, elementArgument, false /* not selfClosed */);

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
            _notifyOpenTag(tagName, attributes, elementArgument, true /* selfClosed */);
            _notifyCloseTag(tagName, true /* selfClosed */);
            parser.enterHtmlContentState();
        }

        function _enterExpressionState(ch, startDelimiter, endDelimiter, newState) {
            if (currentExpression) {
                // remember the expression string that we are currently building
                currentExpression.str = expressionStr;
            }

            var startPos = parser.pos;

            currentExpression = {
                parentState: parser.state,
                depth: 1,
                startDelimiter: startDelimiter,
                endDelimiter: endDelimiter,
                startPos: startPos,
                startChar: parser.data.charAt(startPos)
            };

            expressionHandler = currentExpression.parentState.expression || expressionHandler;

            currentExpression.str = expressionStr = ch;

            expressionStack.push(currentExpression);

            parser.enterState(newState);
        }

        function _leaveExpressionState() {
            var top = expressionStack.pop();

            if (expressionHandler === top.parentState.expression) {
                // find a new top-most expression handler
                var i = expressionStack.length;
                while(--i >= 0) {
                    var cur = expressionStack[i];
                    if ((expressionHandler = cur.parentState.expression)) {
                        break;
                    }
                }
            }

            var len = expressionStack.length;
            if (len > 0) {
                currentExpression = expressionStack[len - 1];
                expressionStr = currentExpression.str;
            } else {
                currentExpression = null;
                expressionStr = null;
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

        function _enterPlaceholderState(placeholder) {
            var currentState = parser.state;
            var len = placeholderStack.length;

            // Set the event type...
            // This property is used so that the placeholder
            // can be emitted as an event.

            placeholder.type = withinTag ? 'attributeplaceholder' : 'contentplaceholder';
            if (len) {
                placeholder.type = 'nested' + placeholder.type;
            }

            placeholder.delimiterDepth = 1;
            placeholder.parentState = currentState;
            placeholder.expression = '';
            placeholder.handler = currentState.placeholder;

            if (len) {
                var top = placeholderStack[len - 1];
                if (top.ancestorEscaped) {
                    placeholder.ancestorEscaped = true;
                    placeholder.escape = false;
                }
            }

            placeholder.depth = len;

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

                    placeholderPos = parser.pos;

                    parser.skip(1);
                    _enterPlaceholderState({
                        escape: true,
                        stringDelimiter: stringDelimiter
                    });
                    return true;
                } else if (nextCode === CODE_EXCLAMATION) {
                    var afterExclamationCode = parser.lookAtCharCodeAhead(2);
                    if (afterExclamationCode === CODE_LEFT_CURLY_BRACE) {

                        placeholderPos = parser.pos;

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

        function _checkForArgument(ch, code) {
            if (code === CODE_LEFT_PARANTHESIS) {
                if (attributes === EMPTY_ATTRIBUTES) {
                    // no attributes so arguments are for element
                    if ((ignoreArgument = (elementArgument != null))) {
                        _notifyError(tagPos,
                            'ILLEGAL_ELEMENT_ARGUMENT',
                            'Element can only have one argument.');
                    } else {
                        elementArgument = ch;
                    }

                    parser.enterState(STATE_ELEMENT_ARGUMENTS);
                } else {
                    // arguments are for attribute
                    currentAttributeForAgument = attributes[attributes.length - 1];

                    if ((ignoreArgument = (currentAttributeForAgument.argument != null))) {
                        _notifyError(tagPos,
                            'ILLEGAL_ATTRIBUTE_ARGUMENT',
                            'Attribute can only have one argument.');
                    } else {
                        currentAttributeForAgument.argument = ch;
                    }

                    parser.enterState(STATE_ATTRIBUTE_ARGUMENTS);
                }
                return true;
            }

            return false;
        }

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

        // In STATE_HTML_CONTENT we are looking for tags and placeholders but
        // everything in between is treated as text.
        var STATE_HTML_CONTENT = Parser.createState({
            // name: 'STATE_HTML_CONTENT',

            placeholder: {
                end: function(placeholder) {
                    _notifyPlaceholder(placeholder);
                },

                eof: function() {
                    _notifyError(placeholderPos,
                        'MALFORMED_PLACEHOLDER',
                        'EOF reached while parsing placeholder.');
                }
            },

            eof: function() {
                _notifyText(text);
            },

            enter: function() {
                withinTag = false;
            },

            char: function(ch, code) {
                if (code === CODE_LEFT_ANGLE_BRACKET) {

                    tagPos = parser.pos;

                    if (_checkForCDATA()) {
                        return;
                    }

                    var match = parser.lookAheadFor('!--');
                    if (match) {
                        parser.skip(match.length);
                        _notifyText(text);
                        parser.enterState(STATE_XML_COMMENT);
                        return;
                    }

                    _notifyText(text);
                    parser.enterState(STATE_START_OPEN_TAG);
                } else if (_checkForPlaceholder(ch, code)) {
                    // We went into placeholder state...
                    _notifyText(text);
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
            // name: 'STATE_STATIC_TEXT_CONTENT',

            enter: function() {
                // The end tag that we are looking for is the last tag
                // name that we saw
                endTagName = tagName;
                withinTag = false;
            },

            eof: STATE_HTML_CONTENT.eof,

            char: function(ch, code) {
                // See if we need to see if we reached the closing tag...
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
            // name: 'STATE_PARSED_TEXT_CONTENT',

            placeholder: STATE_HTML_CONTENT.placeholder,

            eof: STATE_HTML_CONTENT.eof,

            enter: function() {
                withinTag = false;
            },

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
                    _notifyText(text);
                    return;
                }

                text += ch;
            }
        });

        // State that we enter just after seeing a "<" while in STATE_HTML_CONTENT.
        // NOTE: We have already ruled out CDATA and XML comment via a look-ahead
        // so we just need to handle other entities that start with "<"
        var STATE_START_OPEN_TAG = Parser.createState({
            // name: 'STATE_START_OPEN_TAG',
            enter: function() {
                tagName = '';
                elementArgument = undefined;
                withinTag = true;
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
                    parser.enterState(STATE_CLOSE_TAG);
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
                    parser.enterState(STATE_TAG_NAME);
                }
            }
        });

        // We enter STATE_TAG_NAME after we encounter a "<"
        // followed by a non-special character
        var STATE_TAG_NAME = Parser.createState({
            // name: 'STATE_TAG_NAME',

            enter: function() {
                // reset attributes collection when we enter new element
                attributes = EMPTY_ATTRIBUTES;
            },

            eof: function() {
                _notifyError(tagPos,
                    'MALFORMED_OPEN_TAG',
                    'EOF reached while parsing open tag.');
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
                        parser.enterState(STATE_WITHIN_OPEN_TAG);
                    }
                } else if (_checkForArgument(ch, code)) {
                    // encountered something like:
                    // <for(var i = 0; i < len; i++)>
                } else if (_isWhitespaceCode(code)) {
                    parser.enterState(STATE_WITHIN_OPEN_TAG);
                } else {
                    tagName += ch;
                }
            }
        });

        // We enter STATE_CDATA after we see "<![CDATA["
        var STATE_CDATA = Parser.createState({
            // name: 'STATE_CDATA',

            eof: function() {
                _notifyError(tagPos,
                    'MALFORMED_CDATA',
                    'EOF reached while parsing CDATA');
            },

            char: function(ch, code) {
                if (code === CODE_RIGHT_SQUARE_BRACKET) {
                    var match = parser.lookAheadFor(']>');
                    if (match) {
                        _notifyCDATA(text);
                        text = '';
                        parser.skip(match.length);

                        parser.enterState(cdataParentState);
                    }
                } else {
                    text += ch;
                }
            }
        });

        // We enter STATE_CLOSE_TAG after we see "</"
        var STATE_CLOSE_TAG = Parser.createState({
            // name: 'STATE_CLOSE_TAG',
            eof: function() {
                _notifyError(tagPos,
                    'MALFORMED_CLOSE_TAG',
                    'EOF reached while parsing closing element.');
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

        // We enter STATE_WITHIN_OPEN_TAG after we have fully
        // read in the tag name and encountered a whitespace character
        var STATE_WITHIN_OPEN_TAG = Parser.createState({
            // name: 'STATE_WITHIN_OPEN_TAG',

            eof: STATE_TAG_NAME.eof,

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
                } else if (_checkForArgument(ch, code)) {
                    // encountered something like:
                    // <for (var i = 0; i < len; i++)>
                } else {
                    // attribute name is initially the first non-whitespace
                    // character that we found
                    _attribute().name = ch;
                    parser.enterState(STATE_ATTRIBUTE_NAME);
                }
            }
        });

        // We enter STATE_ATTRIBUTE_NAME when we see a non-whitespace
        // character after reading the tag name
        var STATE_ATTRIBUTE_NAME = Parser.createState({
            // name: 'STATE_ATTRIBUTE_NAME',

            eof: STATE_TAG_NAME.eof,

            char: function(ch, code) {
                if (code === CODE_EQUAL) {
                    // We encountered "=" which means we need to start reading
                    // the attribute value.
                    // Set the attribute value to empty string (since it is
                    // initially undefined when start reading a new attribute)
                    attribute.expression = '';
                    attribute.isSimpleLiteral = true;
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
                        parser.enterState(STATE_WITHIN_OPEN_TAG);
                    }
                } else if (_checkForArgument(ch, code)) {
                    // Found something like:
                    // <div if(a === b)>
                } else if (_isWhitespaceCode(code)) {
                    // when whitespace is encountered then we complete
                    // the current attribute and don't bother looking
                    // for attribute value
                    parser.enterState(STATE_WITHIN_OPEN_TAG);
                } else {
                    // Just a normal attribute name character
                    attribute.name += ch;
                }
            }
        });

        // We enter STATE_ATTRIBUTE_VALUE when we see a "=" while in
        // the ATTRIBUTE_NAME state.
        var STATE_ATTRIBUTE_VALUE = Parser.createState({
            // name: 'STATE_ATTRIBUTE_VALUE',
            // We go into the LINE_COMMENT or BLOCK_COMMENT sub-state
            // when we see a // or /* character sequence while parsing
            // an attribute value.
            // The LINE_COMMENT or BLOCK_COMMENT state will bubble some
            // events up to the parent state.
            comment: {
                end: function() {
                    // If we reach the end of the string then return
                    // back to the ATTRIBUTE_VALUE state
                    parser.enterState(STATE_ATTRIBUTE_VALUE);
                },

                char: function(ch) {
                    // char will be called for each character in the
                    // string (including the delimiters)
                    attribute.expression += ch;
                },

                eof: STATE_TAG_NAME.eof
            },

            expression: {
                char: function(ch, code) {
                    attribute.expression += ch;
                },

                string: function(str, isStringLiteral) {
                    if (!isStringLiteral) {
                        attribute.isStringLiteral = false;
                    }

                    attribute.expression += str;
                },

                eof: STATE_TAG_NAME.eof,
            },

            eof: STATE_TAG_NAME.eof,

            char: function(ch, code) {
                if ((code === CODE_SINGLE_QUOTE) || (code === CODE_DOUBLE_QUOTE)) {
                    // The attribute value is possibly a string literal if the
                    // first character for the value is a single or double quote
                    attribute.isStringLiteral = (attribute.expression.length === 0);
                    attribute.isSimpleLiteral = false;
                    _enterExpressionState(ch, code, code, STATE_STRING);
                    return;
                }

                if (code === CODE_RIGHT_ANGLE_BRACKET) {
                    return _afterOpenTag();
                }

                if (_isWhitespaceCode(code)) {
                    return parser.enterState(STATE_WITHIN_OPEN_TAG);
                }

                if (code === CODE_FORWARD_SLASH) {
                    var nextCode = parser.lookAtCharCodeAhead(1);
                    if (nextCode === CODE_RIGHT_ANGLE_BRACKET) {
                        // we found a self-closing tag
                        _afterSelfClosingTag();
                        return parser.skip(1);
                    } else if (nextCode === CODE_ASTERISK) {
                        attribute.isSimpleLiteral = false;
                        parser.skip(1);
                        return _enterBlockCommentState();
                    }

                    // we encountered a "/" but it wasn't followed
                    // by a ">" so continue

                    // if we see any character besides " and ' then value is
                    // not static text
                } else if (code === CODE_LEFT_PARANTHESIS) {
                    attribute.isSimpleLiteral = false;
                    _enterExpressionState(ch, code, CODE_RIGHT_PARANTHESIS, STATE_DELIMITED_EXPRESSION);
                } else if (code === CODE_LEFT_CURLY_BRACE) {
                    attribute.isSimpleLiteral = false;
                    _enterExpressionState(ch, code, CODE_RIGHT_CURLY_BRACE, STATE_DELIMITED_EXPRESSION);
                } else if (code === CODE_LEFT_SQUARE_BRACKET) {
                    attribute.isSimpleLiteral = false;
                    _enterExpressionState(ch, code, CODE_RIGHT_SQUARE_BRACKET, STATE_DELIMITED_EXPRESSION);
                }

                // If we got here then we are parsing characters that were
                // not within a quoted string so our value can't possibly be
                // a string literal
                attribute.isStringLiteral = false;

                attribute.expression += ch;
            }
        });

        var STATE_ELEMENT_ARGUMENTS = Parser.createState({
            // name: 'STATE_ELEMENT_ARGUMENTS',

            expression: {
                char: function(ch, code) {
                    if (!ignoreArgument) {
                        elementArgument += ch;
                    }
                },

                string: function(str) {
                    if (!ignoreArgument) {
                        elementArgument += str;
                    }
                },

                eof: STATE_TAG_NAME.eof
            },

            enter: function(oldState) {
                if (oldState === STATE_DELIMITED_EXPRESSION) {
                    parser.enterState(STATE_WITHIN_OPEN_TAG);
                } else {
                    _enterExpressionState('(', CODE_LEFT_PARANTHESIS, CODE_RIGHT_PARANTHESIS, STATE_DELIMITED_EXPRESSION);
                }
            }
        });

        var STATE_ATTRIBUTE_ARGUMENTS = Parser.createState({
            // name: 'STATE_ELEMENT_ARGUMENTS',

            expression: {
                char: function(ch, code) {
                    if (!ignoreArgument) {
                        currentAttributeForAgument.argument += ch;
                    }
                },

                string: function(str) {
                    if (!ignoreArgument) {
                        currentAttributeForAgument.argument += str;
                    }
                },

                eof: STATE_TAG_NAME.eof
            },

            enter: STATE_ELEMENT_ARGUMENTS.enter
        });

        // We enter STATE_DELIMITED_EXPRESSION after we see an
        // expression delimiter while in STATE_ATTRIBUTE_VALUE
        // or STATE_PLACEHOLDER.
        // The expression delimiters are the following: ({[
        //
        // While in this state we keep reading characters until we find the
        // matching delimiter (while ignoring any expression delimiters that
        // we might see inside strings and comments).
        var STATE_DELIMITED_EXPRESSION = Parser.createState({
            // name: 'STATE_DELIMITED_EXPRESSION',
            // We go into STATE_LINE_COMMENT or STATE_BLOCK_COMMENT
            // when we see a // or /* character sequence while parsing
            // an expression.
            //
            // The STATE_LINE_COMMENT or STATE_BLOCK_COMMENT state will
            // bubble some events up to the parent state.
            comment: {
                eof: function() {
                    currentExpression.parentState.expression.eof();
                },

                end: function() {
                    // If we reach the end of the comment then return
                    // back to the original expression state
                    parser.enterState(STATE_DELIMITED_EXPRESSION);
                },

                char: function(ch, code) {
                    var handler = currentExpression.parentState.expression;
                    handler.char(ch, code);
                }
            },

            eof: function() {
                currentExpression.parentState.expression.eof();
            },

            char: function(ch, code) {

                var handler = currentExpression.parentState.expression;

                if ((code === CODE_SINGLE_QUOTE) || (code === CODE_DOUBLE_QUOTE)) {
                    _enterExpressionState(ch, code, code, STATE_STRING);
                    return;
                } else if (code === CODE_FORWARD_SLASH) {
                    // Check next character to see if we are in a comment
                    var nextCode = parser.lookAtCharCodeAhead(1);
                    if (nextCode === CODE_FORWARD_SLASH) {
                        _enterLineCommentState();
                        return parser.skip(1);
                    } else if (nextCode === CODE_ASTERISK) {
                        _enterBlockCommentState();
                        return parser.skip(1);
                    }
                }

                handler.char(ch, code);

                if (code === currentExpression.endDelimiter) {
                    if (--currentExpression.depth === 0) {
                        _leaveExpressionState();
                    }
                } else if (code === currentExpression.startDelimiter) {
                    currentExpression.depth++;
                }
            }
        });

        var STATE_PLACEHOLDER_EOF = function() {
            currentPlaceholder.handler.eof(currentPlaceholder);
        };

        var STATE_PLACEHOLDER = Parser.createState({
            // name: 'STATE_PLACEHOLDER',
            comment: {
                end: function() {
                    // If we reach the end of the comment then return
                    // back to the original state
                    parser.enterState(STATE_PLACEHOLDER);
                },

                char: function(ch) {
                    currentPlaceholder.expression += ch;
                },

                eof: STATE_PLACEHOLDER_EOF
            },

            expression: {
                string: function(str) {
                    currentPlaceholder.expression += str;
                },

                eof: STATE_PLACEHOLDER_EOF
            },

            eof: STATE_PLACEHOLDER_EOF,

            char: function(ch, code) {
                if ((code === CODE_SINGLE_QUOTE) || (code === CODE_DOUBLE_QUOTE)) {
                    // string
                    _enterExpressionState(ch, code, code, STATE_STRING);
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
                        _leavePlaceholderState(currentPlaceholder);
                    } else {
                        currentPlaceholder.expression += ch;
                    }
                } else if (code === CODE_LEFT_CURLY_BRACE) {
                    currentPlaceholder.delimiterDepth++;
                    currentPlaceholder.expression += ch;
                } else {
                    currentPlaceholder.expression += ch;
                }
            }
        });

        var STATE_STRING = Parser.createState({
            // name: 'STATE_STRING',

            placeholder: {
                end: function(placeholder) {
                    _notifyPlaceholder(placeholder);
                    currentExpression.stringParts.push(placeholder);
                },

                eof: function() {
                    expressionHandler.eof();
                }
            },

            eof: function() {
                expressionHandler.eof();
            },

            enter: function() {
                if (!currentExpression.stringParts) {
                    // We can reenter the string state multiple times on the same string
                    // so we only want to init the string parts related objects
                    // the first time
                    currentExpression.currentStringPart = '';
                    currentExpression.stringParts = [];
                }

            },

            char: function(ch, code) {
                var stringParts = currentExpression.stringParts;

                var nextCh;
                var stringDelimiterCode = currentExpression.endDelimiter;

                if (code === CODE_BACK_SLASH) {
                    // Handle string escape sequence
                    nextCh = parser.lookAtCharAhead(1);
                    parser.skip(1);

                    currentExpression.currentStringPart += ch + nextCh;
                } else if (code === stringDelimiterCode) {
                    // We encountered the end delimiter
                    if (currentExpression.currentStringPart !== '') {
                        stringParts.push(currentExpression.currentStringPart);
                    }

                    let stringExpr = '';
                    let stringDelimiter =  String.fromCharCode(stringDelimiterCode);

                    if (stringParts.length) {
                        for (let i=0; i<stringParts.length; i++) {
                            let part = stringParts[i];
                            if (i !== 0) {
                                stringExpr += '+';
                            }

                            if (typeof part === 'string') {
                                stringExpr += stringDelimiter + part + stringDelimiter;
                            } else {
                                stringExpr += '(' + part.expression + ')';
                            }
                        }
                    } else {
                        stringExpr = stringDelimiter + stringDelimiter;
                    }

                    let isStringLiteral = currentExpression.isStringLiteral !== false;

                    if (stringParts.length > 1) {
                        stringExpr = '(' + stringExpr + ')';
                    }

                    expressionHandler.string(stringExpr, isStringLiteral);

                    _leaveExpressionState();
                } else if (_checkForPlaceholder(ch, code, stringDelimiterCode)) {
                    if (currentExpression.currentStringPart !== '') {
                        stringParts.push(currentExpression.currentStringPart);
                    }

                    currentExpression.currentStringPart = '';
                    // We encountered nested placeholder...
                    currentExpression.isStringLiteral = false;
                } else {
                    currentExpression.currentStringPart += ch;
                }
            }
        });

        // We enter STATE_BLOCK_COMMENT after we encounter a "/*" sequence
        // while in STATE_ATTRIBUTE_VALUE or STATE_DELIMITED_EXPRESSION.
        // We leave STATE_BLOCK_COMMENT when we see a "*/" sequence.
        var STATE_BLOCK_COMMENT = Parser.createState({
            // name: 'STATE_BLOCK_COMMENT',
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

        // We enter STATE_LINE_COMMENT after we encounter a "//" sequence
        // when parsing JavaScript code.
        // We leave STATE_LINE_COMMENT when we see a newline character.
        var STATE_LINE_COMMENT = Parser.createState({
            // name: 'STATE_LINE_COMMENT',
            eof: function() {
                commentHandler.eof();
            },

            char: function(ch, code) {
                commentHandler.char(ch);

                if (code === CODE_NEWLINE) {
                    commentHandler.end();
                }
            }
        });

        // We enter STATE_DTD after we encounter a "<!" while in the STATE_HTML_CONTENT.
        // We leave STATE_DTD if we see a ">".
        var STATE_DTD = Parser.createState({
            // name: 'STATE_DTD',
            enter: function() {
                tagName = '';
            },

            eof: function() {
                _notifyError(tagPos,
                    'MALFORMED_DTD',
                    'EOF reached while parsing DTD.');
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

        // We enter STATE_DECLARATION after we encounter a "<?"
        // while in the STATE_HTML_CONTENT.
        // We leave STATE_DECLARATION if we see a "?>" or ">".
        var STATE_DECLARATION = Parser.createState({
            // name: 'STATE_DECLARATION',
            enter: function() {
                tagName = '';
            },

            leave: function() {
                _notifyDeclaration(tagName);
            },

            eof: function() {
                _notifyError(tagPos,
                    'MALFORMED_DECLARATION',
                    'EOF reached while parsing declaration.');
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

        // We enter STATE_XML_COMMENT after we encounter a "<--"
        // while in the STATE_HTML_CONTENT.
        // We leave STATE_XML_COMMENT when we see a "-->".
        var STATE_XML_COMMENT = Parser.createState({
            // name: 'STATE_XML_COMMENT',

            enter: function() {
                comment = '';
            },

            eof: function() {
                _notifyError(tagPos,
                    'MALFORMED_COMMENT',
                    'EOF reached while parsing comment');
            },

            char: function(ch, code) {
                if (code === CODE_DASH) {
                    var match = parser.lookAheadFor('->');
                    if (match) {
                        parser.skip(match.length);

                        _notifyCommentText(comment);
                        comment = '';

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
    }

    parse(data) {
        super.parse(data);
        this.notifiers.notifyFinish();
    }
}

module.exports = Parser;