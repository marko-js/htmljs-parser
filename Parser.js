'use strict';
var BaseParser = require('./BaseParser');

var notifyUtil = require('./notify-util');

function isWhitespaceCode(code) {
    // For all practical purposes, the space character (32) and all the
    // control characters below it are whitespace. We simplify this
    // condition for performance reasons.
    // NOTE: This might be slightly non-conforming.
    return (code <= 32);
}

var NUMBER_REGEX = /^[\-\+]?\d*(?:\.\d+)?(?:e[\-\+]?\d+)?$/;

/**
 * Takes a string expression such as `"foo"` or `'foo "bar"'`
 * and returns the literal String value.
 */
function evaluateStringExpression(expression, pos, notifyError) {
    // We could just use eval(expression) to get the literal String value,
    // but there is a small chance we could be introducing a security threat
    // by accidently running malicous code. Instead, we will use
    // JSON.parse(expression). JSON.parse() only allows strings
    // that use double quotes so we have to do extra processing if
    // we detect that the String uses single quotes

    if (expression.charAt(0) === "'") {
        expression = expression.substring(1, expression.length - 1);

        // Make sure there are no unescaped double quotes in the string expression...
        expression = expression.replace(/\\\\|\\["]|["]/g, function(match) {
            if (match === '"'){
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
        notifyError(pos,
            'INVALID_STRING',
            'Invalid string (' + expression + '): ' + e);
    }
}


function peek(array) {
    var len = array.length;
    if (!len) {
        return undefined;
    }
    return array[len - 1];
}

const MODE_HTML = 1;
const MODE_CONCISE = 2;

const CODE_NEWLINE = 10;
const CODE_CARRIAGE_RETURN = 13;
const CODE_BACK_SLASH = 92;
const CODE_FORWARD_SLASH = 47;
const CODE_OPEN_ANGLE_BRACKET = 60;
const CODE_CLOSE_ANGLE_BRACKET = 62;
const CODE_EXCLAMATION = 33;
const CODE_QUESTION = 63;
const CODE_OPEN_SQUARE_BRACKET = 91;
const CODE_CLOSE_SQUARE_BRACKET = 93;
const CODE_EQUAL = 61;
const CODE_SINGLE_QUOTE = 39;
const CODE_DOUBLE_QUOTE = 34;
const CODE_BACKTICK = 96;
const CODE_OPEN_PAREN = 40;
const CODE_CLOSE_PAREN = 41;
const CODE_OPEN_CURLY_BRACE = 123;
const CODE_CLOSE_CURLY_BRACE = 125;
const CODE_ASTERISK = 42;
const CODE_HYPHEN = 45;
const CODE_HTML_BLOCK_DELIMITER = CODE_HYPHEN;
const CODE_DOLLAR = 36;
const CODE_SPACE = 32;
const CODE_PERCENT = 37;
const CODE_PERIOD = 46;
const CODE_NUMBER_SIGN = 35;

const BODY_PARSED_TEXT = 1; // Body of a tag is treated as text, but placeholders will be parsed
const BODY_STATIC_TEXT = 2;// Body of a tag is treated as text and placeholders will *not* be parsed

const EMPTY_ATTRIBUTES = [];
const htmlTags = require('./html-tags');

class Parser extends BaseParser {
    constructor(listeners, options) {
        super(options);

        var parser = this;

        var notifiers = notifyUtil.createNotifiers(parser, listeners);
        this.notifiers = notifiers;

        var defaultMode = options && options.concise === false ? MODE_HTML : MODE_CONCISE;
        var userIsOpenTagOnly = options && options.isOpenTagOnly;
        var ignorePlaceholders = options && options.ignorePlaceholders;

        var currentOpenTag; // Used to reference the current open tag that is being parsed
        var currentAttribute; // Used to reference the current attribute that is being parsed
        var closeTagName; // Used to keep track of the current close tag name as it is being parsed
        var closeTagPos; // Used to keep track of the position of the current closing tag
        var expectedCloseTagName; // Used to figure out when a text block has been ended (HTML tags are ignored)
        var text; // Used to buffer text that is found within the body of a tag
        var withinOpenTag;// Set to true if the parser is within the open tag
        var blockStack; // Used to keep track of HTML tags and HTML blocks
        var partStack; // Used to keep track of parts such as CDATA, expressions, declarations, etc.
        var currentPart; // The current part at the top of the part stack
        var indent; // Used to build the indent for the current concise line
        var isConcise; // Set to true if parser is currently in concise mode
        var isWithinSingleLineHtmlBlock; // Set to true if the current block is for a single line HTML block
        var htmlBlockDelimiter; // Current delimiter for multiline HTML blocks nested within a concise tag. e.g. "--"
        var htmlBlockIndent; // Used to hold the indentation for a delimited, multiline HTML block
        var beginMixedMode; // Used as a flag to mark that the next HTML block should enter the parser into HTML mode
        var endingMixedModeAtEOL; // Used as a flag to record that the next EOL to exit HTML mode and go back to concise
        var placeholderDepth; // Used as an easy way to know if an exptression is within a placeholder
        var textParseMode = 'html';

        this.reset = function() {
            BaseParser.prototype.reset.call(this);
            text = '';
            currentOpenTag = undefined;
            currentAttribute = undefined;
            closeTagName = undefined;
            closeTagPos = undefined;
            expectedCloseTagName = undefined;
            withinOpenTag = false;
            blockStack = [];
            partStack = [];
            currentPart = undefined;
            indent = '';
            isConcise = defaultMode === MODE_CONCISE;
            isWithinSingleLineHtmlBlock = false;
            htmlBlockDelimiter = null;
            htmlBlockIndent = null;
            beginMixedMode = false;
            endingMixedModeAtEOL = false;
            placeholderDepth = 0;
        };

        this.reset();

        /**
         * This function is called to determine if a tag is an "open only tag". Open only tags such as <img>
         * are immediately closed.
         * @param  {String}  tagName The name of the tag (e.g. "img")
         */
        function isOpenTagOnly(tagName) {
            tagName = tagName.toLowerCase();

            var openTagOnly = userIsOpenTagOnly && userIsOpenTagOnly(tagName);
            if (openTagOnly == null) {
                openTagOnly = htmlTags.isOpenTagOnly(tagName);
            }

            return openTagOnly;
        }

        /**
         * Clear out any buffered body text and notify any listeners
         */
        function endText(txt) {
            if (arguments.length === 0) {
                txt = text;
            }

            notifiers.notifyText(txt, textParseMode);

            // always clear text buffer...
            text =  '';
        }


        function openTagEOL() {
            if (isConcise && !currentOpenTag.withinAttrGroup) {
                // In concise mode we always end the open tag
                finishOpenTag();
            }
        }

        /**
         * This function is used to enter into "HTML" parsing mode instead
         * of concise HTML. We push a block on to the stack so that we know when
         * return back to the previous parsing mode and to ensure that all
         * tags within a block are properly closed.
         */
        function beginHtmlBlock(delimiter) {
            htmlBlockIndent = indent;
            htmlBlockDelimiter = delimiter;

            var parent = peek(blockStack);
            blockStack.push({
                type: 'html',
                delimiter: delimiter,
                indent: indent
            });

            if (parent && parent.body) {
                if (parent.body === BODY_PARSED_TEXT) {
                    parser.enterState(STATE_PARSED_TEXT_CONTENT);
                } else if (parent.body === BODY_STATIC_TEXT) {
                    parser.enterState(STATE_STATIC_TEXT_CONTENT);
                } else {
                    throw new Error('Illegal value for parent.body: ' + parent.body);
                }
            } else {
                return parser.enterState(STATE_HTML_CONTENT);
            }
        }

        /**
         * This method gets called when we are in non-concise mode
         * and we are exiting out of non-concise mode.
         */
        function endHtmlBlock() {
            // End any text
            endText();

            // Make sure all tags in this HTML block are closed
            for (let i=blockStack.length-1; i>=0; i--) {
                var curBlock = blockStack[i];
                if (curBlock.type === 'html') {
                    // Remove the HTML block from the stack since it has ended
                    blockStack.pop();
                    // We have reached the point where the HTML block started
                    // so we can stop
                    break;
                } else {
                    // The current block is for an HTML tag and it still open. When a tag is tag is closed
                    // it is removed from the stack
                    notifyError(curBlock.pos,
                        'MISSING_END_TAG',
                        'Missing ending "' + curBlock.tagName + '" tag');
                    return;
                }
            }

            // Resert variables associated with parsing an HTML block
            htmlBlockIndent = null;
            htmlBlockDelimiter = null;
            isWithinSingleLineHtmlBlock = false;

            if (parser.state !== STATE_CONCISE_HTML_CONTENT) {
                parser.enterState(STATE_CONCISE_HTML_CONTENT);
            }
        }

        /**
         * This function gets called when we reach EOF outside of a tag.
         */
        function htmlEOF() {
            endText();

            while(blockStack.length) {
                var curBlock = peek(blockStack);
                if (curBlock.type === 'tag') {
                    if (curBlock.concise) {
                        closeTag(curBlock.expectedCloseTagName);
                    } else {
                        // We found an unclosed tag on the stack that is not for a concise tag. That means
                        // there is a problem with the template because all open tags should have a closing
                        // tag
                        //
                        // NOTE: We have already closed tags that are open tag only or self-closed
                        notifyError(curBlock.pos,
                            'MISSING_END_TAG',
                            'Missing ending "' + curBlock.tagName + '" tag');
                        return;
                    }
                } else if (curBlock.type === 'html') {
                    if (curBlock.delimiter) {
                        // We reached the end of the file and there is still a delimited HTML block on the stack.
                        // That means we never found the ending delimiter and should emit a parse error
                        notifyError(curBlock.pos,
                            'MISSING_END_DELIMITER',
                            'End of file reached before finding the ending "' + curBlock.delimiter + '" delimiter');
                        return;
                    } else {
                        // We reached the end of file while still within a single line HTML block. That's okay
                        // though since we know the line is completely. We'll continue ending all open concise tags.
                        blockStack.pop();
                    }
                } else {
                    // There is a bug in our parser...
                    throw new Error('Illegal state. There should not be any non-concise tags on the stack when in concise mode');
                }
            }
        }

        function openTagEOF() {
            if (isConcise) {
                if (currentOpenTag.withinAttrGroup) {
                    notifyError(currentOpenTag.pos,
                        'MALFORMED_OPEN_TAG',
                        'EOF reached while within an attribute group (e.g. "[ ... ]").');
                    return;
                }

                // If we reach EOF inside an open tag when in concise-mode
                // then we just end the tag and all other open tags on the stack
                finishOpenTag();
                htmlEOF();
            } else {
                // Otherwise, in non-concise mode we consider this malformed input
                // since the end '>' was not found.
                notifyError(currentOpenTag.pos,
                    'MALFORMED_OPEN_TAG',
                    'EOF reached while parsing open tag');
            }
        }

        var notifyCDATA = notifiers.notifyCDATA;
        var notifyComment = notifiers.notifyComment;
        var notifyOpenTag = notifiers.notifyOpenTag;
        var notifyCloseTag = notifiers.notifyCloseTag;
        var notifyDocumentType = notifiers.notifyDocumentType;
        var notifyDeclaration = notifiers.notifyDeclaration;
        var notifyPlaceholder = notifiers.notifyPlaceholder;
        var notifyScriptlet = notifiers.notifyScriptlet;

        function notifyError(pos, errorCode, message) {
            parser.end();
            notifiers.notifyError(pos, errorCode, message);
        }

        function beginAttribute() {
            currentAttribute = {};
            if (currentOpenTag.attributes === EMPTY_ATTRIBUTES) {
                currentOpenTag.attributes = [currentAttribute];
            } else {
                currentOpenTag.attributes.push(currentAttribute);
            }
            parser.enterState(STATE_ATTRIBUTE_NAME);
            return currentAttribute;
        }

        function endAttribute() {
            currentAttribute = null;
            if (parser.state !== STATE_WITHIN_OPEN_TAG) {
                parser.enterState(STATE_WITHIN_OPEN_TAG);
            }
        }

        function beginOpenTag() {
            endText();

            var tagInfo = {
                type: 'tag',
                tagName: '',
                tagNameParts: null,
                attributes: [],
                argument: undefined,
                pos: parser.pos,
                indent: indent,
                nestedIndent: null, // This will get set when we know what hte nested indent is
                concise: isConcise
            };

            withinOpenTag = true;

            if (beginMixedMode) {
                tagInfo.beginMixedMode = true;
                beginMixedMode = false;
            }

            blockStack.push(tagInfo);

            currentOpenTag = tagInfo;

            parser.enterState(STATE_TAG_NAME);

            return currentOpenTag;
        }

        function finishOpenTag(selfClosed) {
            var tagName = currentOpenTag.tagName;

            currentOpenTag.expectedCloseTagName = expectedCloseTagName =
                parser.substring(currentOpenTag.tagNameStart, currentOpenTag.tagNameEnd);

            var openTagOnly = currentOpenTag.openTagOnly = isOpenTagOnly(tagName);
            var endPos = parser.pos;

            if (!isConcise) {
                if (selfClosed) {
                    endPos += 2; // Skip past '/>'
                } else {
                    endPos += 1;
                }
            }

            if (currentOpenTag.tagNameParts) {
                currentOpenTag.tagNameExpression = currentOpenTag.tagNameParts.join('+');
            }

            currentOpenTag.endPos = endPos;
            currentOpenTag.selfClosed = selfClosed === true;

            if (!currentOpenTag.tagName) {
                tagName = currentOpenTag.tagName = 'div';
            }

            var origState = parser.state;
            notifyOpenTag(currentOpenTag);

            var shouldClose = false;

            if (selfClosed) {
                shouldClose = true;
            } else if (openTagOnly) {
                if (!isConcise) {
                    // Only close the tag if we are not in concise mode. In concise mode
                    // we want to keep the tag on the stack to make sure nothing is nested below it
                    shouldClose = true;
                }
            }

            if (shouldClose) {
                closeTag(expectedCloseTagName);
            }

            withinOpenTag = false;

            if (shouldClose) {
                if (isConcise) {
                    parser.enterConciseHtmlContentState();
                } else {
                    parser.enterHtmlContentState();
                }
            } else {
                // Did the parser stay in the same state after
                // notifying listeners about openTag?
                if (parser.state === origState) {
                    // The listener didn't transition the parser to a new state
                    // so we use some simple rules to find the appropriate state.
                    if (tagName === 'script') {
                        parser.enterJsContentState();
                    } else if (tagName === 'style') {
                        parser.enterCssContentState();
                    } else {
                        if (isConcise) {
                            parser.enterConciseHtmlContentState();
                        } else {
                            parser.enterHtmlContentState();
                        }

                    }
                }
            }

            // We need to record the "expected close tag name" if we transition into
            // either STATE_STATIC_TEXT_CONTENT or STATE_PARSED_TEXT_CONTENT
            currentOpenTag = undefined;
        }

        function closeTag(tagName, pos, endPos) {
            if (!tagName) {
                throw new Error('Illegal state. Invalid tag name');
            }
            var lastTag = blockStack.length ? blockStack.pop() : undefined;

            if (pos == null && closeTagPos != null) {
                pos = closeTagPos;
                endPos = parser.pos + 1;
            }

            if (!lastTag || lastTag.type !== 'tag') {
                return notifyError(pos,
                    'EXTRA_CLOSING_TAG',
                    'The closing "' + tagName + '" tag was not expected');
            }

            if (!lastTag || (lastTag.expectedCloseTagName !== tagName && lastTag.tagName !== tagName)) {
                return notifyError(pos,
                    'MISMATCHED_CLOSING_TAG',
                    'The closing "' + tagName + '" tag does not match the corresponding opening "' + lastTag.expectedCloseTagName + '" tag');
            }

            tagName = lastTag.tagName;

            notifyCloseTag(tagName, pos, endPos);

            if (lastTag.beginMixedMode) {
                endingMixedModeAtEOL = true;
            }

            closeTagName = null;
            closeTagPos = null;

            lastTag = peek(blockStack);
            expectedCloseTagName = lastTag && lastTag.expectedCloseTagName;
        }

        function beginPart() {
            currentPart = {
                pos: parser.pos,
                parentState: parser.state
            };

            partStack.push(currentPart);

            return currentPart;
        }

        function endPart() {
            var last = partStack.pop();
            parser.endPos = parser.pos;
            parser.enterState(last.parentState);
            currentPart = partStack.length ? peek(partStack) : undefined;
            return last;
        }

        // Expression

        function beginExpression(endAfterGroup) {
            var expression = beginPart();
            expression.value = '';
            expression.groupStack = [];
            expression.endAfterGroup = endAfterGroup === true;
            expression.isStringLiteral = null;
            parser.enterState(STATE_EXPRESSION);
            return expression;
        }

        function endExpression() {
            var expression = endPart();
            expression.parentState.expression(expression);
        }

        // --------------------------

        // String

        function beginString(quoteChar, quoteCharCode) {
            var string = beginPart();
            string.stringParts = [];
            string.currentText = '';
            string.quoteChar = quoteChar;
            string.quoteCharCode = quoteCharCode;
            string.isStringLiteral = true;
            parser.enterState(STATE_STRING);
            return string;
        }

        function endString() {
            var string = endPart();
            string.parentState.string(string);
        }

        // --------------------------

        // Template String

        function beginTemplateString() {
            var templateString = beginPart();
            templateString.value = '`';
            parser.enterState(STATE_TEMPLATE_STRING);
            return templateString;
        }

        function endTemplateString() {
            var templateString = endPart();
            templateString.parentState.templateString(templateString);
        }

        // --------------------------


        // Scriptlet

        function beginScriptlet() {
            endText();

            var scriptlet = beginPart();
            scriptlet.value = '';
            scriptlet.quoteCharCode = null;
            parser.enterState(STATE_SCRIPTLET);
            return scriptlet;
        }

        function endScriptlet(endPos) {
            var scriptlet = endPart();
            scriptlet.endPos = endPos;
            notifyScriptlet(scriptlet);
        }

        // --------------------------


        // DTD

        function beginDocumentType() {
            endText();

            var documentType = beginPart();
            documentType.value = '';

            parser.enterState(STATE_DTD);
            return documentType;
        }

        function endDocumentType() {
            var documentType = endPart();
            notifyDocumentType(documentType);
        }

        // --------------------------

        // Declaration
        function beginDeclaration() {
            endText();

            var declaration = beginPart();
            declaration.value = '';
            parser.enterState(STATE_DECLARATION);
            return declaration;
        }

        function endDeclaration() {
            var declaration = endPart();
            notifyDeclaration(declaration);
        }

        // --------------------------

        // CDATA

        function beginCDATA() {
            endText();

            var cdata = beginPart();
            cdata.value = '';
            parser.enterState(STATE_CDATA);
            return cdata;
        }

        function endCDATA() {
            var cdata = endPart();
            notifyCDATA(cdata.value, cdata.pos, parser.pos + 3);
        }

        // --------------------------

        // JavaScript Comments
        function beginLineComment() {
            var comment = beginPart();
            comment.value = '';
            comment.type = 'line';
            parser.enterState(STATE_JS_COMMENT_LINE);
            return comment;
        }

        function beginBlockComment() {
            var comment = beginPart();
            comment.value = '';
            comment.type = 'block';
            parser.enterState(STATE_JS_COMMENT_BLOCK);
            return comment;
        }

        function endJavaScriptComment() {
            var comment = endPart();
            comment.rawValue = comment.type === 'line' ?
                '//' + comment.value :
                '/*' + comment.value + '*/';
            comment.parentState.comment(comment);
        }
        // --------------------------

        // HTML Comment

        function beginHtmlComment() {
            endText();
            var comment = beginPart();
            comment.value = '';
            parser.enterState(STATE_HTML_COMMENT);
            return comment;
        }

        function endHtmlComment() {
            var comment = endPart();
            comment.endPos = parser.pos + 3;
            notifyComment(comment);
        }

        // --------------------------

        // Trailing whitespace

        function beginCheckTrailingWhitespace(handler) {
            var part = beginPart();
            part.handler = handler;
            if (typeof handler !== 'function') {
                throw new Error('Invalid handler');
            }
            parser.enterState(STATE_CHECK_TRAILING_WHITESPACE);
        }

        function endCheckTrailingWhitespace(err, eof) {
            var part = endPart();
            part.handler(err, eof);
        }

        function handleTrailingWhitespaceJavaScriptComment(err) {
            if (err) {
                // This is a non-whitespace! We don't allow non-whitespace
                // after matching two or more hyphens. This is user error...
                notifyError(parser.pos,
                    'INVALID_CHARACTER',
                    'A non-whitespace of "' + err.ch + '" was found after a JavaScript block comment.');
            }

            return;
        }

        function handleTrailingWhitespaceMultilineHtmlBlcok(err, eof) {
            if (err) {
                // This is a non-whitespace! We don't allow non-whitespace
                // after matching two or more hyphens. This is user error...
                notifyError(parser.pos,
                    'INVALID_CHARACTER',
                    'A non-whitespace of "' + err.ch + '" was found on the same line as the ending delimiter ("' + htmlBlockDelimiter + '") for a multiline HTML block');
                return;
            }

            endHtmlBlock();

            if (eof) {
                htmlEOF();
            }

            return;
        }

        // --------------------------

        // Placeholder

        function beginPlaceholder(escape, withinTagName) {
            var placeholder = beginPart();
            placeholder.value = '';
            placeholder.escape = escape !== false;
            placeholder.type = 'placeholder';
            placeholder.withinBody = withinOpenTag !== true;
            placeholder.withinAttribute = currentAttribute != null;
            placeholder.withinString = placeholder.parentState === STATE_STRING;
            placeholder.withinOpenTag = withinOpenTag === true && currentAttribute == null;
            placeholder.withinTagName = withinTagName;
            placeholderDepth++;
            parser.enterState(STATE_PLACEHOLDER);
            return placeholder;
        }

        function endPlaceholder() {
            var placeholder = endPart();
            placeholderDepth--;

            var newExpression = notifyPlaceholder(placeholder);
            placeholder.value = newExpression;
            placeholder.parentState.placeholder(placeholder);
        }

        // --------------------------

        // Placeholder

        function beginTagNameShorthand(escape, withinTagName) {
            var shorthand = beginPart();
            shorthand.currentPart = null;
            shorthand.hasId = false;
            shorthand.beginPart = function(type) {
                shorthand.currentPart = {
                    type: type,
                    stringParts: [],
                    text: '',
                    _endText() {
                        if (this.text) {
                            this.stringParts.push(JSON.stringify(this.text));
                        }
                        this.text = '';
                    },
                    addPlaceholder(placeholder) {
                        this._endText();
                        this.stringParts.push('(' + placeholder.value + ')');
                    },
                    end() {
                        this._endText();

                        var expression = this.stringParts.join('+');

                        if (type === 'id') {
                            currentOpenTag.shorthandId = {
                                value: expression
                            };
                        } else if (type === 'class') {
                            if (!currentOpenTag.shorthandClassNames) {
                                currentOpenTag.shorthandClassNames = [];
                            }

                            currentOpenTag.shorthandClassNames.push({
                                value: expression
                            });


                        }
                    }
                };
            };
            parser.enterState(STATE_TAG_NAME_SHORTHAND);
            return shorthand;
        }

        function endTagNameShorthand() {
            var shorthand = endPart();
            if (shorthand.currentPart) {
                shorthand.currentPart.end();
            }
            parser.enterState(STATE_WITHIN_OPEN_TAG);
        }

        // --------------------------

        function getAndRemoveArgument(expression) {
            let start = expression.lastLeftParenPos;
            if (start != null) {
                // The tag has an argument that we need to slice off
                let end = expression.lastRightParenPos;
                if (end === expression.value.length - 1) {
                    var argument = {
                        value: expression.value.substring(start+1, end),
                        pos: expression.pos + start,
                        endPos: expression.pos + end + 1
                    };

                    // Chop off the argument from the expression
                    expression.value = expression.value.substring(0, start);
                    // Fix the end position for the expression
                    expression.endPos = expression.pos + expression.value.length;

                    return argument;
                }
            }

            return undefined;
        }

        // --------------------------

        function checkForPlaceholder(ch, code) {
            if (code === CODE_DOLLAR) {
                var nextCode = parser.lookAtCharCodeAhead(1);
                if (nextCode === CODE_OPEN_CURLY_BRACE) {
                    // We expect to start a placeholder at the first curly brace (the next character)
                    beginPlaceholder(true);
                    return true;
                } else if (nextCode === CODE_EXCLAMATION) {
                    var afterExclamationCode = parser.lookAtCharCodeAhead(2);
                    if (afterExclamationCode === CODE_OPEN_CURLY_BRACE) {
                        // We expect to start a placeholder at the first curly brace so skip
                        // past the exclamation point
                        beginPlaceholder(false);
                        parser.skip(1);
                        return true;
                    }
                }
            }

            return false;
        }

        function checkForEscapedPlaceholder(ch, code) {
            // Look for \${ and \$!{
            if (code === CODE_BACK_SLASH) {
                if (parser.lookAtCharCodeAhead(1) === CODE_DOLLAR) {
                    if (parser.lookAtCharCodeAhead(2) === CODE_OPEN_CURLY_BRACE) {
                        return true;
                    } else if (parser.lookAtCharCodeAhead(2) === CODE_EXCLAMATION) {
                        if (parser.lookAtCharCodeAhead(3) === CODE_OPEN_CURLY_BRACE) {
                            return true;
                        }
                    }
                }
            }

            return false;
        }

        function checkForEscapedEscapedPlaceholder(ch, code) {
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

        function checkForClosingTag() {
            // Look ahead to see if we found the closing tag that will
            // take us out of the EXPRESSION state...
            var lookAhead = '/' + expectedCloseTagName + '>';
            var match = parser.lookAheadFor(lookAhead);
            if (match) {
                endText();
                closeTag(expectedCloseTagName, parser.pos, parser.pos + 1 + lookAhead.length);
                parser.skip(match.length);
                parser.enterState(STATE_HTML_CONTENT);
                return true;
            }

            return false;
        }

        function checkForCDATA() {
            if (parser.lookAheadFor('![CDATA[')) {
                beginCDATA();
                parser.skip(8);
                return true;
            }

            return false;
        }

        function handleDelimitedBlockEOL(newLine) {
            // If we are within a delimited HTML block then we want to check if the next line is the end
            // delimiter. Since we are currently positioned at the start of the new line character our lookahead
            // will need to include the new line character, followed by the expected indentation, followed by
            // the delimiter.
            let endHtmlBlockLookahead = htmlBlockIndent + htmlBlockDelimiter;

            if (parser.lookAheadFor(endHtmlBlockLookahead, parser.pos + newLine.length)) {
                parser.skip(htmlBlockIndent.length);
                parser.skip(htmlBlockDelimiter.length);

                parser.enterState(STATE_CONCISE_HTML_CONTENT);

                beginCheckTrailingWhitespace(handleTrailingWhitespaceMultilineHtmlBlcok);
                return;
            } else if (parser.lookAheadFor(htmlBlockIndent, parser.pos + newLine.length)) {
                // We know the next line does not end the multiline HTML block, but we need to check if there
                // is any indentation that we need to skip over as we continue parsing the HTML in this
                // multiline HTML block

                parser.skip(htmlBlockIndent.length);
                // We stay in the same state since we are still parsing a multiline, delimited HTML block
            }
        }

        // In STATE_HTML_CONTENT we are looking for tags and placeholders but
        // everything in between is treated as text.
        var STATE_HTML_CONTENT = Parser.createState({
            name: 'STATE_HTML_CONTENT',

            placeholder(placeholder) {
                // We found a placeholder while parsing the HTML content. This function is called
                // from endPlaceholder(). We have already notified the listener of the placeholder so there is
                // nothing to do here
            },

            eol(newLine) {
                text += newLine;

                if (beginMixedMode) {
                    beginMixedMode = false;
                    endHtmlBlock();
                } else if (endingMixedModeAtEOL) {
                    endingMixedModeAtEOL = false;
                    endHtmlBlock();
                } else if (isWithinSingleLineHtmlBlock) {
                    // We are parsing "HTML" and we reached the end of the line. If we are within a single
                    // line HTML block then we should return back to the state to parse concise HTML.
                    // A single line HTML block can be at the end of the tag or on its own line:
                    //
                    // span class="hello" - This is an HTML block at the end of a tag
                    //     - This is an HTML block on its own line
                    //
                    endHtmlBlock();
                } else if (htmlBlockDelimiter) {
                    handleDelimitedBlockEOL(newLine);
                }
            },

            eof: htmlEOF,

            enter() {
                textParseMode = 'html';
                isConcise = false; // Back into non-concise HTML parsing
            },

            char(ch, code) {
                if (code === CODE_OPEN_ANGLE_BRACKET) {
                    if (checkForCDATA()) {
                        return;
                    }

                    var nextCode = parser.lookAtCharCodeAhead(1);

                    if (nextCode === CODE_PERCENT) {
                        beginScriptlet();
                        parser.skip(1);
                    } else if (parser.lookAheadFor('!--')) {
                        beginHtmlComment();
                        parser.skip(3);
                    } else if (nextCode === CODE_EXCLAMATION) {
                        // something like:
                        // <!DOCTYPE html>
                        // NOTE: We already checked for CDATA earlier and <!--
                        beginDocumentType();
                        parser.skip(1);
                    } else if (nextCode === CODE_QUESTION) {
                        // something like:
                        // <?xml version="1.0"?>
                        beginDeclaration();
                        parser.skip(1);
                    } else if (nextCode === CODE_FORWARD_SLASH) {
                        closeTagPos = parser.pos;
                        closeTagName = null;

                        parser.skip(1);
                        // something like:
                        // </html>
                        endText();

                        parser.enterState(STATE_CLOSE_TAG);
                    } else if (nextCode === CODE_CLOSE_ANGLE_BRACKET ||
                               nextCode === CODE_OPEN_ANGLE_BRACKET ||
                               isWhitespaceCode(nextCode)) {
                        // something like:
                        // "<>"
                        // "<<"
                        // "< "
                        // We'll treat this left angle brakect as text
                        text += '<';
                    } else {
                        beginOpenTag();
                        currentOpenTag.tagNameStart = parser.pos+1;
                    }
                } else if (!ignorePlaceholders && checkForEscapedEscapedPlaceholder(ch, code)) {
                    text += '\\';
                    parser.skip(1);
                }  else if (!ignorePlaceholders && checkForEscapedPlaceholder(ch, code)) {
                    text += '$';
                    parser.skip(1);
                } else if (!ignorePlaceholders && checkForPlaceholder(ch, code)) {
                    // We went into placeholder state...
                    endText();
                } else {
                    text += ch;
                }
            }
        });

        // In STATE_CONCISE_HTML_CONTENT we are looking for concise tags and text blocks based on indent
        var STATE_CONCISE_HTML_CONTENT = Parser.createState({
            name: 'STATE_CONCISE_HTML_CONTENT',

            eol(newLine) {
                text += newLine;
            },

            eof: htmlEOF,

            enter() {
                isConcise = true;
                indent = '';
            },

            comment(comment) {
                var value = comment.value;

                value = value.trim();

                notifyComment({
                    value: value,
                    pos: comment.pos,
                    endPos: comment.endPos
                });

                if (comment.type === 'block') {
                    // Make sure there is only whitespace on the line
                    // after the ending "*/" sequence
                    beginCheckTrailingWhitespace(handleTrailingWhitespaceJavaScriptComment);
                }
            },

            endTrailingWhitespace(eof) {
                endHtmlBlock();

                if (eof) {
                    htmlEOF();
                }
            },

            char(ch, code) {
                if (isWhitespaceCode(code)) {
                    indent += ch;
                } else  {
                    while(true) {
                        let len = blockStack.length;
                        if (len) {
                            let curBlock = blockStack[len - 1];
                            if (curBlock.indent.length >= indent.length) {
                                closeTag(curBlock.expectedCloseTagName);
                            } else {
                                // Indentation is greater than the last tag so we are starting a
                                // nested tag and there are no more tags to end
                                break;
                            }
                        } else {
                            if (indent) {
                                notifyError(parser.pos,
                                    'BAD_INDENTATION',
                                    'Line has extra indentation at the beginning');
                                return;
                            }
                            break;
                        }
                    }

                    var parent = blockStack.length && blockStack[blockStack.length - 1];
                    var body;

                    if (parent) {
                        body = parent.body;
                        if (parent.openTagOnly) {
                            notifyError(parser.pos,
                                'INVALID_BODY',
                                'The "' + parent.tagName + '" tag does not allow nested body content');
                            return;
                        }

                        if (parent.nestedIndent) {
                            if (parent.nestedIndent.length !== indent.length) {
                                notifyError(parser.pos,
                                    'BAD_INDENTATION',
                                    'Line indentation does match indentation of previous line');
                                return;
                            }
                        } else {
                            parent.nestedIndent = indent;
                        }
                    }

                    if (body && code !== CODE_HTML_BLOCK_DELIMITER) {
                        notifyError(parser.pos,
                            'ILLEGAL_LINE_START',
                            'A line within a tag that only allows text content must begin with a "-" character');
                        return;
                    }

                    if (code === CODE_OPEN_ANGLE_BRACKET || code === CODE_DOLLAR) {
                        beginMixedMode = true;
                        parser.rewind(1);
                        beginHtmlBlock();
                        return;
                    }

                    if (code === CODE_HTML_BLOCK_DELIMITER) {
                        if (parser.lookAtCharCodeAhead(1) === CODE_HTML_BLOCK_DELIMITER) {
                            // Two or more HTML block delimiters means we are starting a multiline, delimited HTML block
                            htmlBlockDelimiter = ch;
                            // We enter the following state to read in the full delimiter
                            return parser.enterState(STATE_BEGIN_DELIMITED_HTML_BLOCK);
                        } else {

                            if (parser.lookAtCharCodeAhead(1) === CODE_SPACE) {
                                // We skip over the first space
                                parser.skip(1);
                            }
                            isWithinSingleLineHtmlBlock = true;
                            beginHtmlBlock();
                        }
                    } else if (code === CODE_FORWARD_SLASH) {
                        // Check next character to see if we are in a comment
                        var nextCode = parser.lookAtCharCodeAhead(1);
                        if (nextCode === CODE_FORWARD_SLASH) {
                            beginLineComment();
                            parser.skip(1);
                            return;
                        } else if (nextCode === CODE_ASTERISK) {
                            beginBlockComment();
                            parser.skip(1);
                            return;
                        } else {
                            notifyError(parser.pos,
                                'ILLEGAL_LINE_START',
                                'A line in concise mode cannot start with "/" unless it starts a "//" or "/*" comment');
                            return;
                        }
                    } else {
                        beginOpenTag();
                        currentOpenTag.tagNameStart = parser.pos;
                        parser.rewind(1); // START_TAG_NAME expects to start at the first character
                    }
                }
            }
        });

        // In STATE_BEGIN_DELIMITED_HTML_BLOCK we have already found two consecutive hyphens. We expect
        // to reach the end of the line with only whitespace characters
        var STATE_BEGIN_DELIMITED_HTML_BLOCK = Parser.createState({
            name: 'STATE_BEGIN_DELIMITED_HTML_BLOCK',

            eol: function(newLine) {
                // We have reached the end of the first delimiter... we need to skip over any indentation on the next
                // line and we might also find that the multi-line, delimited block is immediately ended
                beginHtmlBlock(htmlBlockDelimiter);
                handleDelimitedBlockEOL(newLine);
            },

            eof: htmlEOF,

            char(ch, code) {
                if (code === CODE_HTML_BLOCK_DELIMITER) {
                    htmlBlockDelimiter += ch;
                } else if (isWhitespaceCode(code)) {
                    // Just whitespace... we are still good
                } else {
                    // This is a non-whitespace! We don't allow non-whitespace
                    // after matching two or more hyphens. This is user error...
                    notifyError(parser.pos,
                        'MALFORMED_MULTILINE_HTML_BLOCK',
                        'A non-whitespace of "' + ch + '" was found on the same line as a multiline HTML block delimiter ("' + htmlBlockDelimiter + '")');
                }
            }
        });

        var STATE_CHECK_TRAILING_WHITESPACE = Parser.createState({
            name: 'STATE_CHECK_TRAILING_WHITESPACE',

            eol: function() {
                endCheckTrailingWhitespace(null /* no error */, false /* not EOF */);
            },

            eof: function() {
                endCheckTrailingWhitespace(null /* no error */, true /* EOF */);
            },

            char(ch, code) {
                if (isWhitespaceCode(code)) {
                    // Just whitespace... we are still good
                } else {
                    endCheckTrailingWhitespace({
                        ch: ch
                    });
                }
            }
        });

        // We enter STATE_STATIC_TEXT_CONTENT when a listener manually chooses
        // to enter this state after seeing an openTag event for a tag
        // whose content should not be parsed at all (except for the purpose
        // of looking for the end tag).
        var STATE_STATIC_TEXT_CONTENT = Parser.createState({
            name: 'STATE_STATIC_TEXT_CONTENT',

            enter() {
                textParseMode = 'static-text';
            },

            eol(newLine) {
                text += newLine;

                if (isWithinSingleLineHtmlBlock) {
                    // We are parsing "HTML" and we reached the end of the line. If we are within a single
                    // line HTML block then we should return back to the state to parse concise HTML.
                    // A single line HTML block can be at the end of the tag or on its own line:
                    //
                    // span class="hello" - This is an HTML block at the end of a tag
                    //     - This is an HTML block on its own line
                    //
                    endHtmlBlock();
                } else if (htmlBlockDelimiter) {
                    handleDelimitedBlockEOL(newLine);
                }
            },

            eof: htmlEOF,

            char(ch, code) {
                // See if we need to see if we reached the closing tag...
                if (!isConcise && code === CODE_OPEN_ANGLE_BRACKET) {
                    if (checkForClosingTag()) {
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

            enter() {
                textParseMode = 'parsed-text';
            },

            placeholder: STATE_HTML_CONTENT.placeholder,

            eol(newLine) {
                text += newLine;

                if (isWithinSingleLineHtmlBlock) {
                    // We are parsing "HTML" and we reached the end of the line. If we are within a single
                    // line HTML block then we should return back to the state to parse concise HTML.
                    // A single line HTML block can be at the end of the tag or on its own line:
                    //
                    // span class="hello" - This is an HTML block at the end of a tag
                    //     - This is an HTML block on its own line
                    //
                    endHtmlBlock();
                } else if (htmlBlockDelimiter) {
                    handleDelimitedBlockEOL(newLine);
                }
            },

            eof: htmlEOF,

            char(ch, code) {
                if (!isConcise && code === CODE_OPEN_ANGLE_BRACKET) {
                    // First, see if we need to see if we reached the closing tag
                    // and then check if we encountered CDATA
                    if (checkForClosingTag()) {
                        return;
                    } else if (checkForCDATA()) {
                        return;
                    } else if (parser.lookAtCharCodeAhead(1) === CODE_PERCENT) {
                        beginScriptlet();
                        parser.skip(1);
                        return;
                    }
                } else if (!ignorePlaceholders && checkForEscapedEscapedPlaceholder(ch, code)) {
                    text += '\\';
                    parser.skip(1);
                }  else if (!ignorePlaceholders && checkForEscapedPlaceholder(ch, code)) {
                    text += '$';
                    parser.skip(1);
                } else if (!ignorePlaceholders && checkForPlaceholder(ch, code)) {
                    // We went into placeholder state...
                    endText();
                    return;
                }

                text += ch;
            }
        });

        // We enter STATE_TAG_NAME after we encounter a "<"
        // followed by a non-special character
        var STATE_TAG_NAME = Parser.createState({
            name: 'STATE_TAG_NAME',

            eol: openTagEOL,

            eof: openTagEOF,

            expression(expression) {
                var argument = getAndRemoveArgument(expression);

                if (argument) {
                    // The tag has an argument that we need to slice off

                    if (currentOpenTag.argument != null) {
                        notifyError(expression.endPos,
                            'ILLEGAL_TAG_ARGUMENT',
                            'A tag can only have one argument');
                    }

                    currentOpenTag.argument = argument;
                    currentOpenTag.tagNameEnd = expression.pos + expression.lastLeftParenPos + 1;
                } else {
                    currentOpenTag.tagNameEnd = expression.endPos;
                }


                if (expression.value) {
                    currentOpenTag.tagName += expression.value;

                    if (currentOpenTag.tagNameParts) {
                        currentOpenTag.tagNameParts.push(JSON.stringify(expression.value));
                    }
                }
            },

            placeholder(placeholder) {
                if (!currentOpenTag.tagNameParts) {
                    currentOpenTag.tagNameParts = [];

                    if (currentOpenTag.tagName) {
                        currentOpenTag.tagNameParts.push(JSON.stringify(currentOpenTag.tagName));
                    }
                }

                currentOpenTag.tagName += parser.substring(placeholder.pos, placeholder.endPos);
                currentOpenTag.tagNameParts.push('(' + placeholder.value + ')');
                currentOpenTag.tagNameEnd = placeholder.endPos;
            },

            enter(oldState) {
                if (oldState !== STATE_EXPRESSION) {
                    beginExpression();
                }
            },

            char(ch, code) {
                throw new Error('Illegal state');
            }
        });



        // We enter STATE_CDATA after we see "<![CDATA["
        var STATE_CDATA = Parser.createState({
            name: 'STATE_CDATA',

            enter() {
                textParseMode = 'cdata';
            },

            eof() {
                notifyError(currentPart.pos,
                    'MALFORMED_CDATA',
                    'EOF reached while parsing CDATA');
            },

            char(ch, code) {
                if (code === CODE_CLOSE_SQUARE_BRACKET) {
                    var match = parser.lookAheadFor(']>');
                    if (match) {
                        endCDATA();
                        parser.skip(match.length);
                        return;
                    }
                }

                currentPart.value += ch;
            }
        });

        // We enter STATE_CLOSE_TAG after we see "</"
        var STATE_CLOSE_TAG = Parser.createState({
            name: 'STATE_CLOSE_TAG',
            eof() {
                notifyError(closeTag.pos,
                    'MALFORMED_CLOSE_TAG',
                    'EOF reached while parsing closing tag');
            },

            enter() {
                closeTagName = '';
            },

            char(ch, code) {
                if (code === CODE_CLOSE_ANGLE_BRACKET) {
                    if (closeTagName.length > 0) {
                        closeTag(closeTagName, closeTagPos, parser.pos + 1);
                    } else {
                        closeTag(expectedCloseTagName, closeTagPos, parser.pos + 1);
                    }

                    parser.enterState(STATE_HTML_CONTENT);
                } else {
                    closeTagName += ch;
                }
            }
        });

        // We enter STATE_WITHIN_OPEN_TAG after we have fully
        // read in the tag name and encountered a whitespace character
        var STATE_WITHIN_OPEN_TAG = Parser.createState({
            name: 'STATE_WITHIN_OPEN_TAG',

            eol: openTagEOL,

            eof: openTagEOF,

            expression(expression) {
                var argument = getAndRemoveArgument(expression);

                if (argument) {
                    // We found an argument... the argument could be for an attribute or the tag
                    if (currentOpenTag.attributes.length === 0) {
                        if (currentOpenTag.argument != null) {
                            notifyError(expression.endPos,
                                'ILLEGAL_TAG_ARGUMENT',
                                'A tag can only have one argument');
                            return;
                        }
                        currentOpenTag.argument = argument;
                    } else {
                        let targetAttribute = currentAttribute || peek(currentOpenTag.attributes);

                        if (targetAttribute.argument != null) {
                            notifyError(expression.endPos,
                                'ILLEGAL_ATTRIBUTE_ARGUMENT',
                                'An attribute can only have one argument');
                            return;
                        }
                        targetAttribute.argument = argument;
                    }
                }
            },

            placeholder(placeholder) {
                var attr = beginAttribute();
                attr.value = placeholder.value;
                endAttribute();

                parser.enterState(STATE_AFTER_PLACEHOLDER_WITHIN_TAG);
            },

            comment(comment) {
                /* Ignore comments within an open tag */
            },

            char(ch, code) {

                if (isConcise) {
                    if (code === CODE_HTML_BLOCK_DELIMITER) {
                        if (currentOpenTag.withinAttrGroup) {
                            notifyError(currentOpenTag.pos,
                                'MALFORMED_OPEN_TAG',
                                'Attribute group was not properly ended');
                            return;
                        }

                        // The open tag is complete
                        finishOpenTag();

                        let nextCode = parser.lookAtCharCodeAhead(1);
                        if (nextCode !== CODE_NEWLINE && nextCode !== CODE_CARRIAGE_RETURN &&
                            isWhitespaceCode(nextCode)) {
                            // We want to remove the first whitespace character after the `-` symbol
                            parser.skip(1);
                        }

                        isWithinSingleLineHtmlBlock = true;
                        beginHtmlBlock();
                        return;
                    } else if (code === CODE_OPEN_SQUARE_BRACKET) {
                        if (currentOpenTag.withinAttrGroup) {
                            notifyError(parser.pos,
                                'MALFORMED_OPEN_TAG',
                                'Unexpected "[" character within open tag.');
                            return;
                        }

                        currentOpenTag.withinAttrGroup = true;
                        return;
                    } else if (code === CODE_CLOSE_SQUARE_BRACKET) {
                        if (!currentOpenTag.withinAttrGroup) {
                            notifyError(parser.pos,
                                'MALFORMED_OPEN_TAG',
                                'Unexpected "]" character within open tag.');
                            return;
                        }

                        currentOpenTag.withinAttrGroup = false;
                        return;
                    }
                } else {
                    if (code === CODE_CLOSE_ANGLE_BRACKET) {
                        finishOpenTag();
                        return;
                    } else if (code === CODE_FORWARD_SLASH) {
                        let nextCode = parser.lookAtCharCodeAhead(1);
                        if (nextCode === CODE_CLOSE_ANGLE_BRACKET) {
                            finishOpenTag(true /* self closed */);
                            parser.skip(1);
                            return;
                        }
                    }
                }

                if (checkForEscapedEscapedPlaceholder(ch, code)) {
                    let attr = beginAttribute();
                    attr.name = '\\';
                    parser.skip(1);
                    return;
                }  else if (checkForEscapedPlaceholder(ch, code)) {
                    let attr = beginAttribute();
                    attr.name = '$';
                    parser.skip(1);
                    return;
                } else if (checkForPlaceholder(ch, code)) {
                    return;
                }

                if (code === CODE_OPEN_ANGLE_BRACKET) {
                    return notifyError(parser.pos,
                        'ILLEGAL_ATTRIBUTE_NAME',
                        'Invalid attribute name. Attribute name cannot begin with the "<" character.');
                }

                if (code === CODE_FORWARD_SLASH && parser.lookAtCharCodeAhead(1) === CODE_ASTERISK) {
                    // Skip over code inside a JavaScript block comment
                    beginBlockComment();
                    parser.skip(1);
                    return;
                }

                if (isWhitespaceCode(code)) {
                    // ignore whitespace within element...
                } else if (code === CODE_OPEN_PAREN) {
                    parser.rewind(1);
                    beginExpression();
                    // encountered something like:
                    // <for (var i = 0; i < len; i++)>
                } else {
                    parser.rewind(1);
                    // attribute name is initially the first non-whitespace
                    // character that we found
                    beginAttribute();
                }
            }
        });

        // We enter STATE_ATTRIBUTE_NAME when we see a non-whitespace
        // character after reading the tag name
        var STATE_ATTRIBUTE_NAME = Parser.createState({
            name: 'STATE_ATTRIBUTE_NAME',

            eol: openTagEOL,

            eof: openTagEOF,

            expression(expression) {
                var argument = getAndRemoveArgument(expression);
                if (argument) {
                    // The tag has an argument that we need to slice off
                    currentAttribute.argument = argument;
                }

                currentAttribute.name = currentAttribute.name ? currentAttribute.name + expression.value : expression.value;
                currentAttribute.pos = expression.pos;
                currentAttribute.endPos = expression.endPos;
            },

            enter(oldState) {
                if (oldState !== STATE_EXPRESSION) {
                    beginExpression();
                }
            },

            char(ch, code) {
                throw new Error('Illegal state');
            }
        });

        // We enter STATE_ATTRIBUTE_VALUE when we see a "=" while in
        // the ATTRIBUTE_NAME state.
        var STATE_ATTRIBUTE_VALUE = Parser.createState({
            name: 'STATE_ATTRIBUTE_VALUE',

            expression(expression) {
                var value = expression.value;

                if (value === '') {

                    return notifyError(expression.pos,
                        'ILLEGAL_ATTRIBUTE_VALUE',
                        'No attribute value found after "="');
                }
                currentAttribute.value = value;
                currentAttribute.pos = expression.pos;
                currentAttribute.endPos = expression.endPos;

                // If the expression evaluates to a literal value then add the
                // `literalValue` property to the attribute
                if (expression.isStringLiteral) {
                    currentAttribute.literalValue = evaluateStringExpression(value, expression.pos, notifyError);
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
                endAttribute();
            },

            eol: openTagEOL,

            eof: openTagEOF,

            enter(oldState) {
                if (oldState !== STATE_EXPRESSION) {
                    beginExpression();
                }
            },

            char(ch, code) {
                throw new Error('Illegal state');
            }
        });

        var STATE_EXPRESSION = Parser.createState({
            name: 'STATE_EXPRESSION',

            eol(str) {
                let depth = currentPart.groupStack.length;

                if (depth === 0) {
                    if (currentPart.parentState === STATE_ATTRIBUTE_NAME || currentPart.parentState === STATE_ATTRIBUTE_VALUE) {
                        currentPart.endPos = parser.pos;
                        endExpression();
                        // We encountered a whitespace character while parsing the attribute name. That
                        // means the attribute name has ended and we should continue parsing within the
                        // open tag
                        endAttribute();

                        if (isConcise) {
                            openTagEOL();
                        }
                        return;
                    } else if (currentPart.parentState === STATE_TAG_NAME) {
                        currentPart.endPos = parser.pos;
                        endExpression();

                        // We encountered a whitespace character while parsing the attribute name. That
                        // means the attribute name has ended and we should continue parsing within the
                        // open tag
                        if (parser.state !== STATE_WITHIN_OPEN_TAG) {
                            // Make sure we transition into parsing within the open tag
                            parser.enterState(STATE_WITHIN_OPEN_TAG);
                        }

                        if (isConcise) {
                            openTagEOL();
                        }

                        return;
                    }
                }

                currentPart.value += str;
            },

            eof() {
                if (isConcise && currentPart.groupStack.length === 0) {
                    currentPart.endPos = parser.pos;
                    endExpression();
                    openTagEOF();
                } else {
                    let parentState = currentPart.parentState;

                    if (parentState === STATE_ATTRIBUTE_NAME) {
                        return notifyError(currentPart.pos,
                            'MALFORMED_OPEN_TAG',
                            'EOF reached while parsing attribute name for the "' + currentOpenTag.tagName + '" tag');
                    } else if (parentState === STATE_ATTRIBUTE_VALUE) {
                        return notifyError(currentPart.pos,
                            'MALFORMED_OPEN_TAG',
                            'EOF reached while parsing attribute value for the "' + currentAttribute.name + '" attribute');
                    } else if (parentState === STATE_TAG_NAME) {
                        return notifyError(currentPart.pos,
                            'MALFORMED_OPEN_TAG',
                            'EOF reached while parsing tag name');
                    } else if (parentState === STATE_PLACEHOLDER) {
                        return notifyError(currentPart.pos,
                            'MALFORMED_PLACEHOLDER',
                            'EOF reached while parsing placeholder');
                    }

                    return notifyError(currentPart.pos,
                        'INVALID_EXPRESSION',
                        'EOF reached will parsing expression');
                }
            },

            string(string) {
                if (currentPart.value === '') {
                    currentPart.isStringLiteral = string.isStringLiteral === true;
                } else {
                    // More than one strings means it is for sure not a string literal...
                    currentPart.isStringLiteral = false;
                }

                currentPart.value += string.value;
            },

            comment(comment) {
                currentPart.isStringLiteral = false;
                currentPart.value += comment.rawValue;
            },

            templateString(templateString) {
                currentPart.isStringLiteral = false;
                currentPart.value += templateString.value;
            },

            char(ch, code) {
                let depth = currentPart.groupStack.length;
                let parentState = currentPart.parentState;

                if (code === CODE_SINGLE_QUOTE) {
                    return beginString("'", CODE_SINGLE_QUOTE);
                } else if (code === CODE_DOUBLE_QUOTE) {
                    return beginString('"', CODE_DOUBLE_QUOTE);
                } else if (code === CODE_BACKTICK) {
                    return beginTemplateString();
                } else if (code === CODE_FORWARD_SLASH) {
                    // Check next character to see if we are in a comment
                    var nextCode = parser.lookAtCharCodeAhead(1);
                    if (nextCode === CODE_FORWARD_SLASH) {
                        beginLineComment();
                        parser.skip(1);
                        return;
                    } else if (nextCode === CODE_ASTERISK) {

                        beginBlockComment();
                        parser.skip(1);
                        return;
                    } else if (depth === 0 && !isConcise && nextCode === CODE_CLOSE_ANGLE_BRACKET) {
                        // Let the STATE_WITHIN_OPEN_TAG state deal with the ending tag sequence
                        currentPart.endPos = parser.pos;
                        endExpression();
                        parser.rewind(1);

                        if (parser.state !== STATE_WITHIN_OPEN_TAG) {
                            // Make sure we transition into parsing within the open tag
                            parser.enterState(STATE_WITHIN_OPEN_TAG);
                        }
                        return;
                    }
                } else if (code === CODE_OPEN_PAREN ||
                           code === CODE_OPEN_SQUARE_BRACKET ||
                           code === CODE_OPEN_CURLY_BRACE) {

                    if (depth === 0 && code === CODE_OPEN_PAREN) {
                        currentPart.lastLeftParenPos = currentPart.value.length;
                    }

                    currentPart.groupStack.push(code);
                    currentPart.isStringLiteral = false;
                    currentPart.value += ch;
                    return;
                } else if (code === CODE_CLOSE_PAREN ||
                           code === CODE_CLOSE_SQUARE_BRACKET ||
                           code === CODE_CLOSE_CURLY_BRACE) {

                    if (depth === 0) {
                        if (code === CODE_CLOSE_SQUARE_BRACKET) {
                            // We are ending the attribute group so end this expression and let the
                            // STATE_WITHIN_OPEN_TAG state deal with the ending attribute group
                            if (currentOpenTag.withinAttrGroup) {
                                currentPart.endPos = parser.pos + 1;
                                endExpression();
                                // Let the STATE_WITHIN_OPEN_TAG state deal with the ending tag sequence
                                parser.rewind(1);
                                if (parser.state !== STATE_WITHIN_OPEN_TAG) {
                                    // Make sure we transition into parsing within the open tag
                                    parser.enterState(STATE_WITHIN_OPEN_TAG);
                                }
                                return;
                            }
                        } else {
                            return notifyError(currentPart.pos,
                                'INVALID_EXPRESSION',
                                'Mismatched group. A closing "' + ch + '" character was found but it is not matched with a corresponding opening character.');
                        }
                    }


                    let matchingGroupCharCode = currentPart.groupStack.pop();

                    if ((code === CODE_CLOSE_PAREN && matchingGroupCharCode !== CODE_OPEN_PAREN) ||
                        (code === CODE_CLOSE_SQUARE_BRACKET && matchingGroupCharCode !== CODE_OPEN_SQUARE_BRACKET) ||
                        (code === CODE_CLOSE_CURLY_BRACE && matchingGroupCharCode !== CODE_OPEN_CURLY_BRACE)) {
                            return notifyError(currentPart.pos,
                                'INVALID_EXPRESSION',
                                'Mismatched group. A "' + ch + '" character was found when "' + String.fromCharCode(matchingGroupCharCode) + '" was expected.');
                    }

                    currentPart.value += ch;

                    if (currentPart.groupStack.length === 0) {
                        if (code === CODE_CLOSE_PAREN) {
                            currentPart.lastRightParenPos = currentPart.value.length - 1;
                        } else if (code === CODE_CLOSE_CURLY_BRACE && parentState === STATE_PLACEHOLDER) {
                            currentPart.endPos = parser.pos + 1;
                            endExpression();
                            return;
                        }
                    }

                    return;
                } else if (depth === 0) {
                    if (!isConcise) {
                        if (code === CODE_CLOSE_ANGLE_BRACKET &&
                            (parentState === STATE_TAG_NAME ||
                             parentState === STATE_ATTRIBUTE_NAME ||
                             parentState === STATE_ATTRIBUTE_VALUE ||
                             parentState === STATE_WITHIN_OPEN_TAG)) {
                            currentPart.endPos = parser.pos;
                            endExpression();
                            endAttribute();
                            // Let the STATE_WITHIN_OPEN_TAG state deal with the ending tag sequence
                            parser.rewind(1);
                            if (parser.state !== STATE_WITHIN_OPEN_TAG) {
                                // Make sure we transition into parsing within the open tag
                                parser.enterState(STATE_WITHIN_OPEN_TAG);
                            }
                            return;
                        }
                    }

                    if (isWhitespaceCode(code)) {
                        currentPart.endPos = parser.pos;
                        endExpression();
                        endAttribute();
                        if (parser.state !== STATE_WITHIN_OPEN_TAG) {
                            // Make sure we transition into parsing within the open tag
                            parser.enterState(STATE_WITHIN_OPEN_TAG);
                        }
                        return;
                    } else if (code === CODE_EQUAL && parentState === STATE_ATTRIBUTE_NAME) {
                        currentPart.endPos = parser.pos;
                        endExpression();
                        // We encountered "=" which means we need to start reading
                        // the attribute value.
                        parser.enterState(STATE_ATTRIBUTE_VALUE);
                        return;
                    }

                    if (currentPart.parentState === STATE_TAG_NAME) {
                        if (checkForEscapedEscapedPlaceholder(ch, code)) {
                            currentPart.value += '\\';
                            parser.skip(1);
                            return;
                        }  else if (checkForEscapedPlaceholder(ch, code)) {
                            currentPart.value += '$';
                            parser.skip(1);
                            return;
                        } else if (code === CODE_DOLLAR && parser.lookAtCharCodeAhead(1) === CODE_OPEN_CURLY_BRACE) {
                            currentPart.endPos = parser.pos;
                            endExpression();
                            // We expect to start a placeholder at the first curly brace (the next character)
                            beginPlaceholder(true, true /* tag name */);
                            return;
                        } else if (code === CODE_PERIOD || code === CODE_NUMBER_SIGN) {
                            endExpression();
                            parser.rewind(1);
                            beginTagNameShorthand();
                            return;
                        }
                    }
                }

                currentPart.value += ch;
            }
        });

        var STATE_TAG_NAME_SHORTHAND = Parser.createState({
            name: 'STATE_TAG_NAME_SHORTHAND',

            placeholder(placeholder) {
                var shorthand = currentPart;
                shorthand.currentPart.addPlaceholder(placeholder);
            },

            eol(str) {
                currentOpenTag.tagNameEnd = parser.pos;
                endTagNameShorthand();

                if (parser.state !== STATE_WITHIN_OPEN_TAG) {
                    // Make sure we transition into parsing within the open tag
                    parser.enterState(STATE_WITHIN_OPEN_TAG);
                }

                if (isConcise) {
                    openTagEOL();
                }
            },

            eof() {
                endTagNameShorthand();

                if (isConcise) {
                    openTagEOF();
                } else {
                    return notifyError(currentPart.pos,
                        'INVALID_TAG_SHORTHAND',
                        'EOF reached will parsing id/class shorthand in tag name');
                }
            },

            char(ch, code) {
                var shorthand = currentPart;
                if (!isConcise) {
                    if (code === CODE_CLOSE_ANGLE_BRACKET || code === CODE_FORWARD_SLASH) {
                        currentOpenTag.tagNameEnd = parser.pos;
                        endTagNameShorthand();
                        parser.rewind(1);
                        return;
                    }
                }

                if (isWhitespaceCode(code)) {
                    endTagNameShorthand();
                    currentOpenTag.tagNameEnd = parser.pos;
                    if (parser.state !== STATE_WITHIN_OPEN_TAG) {
                        parser.enterState(STATE_WITHIN_OPEN_TAG);
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
                        return notifyError(currentPart.pos,
                            'INVALID_TAG_SHORTHAND',
                            'Multiple shorthand ID parts are not allowed on the same tag');
                    }

                    shorthand.hasId = true;

                    if (shorthand.currentPart) {
                        shorthand.currentPart.end();
                    }

                    shorthand.beginPart('id');
                }

                else if (!ignorePlaceholders && checkForEscapedEscapedPlaceholder(ch, code)) {
                    shorthand.currentPart.text += '\\';
                    parser.skip(1);
                }  else if (!ignorePlaceholders && checkForEscapedPlaceholder(ch, code)) {
                    shorthand.currentPart.text += '$';
                    parser.skip(1);
                } else if (!ignorePlaceholders && checkForPlaceholder(ch, code)) {
                    // We went into placeholder state...
                } else {
                    shorthand.currentPart.text += ch;
                }
            }
        });

        // We enter STATE_WITHIN_OPEN_TAG after we have fully
        // read in the tag name and encountered a whitespace character
        var STATE_AFTER_PLACEHOLDER_WITHIN_TAG = Parser.createState({
            name: 'STATE_AFTER_PLACEHOLDER_WITHIN_TAG',

            eol: openTagEOL,

            eof: openTagEOF,

            char(ch, code) {

                if (!isConcise) {
                    if (code === CODE_CLOSE_ANGLE_BRACKET) {
                        finishOpenTag();
                        return;
                    } else if (code === CODE_FORWARD_SLASH) {
                        let nextCode = parser.lookAtCharCodeAhead(1);
                        if (nextCode === CODE_CLOSE_ANGLE_BRACKET) {
                            finishOpenTag(true /* self closed */);
                            parser.skip(1);
                            return;
                        }
                    }
                }

                if (isWhitespaceCode(code)) {
                    parser.enterState(STATE_WITHIN_OPEN_TAG);
                } else {
                    notifyError(parser.pos,
                        'UNEXPECTED_TEXT_AFTER_PLACEHOLDER_IN_TAG',
                        `An unexpected "${ch}" character was found after a placeoholder within the open tag.`);
                    return;
                }
            }
        });

        var STATE_PLACEHOLDER = Parser.createState({
            name: 'STATE_PLACEHOLDER',

            expression(expression) {
                currentPart.value = expression.value.slice(1, -1); // Chop off the curly braces
                currentPart.endPos = expression.endPos;
                endPlaceholder();
            },

            eol(str) {
                throw new Error('Illegal state. EOL not expected');
            },

            eof() {
                throw new Error('Illegal state. EOF not expected');
            },

            enter(oldState) {
                if (oldState !== STATE_EXPRESSION) {
                    beginExpression();
                }
            }
        });

        var STATE_STRING = Parser.createState({
            name: 'STATE_STRING',

            placeholder(placeholder) {
                if (currentPart.currentText) {
                    currentPart.stringParts.push(currentPart.currentText);
                    currentPart.currentText = '';
                }
                currentPart.isStringLiteral = false;
                currentPart.stringParts.push(placeholder);
            },

            eol(str) {
                // New line characters are not allowed in JavaScript string expressions. We need to use
                // a different character sequence, but we don't want to through off positions so we need
                // to use a replacement sequence with the same number of characters.
                if (str.length === 2) {
                    currentPart.currentText += '\\r\\n';
                } else {
                    currentPart.currentText += '\\n';
                }

            },

            eof() {
                if (placeholderDepth > 0) {
                    notifyError(parser.pos,
                        'INVALID_STRING',
                        'EOF reached while parsing string expression found inside placeholder');
                    return;
                }
                notifyError(parser.pos,
                    'INVALID_STRING',
                    'EOF reached while parsing string expression');
            },

            char(ch, code) {
                var stringParts = currentPart.stringParts;

                var nextCh;
                var quoteCharCode = currentPart.quoteCharCode;

                if (code === CODE_BACK_SLASH) {
                    if (checkForEscapedEscapedPlaceholder(ch, code)) {
                        if (ignorePlaceholders) {
                            // We are actually adding two escaped backslashes here...
                            currentPart.currentText += '\\\\\\\\';
                        } else {
                            currentPart.currentText += '\\';
                        }
                    }  else if (checkForEscapedPlaceholder(ch, code)) {
                        if (ignorePlaceholders) {
                            // We are actually adding one escaped backslashes here...
                            currentPart.currentText += '\\\\$';
                        } else {
                            currentPart.currentText += '$';
                        }
                    } else {
                        // Handle string escape sequence
                        nextCh = parser.lookAtCharAhead(1);
                        currentPart.currentText += ch + nextCh;
                    }

                    parser.skip(1);
                } else if (code === quoteCharCode) {
                    // We encountered the end delimiter
                    if (currentPart.currentText) {
                        stringParts.push(currentPart.currentText);
                    }

                    let stringExpr = '';
                    let quoteChar =  currentPart.quoteChar;

                    if (stringParts.length) {
                        for (let i=0; i<stringParts.length; i++) {
                            let part = stringParts[i];
                            if (i !== 0) {
                                stringExpr += '+';
                            }

                            if (typeof part === 'string') {
                                stringExpr += quoteChar + part + quoteChar;
                            } else {
                                stringExpr += '(' + part.value + ')';
                            }
                        }
                    } else {
                        // Just an empty string...
                        stringExpr = quoteChar + quoteChar;
                    }

                    if (stringParts.length > 1) {
                        stringExpr = '(' + stringExpr + ')';
                    }

                    currentPart.value = stringExpr;
                    endString();
                } else if (!ignorePlaceholders && checkForPlaceholder(ch, code)) {
                    if (currentPart.currentText) {
                        stringParts.push(currentPart.currentText);
                    }

                    currentPart.currentText = '';
                    // We encountered nested placeholder...
                    currentPart.isStringLiteral = false;
                } else {
                    currentPart.currentText += ch;
                }
            }
        });

        var STATE_TEMPLATE_STRING = Parser.createState({
            name: 'STATE_TEMPLATE_STRING',

            placeholder: function(placeholder) {
                if (currentPart.currentText) {
                    currentPart.stringParts.push(currentPart.currentText);
                    currentPart.currentText = '';
                }
                currentPart.isStringLiteral = false;
                currentPart.stringParts.push(placeholder);
            },

            eol(str) {
                // Convert the EOL sequence ot the equivalent string escape sequences... Not necessary
                // for template strings but it is equivalent.
                if (str.length === 2) {
                    currentPart.value += '\\r\\n';
                } else {
                    currentPart.value += '\\n';
                }
            },

            eof() {
                notifyError(parser.pos,
                    'INVALID_TEMPLATE_STRING',
                    'EOF reached while parsing template string expression');
            },

            char(ch, code) {
                var nextCh;
                currentPart.value += ch;
                if (code === CODE_BACK_SLASH) {
                    // Handle string escape sequence
                    nextCh = parser.lookAtCharAhead(1);
                    parser.skip(1);

                    currentPart.value += nextCh;
                } else if (code === CODE_BACKTICK) {
                    endTemplateString();
                }
            }
        });

        // We enter STATE_JS_COMMENT_BLOCK after we encounter a "/*" sequence
        // while in STATE_ATTRIBUTE_VALUE or STATE_DELIMITED_EXPRESSION.
        // We leave STATE_JS_COMMENT_BLOCK when we see a "*/" sequence.
        var STATE_JS_COMMENT_BLOCK = Parser.createState({
            name: 'STATE_JS_COMMENT_BLOCK',

            eol(str) {
                currentPart.value += str;
            },

            eof() {
                notifyError(currentPart.pos,
                    'MALFORMED_COMMENT',
                    'EOF reached while parsing multi-line JavaScript comment');
            },

            char(ch, code) {


                if (code === CODE_ASTERISK) {
                    var nextCode = parser.lookAtCharCodeAhead(1);
                    if (nextCode === CODE_FORWARD_SLASH) {
                        currentPart.endPos = parser.pos + 2;
                        endJavaScriptComment();
                        parser.skip(1);
                        return;
                    }
                }

                currentPart.value += ch;
            }
        });

        // We enter STATE_JS_COMMENT_LINE after we encounter a "//" sequence
        // when parsing JavaScript code.
        // We leave STATE_JS_COMMENT_LINE when we see a newline character.
        var STATE_JS_COMMENT_LINE = Parser.createState({
            name: 'STATE_JS_COMMENT_LINE',

            eol(str) {
                currentPart.value += str;
                currentPart.endPos = parser.pos;
                endJavaScriptComment();
            },

            eof() {
                currentPart.endPos = parser.pos;
                endJavaScriptComment();
            },

            char(ch, code) {
                currentPart.value += ch;
            }
        });

        // We enter STATE_DTD after we encounter a "<!" while in the STATE_HTML_CONTENT.
        // We leave STATE_DTD if we see a ">".
        var STATE_DTD = Parser.createState({
            name: 'STATE_DTD',

            eol(str) {
                currentPart.value += str;
            },

            eof() {
                notifyError(currentPart.pos,
                    'MALFORMED_DOCUMENT_TYPE',
                    'EOF reached while parsing document type');
            },

            char(ch, code) {
                if (code === CODE_CLOSE_ANGLE_BRACKET) {
                    currentPart.endPos = parser.pos + 1;
                    endDocumentType();
                } else {
                    currentPart.value += ch;
                }
            }
        });

        // We enter STATE_DECLARATION after we encounter a "<?"
        // while in the STATE_HTML_CONTENT.
        // We leave STATE_DECLARATION if we see a "?>" or ">".
        var STATE_DECLARATION = Parser.createState({
            name: 'STATE_DECLARATION',

            eol(str) {
                currentPart.value += str;
            },

            eof() {
                notifyError(currentPart.pos,
                    'MALFORMED_DECLARATION',
                    'EOF reached while parsing declaration');
            },

            char(ch, code) {
                if (code === CODE_QUESTION) {
                    var nextCode = parser.lookAtCharCodeAhead(1);
                    if (nextCode === CODE_CLOSE_ANGLE_BRACKET) {
                        currentPart.endPos = parser.pos + 2;
                        endDeclaration();
                        parser.skip(1);
                    }
                } else if (code === CODE_CLOSE_ANGLE_BRACKET) {
                    currentPart.endPos = parser.pos + 1;
                    endDeclaration();
                } else {
                    currentPart.value += ch;
                }
            }
        });

        // We enter STATE_HTML_COMMENT after we encounter a "<--"
        // while in the STATE_HTML_CONTENT.
        // We leave STATE_HTML_COMMENT when we see a "-->".
        var STATE_HTML_COMMENT = Parser.createState({
            name: 'STATE_HTML_COMMENT',

            eol(newLineChars) {
                currentPart.value += newLineChars;
            },

            eof() {
                notifyError(currentPart.pos,
                    'MALFORMED_COMMENT',
                    'EOF reached while parsing comment');
            },

            char(ch, code) {
                if (code === CODE_HYPHEN) {
                    var match = parser.lookAheadFor('->');
                    if (match) {
                        currentPart.endPos = parser.pos + 3;
                        endHtmlComment();
                        parser.skip(match.length);
                    } else {
                        currentPart.value += ch;
                    }
                } else {
                    currentPart.value += ch;
                }
            }
        });

        // We enter STATE_SCRIPTLET after we encounter a "<%" while in STATE_HTML_CONTENT.
        // We leave STATE_SCRIPTLET if we see a "%>".
        var STATE_SCRIPTLET = Parser.createState({
            name: 'STATE_SCRIPTLET',

            eol(str) {
                currentPart.value += str;
            },

            eof() {
                notifyError(currentPart.pos,
                    'MALFORMED_SCRIPTLET',
                    'EOF reached while parsing scriptlet');
            },

            comment(comment) {
                currentPart.value += comment.rawValue;
            },

            char(ch, code) {
                if (currentPart.quoteCharCode) {
                    currentPart.value += ch;

                    // We are within a string... only look for ending string code
                    if (code === CODE_BACK_SLASH) {
                        // Handle string escape sequence
                        currentPart.value += parser.lookAtCharAhead(1);
                        parser.skip(1);
                    } else if (code === currentPart.quoteCharCode) {
                        currentPart.quoteCharCode = null;
                    }
                    return;
                } else if (code === CODE_FORWARD_SLASH) {
                    if (parser.lookAtCharCodeAhead(1) === CODE_ASTERISK) {
                        // Skip over code inside a JavaScript block comment
                        beginBlockComment();
                        parser.skip(1);
                        return;
                    }
                } else if (code === CODE_SINGLE_QUOTE || code === CODE_DOUBLE_QUOTE) {
                    currentPart.quoteCharCode = code;
                } else if (code === CODE_PERCENT) {
                    if (parser.lookAtCharCodeAhead(1) === CODE_CLOSE_ANGLE_BRACKET) {
                        endScriptlet(parser.pos + 2 /* end pos */);
                        parser.skip(1); // Skip over the closing right angle bracket
                        return;
                    }
                }

                currentPart.value += ch;
            }
        });

        parser.enterHtmlContentState = function() {
            if (parser.state !== STATE_HTML_CONTENT) {
                parser.enterState(STATE_HTML_CONTENT);
            }
        };

        parser.enterConciseHtmlContentState = function() {
            if (parser.state !== STATE_CONCISE_HTML_CONTENT) {
                parser.enterState(STATE_CONCISE_HTML_CONTENT);
            }
        };

        parser.enterParsedTextContentState = function() {
            var last = blockStack.length && blockStack[blockStack.length - 1];

            if (!last || !last.tagName) {
                throw new Error('The "parsed text content" parser state is only allowed within a tag');
            }

            if (isConcise) {
                // We will transition into the STATE_PARSED_TEXT_CONTENT state
                // for each of the nested HTML blocks
                last.body = BODY_PARSED_TEXT;
                parser.enterState(STATE_CONCISE_HTML_CONTENT);
            } else {
                parser.enterState(STATE_PARSED_TEXT_CONTENT);
            }
        };

        parser.enterJsContentState = parser.enterParsedTextContentState;
        parser.enterCssContentState = parser.enterParsedTextContentState;

        parser.enterStaticTextContentState = function() {
            var last = blockStack.length && blockStack[blockStack.length - 1];

            if (!last || !last.tagName) {
                throw new Error('The "static text content" parser state is only allowed within a tag');
            }

            if (isConcise) {
                // We will transition into the STATE_STATIC_TEXT_CONTENT state
                // for each of the nested HTML blocks
                last.body = BODY_STATIC_TEXT;
                parser.enterState(STATE_CONCISE_HTML_CONTENT);
            } else {
                parser.enterState(STATE_STATIC_TEXT_CONTENT);
            }
        };


        if (defaultMode === MODE_CONCISE) {
            parser.setInitialState(STATE_CONCISE_HTML_CONTENT);
            parser.enterDefaultState = function() {
                parser.enterState(STATE_CONCISE_HTML_CONTENT);
            };
        } else {
            parser.setInitialState(STATE_HTML_CONTENT);
            parser.enterDefaultState = function() {
                parser.enterState(STATE_HTML_CONTENT);
            };
        }
    }

    parse(data) {
        super.parse(data);
        this.notifiers.notifyFinish();
    }
}

module.exports = Parser;