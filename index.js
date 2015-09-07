var Parser = require('./Parser');

var WHITESPACE_REGEX = /[ \t\r\n]/;
var WHITESPACE_CHARS = ' \n\t\r';

function _isWhiteSpaceChar(ch) {
    //return (WHITESPACE_REGEX.exec(ch) !== null);
    //return (WHITESPACE_CHARS.indexOf(ch) !== -1);
    var code = ch.charCodeAt(0);
    return (code <= 32);// || (code )
    //return (code === ' ') || (str.charCodeAt(index);
    //return (code === ' ') || (code === CODE_NEWLINE) || (code === '\t') || (code === '\r');
}

function _code(ch) {
    return ch.charCodeAt(0);
}

var CODE_BACK_SLASH = _code('\\');
var CODE_FORWARD_SLASH = _code('/');
var CODE_LEFT_ANGLE_BRACKET = _code('<');
var CODE_RIGHT_ANGLE_BRACKET = _code('>');
var CODE_EXCLAMATION = _code('!');
var CODE_QUESTION = _code('?');
var CODE_LEFT_SQUARE_BRACKET = _code('[');
var CODE_RIGHT_SQUARE_BRACKET = _code(']');
var CODE_EQUAL = _code('=');
var CODE_SINGLE_QUOTE = _code('\'');
var CODE_DOUBLE_QUOTE = _code('\"');
var CODE_LEFT_PARANTHESIS = _code('(');
var CODE_RIGHT_PARANTHESIS = _code(')');
var CODE_LEFT_CURLY_BRACE = _code('{');
var CODE_RIGHT_CURLY_BRACE = _code('}');
var CODE_ASTERISK = _code('*');
var CODE_NEWLINE = _code('\n');
var CODE_DASH = _code('-');

exports.createParser = function(listeners, options) {
    var parser = new Parser(options);

    var tagName;
    var text;
    var comment;
    var attribute;
    var attributes;
    var stringDelimiter;
    var expressionStartDelimiter;
    var expressionEndDelimiter;
    var expressionDepth;

    function _notifyText(text) {
        if (listeners.ontext) {
            listeners.ontext({
                type: 'text',
                text: text
            });
        }
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

            listeners.onopentag(event);
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

            listeners.onclosetag(event);
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
            listeners.ondeclaration({
                type: 'declaration',
                name: name
            });
        }
    }

    function _notifyComment(comment) {
        if (listeners.oncomment) {
            listeners.oncomment({
                type: 'comment',
                comment: comment
            });
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
            if (attr.value !== undefined) {
                text += '=' + attr.value;
            }
        }
        return text;
    }

    function _afterOpenTag() {
        _notifyOpenTag(tagName, attributes);

        if (tagName === 'script') {
            parser.enterState(states.SCRIPT_TAG);
        } else if (tagName === 'style') {
            parser.enterState(states.STYLE_TAG);
        } else {
            parser.enterState(states.INITIAL);
        }
    }

    function _afterSelfClosingTag() {
        _notifyOpenTag(tagName, attributes, true /* selfClosed */);
        _notifyCloseTag(tagName, true /* selfClosed */);
        parser.enterState(states.INITIAL);
    }

    var parentOfStringState;
    var parentOfCommentState;
    var parentOfExpressionState;
    var expressionEndTagName;

    function _enterStringState(delimiter) {
        stringDelimiter = delimiter;
        parentOfStringState = parser.state;
        parentOfStringState.string.char(stringDelimiter);
        parser.enterState(states.STRING);
    }

    function _enterBlockCommentState() {
        parentOfCommentState = parser.state;
        parentOfCommentState.comment.char('/*');
        parser.enterState(states.BLOCK_COMMENT);
    }

    function _enterLineCommentState() {
        parentOfCommentState = parser.state;
        parentOfCommentState.comment.char('//');
        parser.enterState(states.LINE_COMMENT);
    }

    function _enterExpressionState(startCh, startDelimiter, endDelimiter) {
        parentOfExpressionState = parser.state;

        expressionStartDelimiter = startDelimiter;
        expressionEndDelimiter = endDelimiter;

        if (startDelimiter) {
            expressionDepth = 1;
            parentOfExpressionState.expression.char(startCh);
        } else {
            expressionEndTagName = tagName;
        }

        parser.enterState(states.EXPRESSION);
    }

    var states = {

        // Initial state of the parser
        INITIAL: Parser.createState({
            enter: function() {
                text = '';
            },

            leave: function() {
                if (text.length > 0) {
                    _notifyText(text);
                }
            },

            eof: function() {
                if (text.length > 0) {
                    _notifyText(text);
                }
            },

            char: function(ch, code) {
                if (code === CODE_LEFT_ANGLE_BRACKET) {
                    parser.enterState(states.START_BEGIN_ELEMENT);
                } else {
                    text += ch;
                }
            }
        }),

        // State that we enter just after seeing a "<"
        START_BEGIN_ELEMENT: Parser.createState({
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
                    // <![CDATA[
                    // <!-- comment

                    // Look ahead to see if it is comment...
                    var match = parser.lookAheadFor('--');
                    if (match) {
                        // Found XML comment
                        parser.skip(2);
                        parser.enterState(states.XML_COMMENT);
                    } else {
                        // Not a comment, see if it is a CDATA...
                        match = parser.lookAheadFor('[CDATA[');
                        if (match) {
                            parser.skip(match.length);

                            // Found CDATA...
                            parser.enterState(states.CDATA);
                        } else {
                            // Some other type of declaration...
                            parser.enterState(states.DTD);
                        }
                    }
                } else if (code === CODE_QUESTION) {
                    // something like:
                    // <?xml version="1.0"?>
                    parser.enterState(states.DECLARATION);
                } else if (code === CODE_FORWARD_SLASH) {
                    // something like:
                    // </html>
                    parser.enterState(states.END_ELEMENT);
                } else if (code === CODE_RIGHT_ANGLE_BRACKET) {
                    // something like:
                    // <>
                    // We'll treat this as text
                    _notifyText('<>');

                    parser.enterState(states.INITIAL);
                } else if (code === CODE_LEFT_ANGLE_BRACKET) {
                    // found something like:
                    // ><
                    // We'll treat the stray ">" as text and stay in
                    // the START_BEGIN_ELEMENT since we saw a new "<"
                    _notifyText('<');
                } else if (_isWhiteSpaceChar(ch)) {
                    _notifyText('<' + ch);

                    parser.enterState(states.INITIAL);
                } else {
                    tagName += ch;

                    // just a normal element...
                    parser.enterState(states.ELEMENT_NAME);
                }
            }
        }),

        // We enter the ELEMENT_NAME state after we encounter a "<"
        // followed by a non-special character
        ELEMENT_NAME: Parser.createState({
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
                    var nextCh = parser.lookAtCharCodeAhead(1);
                    parser.skip(1);

                    if (nextCh === CODE_RIGHT_ANGLE_BRACKET) {
                        // we found a self-closing tag
                        _afterSelfClosingTag();
                    } else {
                        parser.enterState(states.WITHIN_ELEMENT);
                    }
                } else if (_isWhiteSpaceChar(ch)) {
                    parser.enterState(states.WITHIN_ELEMENT);
                } else {
                    tagName += ch;
                }
            }
        }),

        // We enter the CDATA state after we see "<![CDATA["
        CDATA: Parser.createState({
            enter: function() {
                text = '';
            },

            leave: function() {
                _notifyText(text);
            },

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
                        parser.skip(match.length);
                        parser.enterState(states.INITIAL);
                    }
                } else {
                    text += ch;
                }
            }
        }),

        // We enter the END_ELEMENT state after we see "</"
        END_ELEMENT: Parser.createState({
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

                    parser.enterState(states.INITIAL);
                } else {
                    tagName += ch;
                }
            }
        }),

        // We enter the WITHIN_ELEMENT state after we have fully
        // read in the tag name and encountered a whitespace character
        WITHIN_ELEMENT: Parser.createState({
            eof: function() {
                var text = '<' + tagName + _attributesToText(attributes);
                _notifyText(text);
            },

            char: function(ch, code) {
                if (code === CODE_RIGHT_ANGLE_BRACKET) {
                    _afterOpenTag();
                } else if (code === CODE_FORWARD_SLASH) {
                    var nextCh = parser.lookAtCharCodeAhead(1);
                    if (nextCh === CODE_RIGHT_ANGLE_BRACKET) {
                        parser.skip(1);
                        _afterSelfClosingTag();
                    }
                } else if (_isWhiteSpaceChar(ch)) {
                    // ignore whitespace within element...
                } else {
                    // attribute name is initially the first non-whitespace
                    // character that we found
                    _attribute().name = ch;
                    parser.enterState(states.ATTRIBUTE_NAME);
                }
            }
        }),

        // We enter the ATTRIBUTE_NAME state when we see a non-whitespace
        // character after reading the tag name
        ATTRIBUTE_NAME: Parser.createState({
            eof: function() {
                states.WITHIN_ELEMENT.eof();
            },

            char: function(ch, code) {
                if (code === CODE_EQUAL) {
                    attribute.value = '';
                    parser.enterState(states.ATTRIBUTE_VALUE);
                } else if (code === CODE_RIGHT_ANGLE_BRACKET) {
                    _afterOpenTag();
                } else if (code === CODE_FORWARD_SLASH) {
                    var nextCh = parser.lookAtCharCodeAhead(1);
                    if (nextCh === CODE_RIGHT_ANGLE_BRACKET) {
                        // we found a self-closing tag
                        parser.skip(1);
                        _afterSelfClosingTag();
                    } else {
                        // ignore the extra "/" and stop looking
                        // for attribute value
                        parser.enterState(states.WITHIN_ELEMENT);
                    }
                } else if (_isWhiteSpaceChar(ch)) {
                    // when whitespace is encountered then we complete
                    // the current attribute and don't bother looking
                    // for attribute value
                    parser.enterState(states.WITHIN_ELEMENT);
                } else {
                    attribute.name += ch;
                }
            }
        }),

        // We enter the ATTRIBUTE_VALUE state when we see a "=" while in
        // the ATTRIBUTE_NAME state.
        ATTRIBUTE_VALUE: Parser.createState({
            // We go into the STRING sub-state when we see a single or double
            // quote character while parsing an an attribute value.
            // The STRING state will bubble some events up to the
            // parent state.
            string: {
                eof: function() {
                    states.WITHIN_ELEMENT.eof();
                },

                end: function() {
                    // If we reach the end of the string then return
                    // back to the ATTRIBUTE_VALUE state
                    parser.enterState(states.ATTRIBUTE_VALUE);
                },

                char: function(ch) {
                    // char will be called for each character in the
                    // string (including the delimiters)
                    attribute.value += ch;
                }
            },

            // We go into the LINE_COMMENT or BLOCK_COMMENT sub-state
            // when we see a // or /* character sequence while parsing
            // an attribute value.
            // The LINE_COMMENT or BLOCK_COMMENT state will bubble some
            // events up to the parent state.
            comment: {
                eof: function() {
                    states.WITHIN_ELEMENT.eof();
                },

                end: function() {
                    // If we reach the end of the comment then return
                    // back to the ATTRIBUTE_VALUE state
                    parser.enterState(states.ATTRIBUTE_VALUE);
                },

                char: function(ch) {
                    attribute.value += ch;
                }
            },

            // We enter the EXPRESSION sub-state after we see an expression
            // delimiter while in the ATTRIBUTE_VALUE
            // state. The expression delimiters are the following: ({[
            // The EXPRESSION state will bubble some events up to the
            // parent state.
            expression: {
                eof: function() {
                    states.WITHIN_ELEMENT.eof();
                },

                end: function() {
                    // If we reach the end of the expression then return
                    // back to the ATTRIBUTE_VALUE state
                    parser.enterState(states.ATTRIBUTE_VALUE);
                },

                char: function(ch) {
                    attribute.value += ch;
                }
            },

            eof: function() {
                states.WITHIN_ELEMENT.eof();
            },

            char: function(ch, code) {
                if (code === CODE_RIGHT_ANGLE_BRACKET) {
                    _afterOpenTag();
                } else if (code === CODE_FORWARD_SLASH) {
                    var nextCh = parser.lookAtCharCodeAhead(1);
                    if (nextCh === CODE_RIGHT_ANGLE_BRACKET) {
                        // we found a self-closing tag
                        _afterSelfClosingTag();
                        parser.skip(1);
                    } else if (nextCh === CODE_ASTERISK) {
                        parser.skip(1);
                        _enterBlockCommentState();
                    } else {
                        // we encountered a "/" but it wasn't followed
                        // by a ">" so continue
                        attribute.value += ch;
                    }
                } else if (code === CODE_SINGLE_QUOTE) {
                    _enterStringState(ch);
                } else if (code === CODE_DOUBLE_QUOTE) {
                    _enterStringState(ch);
                } else if (code === CODE_LEFT_PARANTHESIS) {
                    _enterExpressionState(ch, code, CODE_RIGHT_PARANTHESIS);
                } else if (code === CODE_LEFT_CURLY_BRACE) {
                    _enterExpressionState(ch, code, CODE_RIGHT_CURLY_BRACE);
                } else if (code === CODE_LEFT_SQUARE_BRACKET) {
                    _enterExpressionState(ch, code, CODE_RIGHT_SQUARE_BRACKET);
                } else if (_isWhiteSpaceChar(ch)) {
                    parser.enterState(states.WITHIN_ELEMENT);
                } else {
                    attribute.value += ch;
                }
            }
        }),

        // We enter the EXPRESSION state after we see a <script> open tag
        // or if we see an expression delimiter while in the ATTRIBUTE_VALUE
        // state. The expression delimiters are the following: ({[
        EXPRESSION: Parser.createState({
            // We go into the STRING sub-state when we see a single or double
            // quote character while parsing an expression.
            // The STRING state will bubble some events up to the
            // parent state.
            string: {
                eof: function() {
                    parentOfExpressionState.expression.eof();
                },

                end: function() {
                    // If we reach the end of the string then return
                    // back to the EXPRESSION state
                    parser.enterState(states.EXPRESSION);
                },

                char: function(ch) {
                    // char will be called for each character in the
                    // string (including the delimiters)
                    parentOfExpressionState.expression.char(ch);
                }
            },

            // We go into the LINE_COMMENT or BLOCK_COMMENT sub-state
            // when we see a // or /* character sequence while parsing
            // an expression.
            // The LINE_COMMENT or BLOCK_COMMENT state will bubble some
            // events up to the parent state.
            comment: {
                eof: function() {
                    parentOfExpressionState.expression.eof();
                },

                end: function() {
                    // If we reach the end of the comment then return
                    // back to the EXPRESSION state
                    parser.enterState(states.EXPRESSION);
                },

                char: function(ch) {
                    parentOfExpressionState.expression.char(ch);
                }
            },

            eof: function() {
                parentOfExpressionState.expression.eof();
            },

            char: function(ch, code) {
                if (code === CODE_SINGLE_QUOTE) {
                    // single-quoted string
                    return _enterStringState(ch);
                } else if (code === CODE_DOUBLE_QUOTE) {
                    // double-quoted string
                    return _enterStringState(ch);
                }

                if (parentOfExpressionState === states.ATTRIBUTE_VALUE) {
                    // console.log('expression within attribute value');
                    // We are within an attribute value
                    parentOfExpressionState.expression.char(ch);

                    if (code === expressionEndDelimiter) {
                        expressionDepth--;

                        if (expressionDepth === 0) {
                            parentOfExpressionState.expression.end();
                        }

                    } else if (code === expressionStartDelimiter) {
                        expressionDepth++;
                    }
                } else {
                    // console.log('expression within script tag');
                    // We must be within a script tag
                    if (code === CODE_LEFT_ANGLE_BRACKET) {
                        var match = parser.lookAheadFor('/' + expressionEndTagName + '>');
                        if (match) {
                            parentOfExpressionState.expression.end();

                            parser.skip(match.length);
                            _notifyCloseTag(expressionEndTagName);
                        } else {
                            parentOfExpressionState.expression.char(ch);
                        }

                    } else if (code === CODE_FORWARD_SLASH) {
                        var nextCh = parser.lookAtCharCodeAhead(1);
                        if (nextCh === CODE_FORWARD_SLASH) {
                            _enterLineCommentState();
                            parser.skip(1);
                        } else if (nextCh === CODE_ASTERISK) {
                            _enterBlockCommentState();
                            parser.skip(1);
                        } else {
                            parentOfExpressionState.expression.char(ch);
                        }
                    } else {
                        parentOfExpressionState.expression.char(ch);
                    }
                }
            }
        }),

        // We enter the SCRIPT_TAG state after we encounter opening script tag
        SCRIPT_TAG: Parser.createState({
            // We go into the EXPRESSION sub-state right after entering
            // the SCRIPT_TAG state.
            // The EXPRESSION state will bubble some events up to the
            // parent state.
            expression: {
                eof: function() {
                    _notifyText(text);
                },

                end: function() {
                    _notifyText(text);

                    // If we reach the end of the expression then return
                    // back to the INITIAL state
                    parser.enterState(states.INITIAL);
                },

                char: function(ch) {
                    text += ch;
                }
            },

            enter: function() {
                // initialize the text buffer and immediately go into
                // the expression state
                text = '';
                _enterExpressionState();
            }
        }),

        // We enter the STYLE_TAG state after we encounter opening script tag
        STYLE_TAG: Parser.createState({
            // We go into the EXPRESSION sub-state right after entering
            // the STYLE_TAG state.
            // The EXPRESSION state will bubble some events up to the
            // parent state.
            expression: {
                eof: function() {
                    _notifyText(text);
                },

                end: function() {
                    _notifyText(text);

                    // If we reach the end of the expression then return
                    // back to the INITIAL state
                    parser.enterState(states.INITIAL);
                },

                char: function(ch) {
                    text += ch;
                }
            },

            enter: function() {
                // initialize the text buffer and immediately go into
                // the expression state
                text = '';
                _enterExpressionState();
            }
        }),

        // We enter the STRING state after we encounter a single or double
        // quote character while in the ATTRIBUTE_VALUE or EXPRESSION state.
        STRING: Parser.createState({
            eof: function() {
                parentOfStringState.string.eof();
            },

            char: function(ch, code) {
                if (code === CODE_BACK_SLASH) {
                    parentOfStringState.string.char(ch);
                    parser.enterState(states.STRING_ESCAPE_CHAR);
                } else if (ch === stringDelimiter) {
                    parentOfStringState.string.char(ch);
                    parentOfStringState.string.end();
                } else {
                    parentOfStringState.string.char(ch);
                }
            }
        }),

        // We enter the STRING_ESCAPE_CHAR state after we encounter a "\"
        // while in the STRING state. The next character will always be handled
        // character within a string and then we'll immediately return back to
        // the STRING state.
        STRING_ESCAPE_CHAR: Parser.createState({
            eof: function() {
                parentOfStringState.string.eof();
            },

            char: function(ch) {
                parentOfStringState.string.char(ch);
                parser.enterState(states.STRING);
            }
        }),

        // We enter the BLOCK_COMMENT state after we encounter a "/*" sequence
        // while in the ATTRIBUTE_VALUE or EXPRESSION state.
        // We leave the BLOCK_COMMENT state when we see a "*/" sequence.
        BLOCK_COMMENT: Parser.createState({
            eof: function() {
                parentOfCommentState.comment.eof();
            },

            char: function(ch, code) {
                if (code === CODE_ASTERISK) {
                    parentOfCommentState.comment.char(ch);
                    var nextCh = parser.lookAtCharCodeAhead(1);
                    if (nextCh === CODE_FORWARD_SLASH) {
                        parser.skip(1);
                        parentOfCommentState.comment.char('/');
                        parentOfCommentState.comment.end();
                    }
                } else {
                    parentOfCommentState.comment.char(ch);
                }
            }
        }),

        // We enter the LINE_COMMENT state after we encounter a "//" sequence
        // while in the EXPRESSION state.
        // We leave the LINE_COMMENT state when we see a newline character.
        LINE_COMMENT: Parser.createState({
            eof: function() {
                parentOfCommentState.comment.eof();
            },

            char: function(ch, code) {
                parentOfCommentState.comment.char(ch);

                if (code === CODE_NEWLINE) {
                    parentOfCommentState.comment.end();
                }
            }
        }),

        // We enter the DTD state after we encounter a "<!" while in the
        // INITIAL state.
        // We leave the DTD state if we see a ">".
        DTD: Parser.createState({
            enter: function() {
                tagName = '';
            },

            leave: function(){
                _notifyDTD(tagName);
            },

            eof: function() {
                _notifyText('<!' + tagName);
            },

            char: function(ch, code) {
                if (code === CODE_RIGHT_ANGLE_BRACKET) {
                    parser.enterState(states.INITIAL);
                } else {
                    tagName += ch;
                }
            }
        }),

        // We enter the DECLARATION state after we encounter a "<?"
        // while in the INITIAL state.
        // We leave the DECLARATION state if we see a "?>" or ">".
        DECLARATION: Parser.createState({
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
                    var nextCh = parser.lookAtCharCodeAhead(1);
                    if (nextCh === CODE_RIGHT_ANGLE_BRACKET) {
                        parser.skip(1);
                        parser.enterState(states.INITIAL);
                    }
                } else if (code === CODE_RIGHT_ANGLE_BRACKET) {
                    parser.enterState(states.INITIAL);
                } else {
                    tagName += ch;
                }
            }
        }),

        // We enter the XML_COMMENT state after we encounter a "<--"
        // while in the INITIAL state.
        // We leave the XML_COMMENT state if we see a "-->".
        XML_COMMENT: Parser.createState({
            enter: function() {
                comment = '';
            },

            leave: function(){
                _notifyComment(comment);
            },

            eof: function() {
                _notifyComment(comment);
            },

            char: function(ch, code) {
                if (code === CODE_DASH) {
                    var match = parser.lookAheadFor('->');
                    if (match) {
                        parser.skip(match.length);

                        parser.enterState(states.INITIAL);
                    } else {
                        comment += ch;
                    }
                } else {
                    comment += ch;
                }
            }
        })
    };

    parser.setInitialState(states.INITIAL);

    return parser;
};