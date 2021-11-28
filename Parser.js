'use strict';

const AttributeNameState = require('./lib/AttributeNameState');
const BaseParser = require('./BaseParser');
const CdataState = require('./lib/CDATAState');
const charProps = require('char-props');
const CheckTrailingWhiteSpaceState = require('./lib/CheckTrailingWhiteSpaceState');
const CloseTagState = require('./lib/CloseTagState');
const complain = require('complain');
const ConciseHtmlContentState = require('./lib/ConciseHtmlContentState');
const DeclarationState = require('./lib/DeclarationState');
const DtdState = require('./lib/DTDState');
const ExpressionState = require('./lib/ExpressionState');
const HtmlCommentState = require('./lib/HtmlCommentState');
const HtmlContentState = require('./lib/HtmlContentState');
const InlineScriptState = require('./lib/InlineScriptState');
const JsCommentBlockState = require('./lib/JsCommentBlockState');
const JsCommentLineState = require('./lib/JsCommentLineState');
const Notifiers = require('./notify-util');
const operators = require('./operators');
const ParsedTextContentState = require('./lib/ParsedTextContentState');
const PlaceholderState = require('./lib/PlaceholderState');
const RegularExpressionState = require('./lib/RegularExpressionState');
const ScriptletState = require('./lib/ScriptletState');
const StaticTextContentState = require('./lib/StaticTextContentState');
const StringState = require('./lib/StringState');
const TagNameShorthandState = require('./lib/TagNameShorthandState');
const TagNameState = require('./lib/TagNameState');
const TemplateStringState = require('./lib/TemplateStringState');
const WithinOpenTagState = require('./lib/WithinOpenTagState');
const BaseState = require('./lib/BaseState');

function peek(array) {
    var len = array.length;
    if (!len) {
        return undefined;
    }
    return array[len - 1];
}

const MODE_HTML = 1;
const MODE_CONCISE = 2;

const BODY_PARSED_TEXT = 1; // Body of a tag is treated as text, but placeholders will be parsed
const BODY_STATIC_TEXT = 2;// Body of a tag is treated as text and placeholders will *not* be parsed

const EMPTY_ATTRIBUTES = [];
const htmlTags = require('./html-tags');

module.exports = class Parser extends BaseParser {
    constructor(listeners, options) {
        super(options);
        this.notifiers = new Notifiers(this, listeners);
        const defaultMode = this.defaultMode = options && options.concise === false ? MODE_HTML : MODE_CONCISE;
        this.textParseMode = 'html';
        if (defaultMode === MODE_CONCISE) {
            this.setInitialState(new ConciseHtmlContentState(this));
        } else {
            this.setInitialState(new HtmlContentState(this));
        }
    }
    get beginMixedMode() {
        return this.context.beginMixedMode;
    }
    set beginMixedMode(value) {
        this.context.beginMixedMode = value;
    }
    get isConcise() {
        return this.context.isConcise;
    }
    set isConcise(value) {
        this.context.isConcise = value;
    }
    get text() {
        return this.context.text;
    }
    set text(value) {
        this.context.text = value;
    }
    get currentPart() {
        return this.context.currentPart;
    }
    set currentPart(value) {
        this.context.currentPart = value;
    }
    get currentOpenTag() {
        return this.context.currentOpenTag;
    }
    set currentOpenTag(value) {
        this.context.currentOpenTag = value;
    }
    get currentAttribute() {
        return this.context.currentAttribute;
    }
    set currentAttribute(value) {
        this.context.currentAttribute = value;
    }
    get placeholderDepth() {
        return this.context.placeholderDepth;
    }
    set placeholderDepth(value) {
        this.context.placeholderDepth = value;
    }
    get blockStack() {
        return this.context.blockStack;
    }
    get closeTagName() {
        return this.context.closeTagName;
    }
    set closeTagName(value) {
        this.context.closeTagName = value;
    }
    get closeTagPos() {
        return this.context.closeTagPos;
    }
    set closeTagPos(value) {
        this.context.closeTagPos = value;
    }
    get endingMixedModeAtEOL() {
        return this.context.endingMixedModeAtEOL;
    }
    set endingMixedModeAtEOL(value) {
        this.context.endingMixedModeAtEOL = value;
    }
    get expectedCloseTagName() {
        return this.context.expectedCloseTagName;
    }
    set expectedCloseTagName(value) {
        this.context.expectedCloseTagName = value;
    }
    get htmlBlockDelimiter() {
        return this.context.htmlBlockDelimiter;
    }
    set htmlBlockDelimiter(value) {
        this.context.htmlBlockDelimiter = value;
    }
    get indent() {
        return this.context.indent;
    }
    set indent(value) {
        this.context.indent = value;
    }
    get isWithinSingleLineHtmlBlock() {
        return this.context.isWithinSingleLineHtmlBlock;
    }
    set isWithinSingleLineHtmlBlock(value) {
        this.context.isWithinSingleLineHtmlBlock = value;
    }
    get withinOpenTag() {
        return this.context.withinOpenTag;
    }
    set withinOpenTag(value) {
        this.context.withinOpenTag = value;
    }
    reset() {
        super.reset();
        this.context = {
            beginMixedMode: false, // Used as a flag to mark that the next HTML block should enter the parser into HTML mode
            blockStack: [], // Used to keep track of HTML tags and HTML blocks
            closeTagName: undefined, // Used to keep track of the current close tag name as it is being parsed
            closeTagPos: undefined, // Used to keep track of the position of the current closing tag
            currentAttribute: undefined, // Used to reference the current attribute that is being parsed
            currentOpenTag: undefined, // Used to reference the current open tag that is being parsed
            currentPart: undefined, // The current part at the top of the part stack
            endingMixedModeAtEOL: false, // Used as a flag to record that the next EOL to exit HTML mode and go back to concise
            expectedCloseTagName: undefined, // Used to figure out when a text block has been ended (HTML tags are ignored)
            htmlBlockDelimiter: null, // Current delimiter for multiline HTML blocks nested within a concise tag. e.g. "--"
            htmlBlockIndent: null, // Used to hold the indentation for a delimited, multiline HTML block
            indent: '', // Used to build the indent for the current concise line
            isConcise: this.defaultMode === MODE_CONCISE, // Set to true if parser is currently in concise mode
            isWithinSingleLineHtmlBlock: false, // Set to true if the current block is for a single line HTML block
            partStack: [], // Used to keep track of parts such as CDATA, expressions, declarations, etc.
            placeholderDepth: 0, // Used as an easy way to know if an exptression is within a placeholder
            text: '', // Used to buffer text that is found within the body of a tag
            withinOpenTag: false, /// Set to true if the parser is within the open tag
        };
    }
    enterState(Type) {
        if (Type instanceof BaseState) return super.enterState(Type);
        super.enterState(new Type(this));
    }
    enterCloseTagState() {
        this.enterState(CloseTagState);
    }
    enterWithinOpenTagState() {
        this.enterState(WithinOpenTagState);
    }
    beginPart() {
        const currentPart = this.currentPart = {
            pos: this.pos,
            parentState: this.state
        };

        this.context.partStack.push(currentPart);

        return currentPart;
    }
    endPart() {
        const partStack = this.context.partStack;
        const last = partStack.pop();
        this.endPos = this.pos;
        this.enterState(last.parentState);
        this.currentPart = partStack.length ? peek(partStack) : undefined;
        return last;
    }
    beginString(quoteChar, quoteCharCode) {
        const string = this.beginPart();
        string.stringParts = [];
        string.currentText = '';
        string.quoteChar = quoteChar;
        string.quoteCharCode = quoteCharCode;
        string.isStringLiteral = true;
        this.enterState(StringState);
        return string;
    }
    endString() {
        var string = this.endPart();
        string.value = this.notifiers.notifyString(string);
        string.parentState.string(string);
    }
    beginPlaceholder(escape, withinTagName) {
        var placeholder = this.beginPart();
        placeholder.value = '';
        placeholder.escape = escape !== false;
        placeholder.type = 'placeholder';
        placeholder.withinBody = this.withinOpenTag !== true;
        placeholder.withinAttribute = this.currentAttribute != null;
        placeholder.withinString = placeholder.parentState.name === 'STATE_STRING';
        placeholder.withinTemplateString = placeholder.parentState.name === 'STATE_TEMPLATE_STRING';
        placeholder.withinOpenTag = this.withinOpenTag === true && this.currentAttribute == null;
        placeholder.withinTagName = withinTagName;
        this.placeholderDepth++;
        this.enterState(PlaceholderState);
        return placeholder;
    }
    endPlaceholder() {
        var placeholder = this.endPart();
        this.placeholderDepth--;
        if (!placeholder.withinTemplateString) {
            placeholder.value = this.notifiers.notifyPlaceholder(placeholder);
        }
        placeholder.parentState.placeholder(placeholder);
    }
    beginAttribute() {
        this.currentAttribute = {};
        if (this.currentOpenTag.attributes === EMPTY_ATTRIBUTES) {
            this.currentOpenTag.attributes = [this.currentAttribute];
        } else {
            this.currentOpenTag.attributes.push(this.currentAttribute);
        }
        this.enterState(AttributeNameState);
        return this.currentAttribute;
    }
    endAttribute() {
        this.currentAttribute = null;
        if (this.state.name !== 'STATE_WITHIN_OPEN_TAG') {
            this.enterWithinOpenTagState();
        }
    }
    endText(...args) {
        let txt = args[0];
        if (args.length === 0) {
            txt = this.text;
        }

        this.notifiers.notifyText(txt, this.textParseMode);

        // always clear text buffer...
        this.text =  '';
    }
    beginOpenTag() {
        this.endText();

        var tagInfo = {
            type: 'tag',
            tagName: '',
            tagNameParts: null,
            attributes: [],
            argument: undefined,
            params: undefined,
            pos: this.pos,
            indent: this.indent,
            nestedIndent: null, // This will get set when we know what hte nested indent is
            concise: this.isConcise
        };

        this.withinOpenTag = true;

        if (this.beginMixedMode) {
            tagInfo.beginMixedMode = true;
            this.beginMixedMode = false;
        }

        this.blockStack.push(tagInfo);

        var currentOpenTag = this.currentOpenTag = tagInfo;

        this.enterState(TagNameState);

        return currentOpenTag;
    }
    finishOpenTag(selfClosed) {
        const currentOpenTag = this.currentOpenTag;
        let tagName = currentOpenTag.tagName;
        const attributes = currentOpenTag.attributes;
        const parseOptions = currentOpenTag.parseOptions;

        var ignoreAttributes = parseOptions && parseOptions.ignoreAttributes === true;

        if (ignoreAttributes) {
            attributes.length = 0;
        } else {
            if (currentOpenTag.requiresCommas && attributes.length > 1) {
                for(let i = 0; i < attributes.length-1; i++) {
                    if(!attributes[i].endedWithComma) {


                        if (!parseOptions || parseOptions.relaxRequireCommas !== true) {
                            this.notifyError(attributes[i].pos,
                                'COMMAS_REQUIRED',
                                'if commas are used, they must be used to separate all attributes for a tag');
                        }
                    }
                }
            }
        }

        currentOpenTag.expectedCloseTagName = this.expectedCloseTagName =
            this.substring(currentOpenTag.tagNameStart, currentOpenTag.tagNameEnd);

        var openTagOnly = currentOpenTag.openTagOnly = this.isOpenTagOnly(tagName);
        var endPos = this.pos;

        if (!this.isConcise) {
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

        if (!currentOpenTag.tagName && !currentOpenTag.emptyTagName) {
            tagName = currentOpenTag.tagName = 'div';
        }

        var origState = this.state;
        this.notifiers.notifyOpenTag(currentOpenTag);

        var shouldClose = false;

        if (selfClosed) {
            shouldClose = true;
        } else if (openTagOnly) {
            if (!this.isConcise) {
                // Only close the tag if we are not in concise mode. In concise mode
                // we want to keep the tag on the stack to make sure nothing is nested below it
                shouldClose = true;
            }
        }

        if (shouldClose) {
            this.closeTag(this.expectedCloseTagName);
        }

        this.withinOpenTag = false;

        if (shouldClose) {
            if (this.isConcise) {
                this.enterConciseHtmlContentState();
            } else {
                this.enterHtmlContentState();
            }
        } else {
            // Did the parser stay in the same state after
            // notifying listeners about openTag?
            if (this.state === origState) {
                // The listener didn't transition the parser to a new state
                // so we use some simple rules to find the appropriate state.
                if (tagName === 'script') {
                    this.enterJsContentState();
                } else if (tagName === 'style') {
                    this.enterCssContentState();
                } else {
                    if (this.isConcise) {
                        this.enterConciseHtmlContentState();
                    } else {
                        this.enterHtmlContentState();
                    }

                }
            }
        }

        // We need to record the "expected close tag name" if we transition into
        // either STATE_STATIC_TEXT_CONTENT or STATE_PARSED_TEXT_CONTENT
        this.currentOpenTag = undefined;
    }
    closeTag(tagName, pos, endPos) {
        if (!tagName) {
            throw new Error('Illegal state. Invalid tag name');
        }
        var blockStack = this.blockStack;
        var lastTag = blockStack.length ? blockStack.pop() : undefined;

        if (pos == null && this.closeTagPos != null) {
            pos = this.closeTagPos;
            endPos = this.pos + 1;
        }

        if (!lastTag || lastTag.type !== 'tag') {
            return this.notifyError(pos,
                'EXTRA_CLOSING_TAG',
                'The closing "' + tagName + '" tag was not expected');
        }

        if (!lastTag || (lastTag.expectedCloseTagName !== tagName && lastTag.tagName !== tagName)) {
            return this.notifyError(pos,
                'MISMATCHED_CLOSING_TAG',
                'The closing "' + tagName + '" tag does not match the corresponding opening "' + lastTag.expectedCloseTagName + '" tag');
        }

        tagName = lastTag.tagName;

        this.notifiers.notifyCloseTag(tagName, pos, endPos);

        if (lastTag.beginMixedMode) {
            this.endingMixedModeAtEOL = true;
        }

        this.closeTagName = null;
        this.closeTagPos = null;

        lastTag = peek(blockStack);
        this.expectedCloseTagName = lastTag && lastTag.expectedCloseTagName;
    }
    beginExpression(endAfterGroup) {
        var expression = this.beginPart();
        expression.value = '';
        expression.groupStack = [];
        expression.endAfterGroup = endAfterGroup === true;
        expression.isStringLiteral = null;
        this.enterState(ExpressionState);
        return expression;
    }
    endExpression() {
        var expression = this.endPart();
        // Probably shouldn't do this, but it makes it easier to test!
        if(expression.parentState.name === 'STATE_ATTRIBUTE_VALUE' && expression.hasUnenclosedWhitespace) {
            expression.value = '('+expression.value+')';
        }
        expression.parentState.expression(expression);
    }
    beginTemplateString() {
        var templateString = this.beginPart();
        templateString.value = '`';
        this.enterState(TemplateStringState);
        return templateString;
    }
    endTemplateString() {
        var templateString = this.endPart();
        templateString.parentState.templateString(templateString);
    }
    beginRegularExpression() {
        var regularExpression = this.beginPart();
        regularExpression.value = '/';
        this.enterState(RegularExpressionState);
        return regularExpression;
    }
    endRegularExpression() {
        var regularExpression = this.endPart();
        regularExpression.parentState.regularExpression(regularExpression);
    }
    beginScriptlet() {
        this.endText();

        var scriptlet = this.beginPart();
        scriptlet.tag = true;
        scriptlet.value = '';
        scriptlet.quoteCharCode = null;
        this.enterState(ScriptletState);
        return scriptlet;
    }
    endScriptlet(endPos) {
        var scriptlet = this.endPart();
        scriptlet.endPos = endPos;
        this.notifiers.notifyScriptlet(scriptlet);
    }
    beginInlineScript() {
        this.endText();
        var inlineScript = this.beginPart();
        inlineScript.value = '';
        inlineScript.endMatches = [];
        this.enterState(InlineScriptState);
        return inlineScript;
    }
    endInlineScript(endPos) {
        var inlineScript = this.endPart();
        var value = inlineScript.value;
        inlineScript.endPos = endPos;

        if (value[0] === '{' && value[value.length-1] === '}') {
            inlineScript.value = value.slice(1, -1);
            inlineScript.block = true;
        } else {
            inlineScript.line = true;
        }

        this.notifiers.notifyScriptlet(inlineScript);
    }
    beginDocumentType() {
        this.endText();

        var documentType = this.beginPart();
        documentType.value = '';

        this.enterState(DtdState);
        return documentType;
    }
    endDocumentType() {
        var documentType = this.endPart();
        this.notifiers.notifyDocumentType(documentType);
    }
    beginDeclaration() {
        this.endText();

        var declaration = this.beginPart();
        declaration.value = '';
        this.enterState(DeclarationState);
        return declaration;
    }
    endDeclaration() {
        var declaration = this.endPart();
        this.notifiers.notifyDeclaration(declaration);
    }
    beginCDATA() {
        this.endText();

        var cdata = this.beginPart();
        cdata.value = '';
        this.enterState(CdataState);
        return cdata;
    }
    endCDATA() {
        var cdata = this.endPart();
        this.notifiers.notifyCDATA(cdata.value, cdata.pos, this.pos + 3);
    }
    beginLineComment() {
        var comment = this.beginPart();
        comment.value = '';
        comment.type = 'line';
        this.enterState(JsCommentLineState);
        return comment;
    }
    beginBlockComment() {
        var comment = this.beginPart();
        comment.value = '';
        comment.type = 'block';
        this.enterState(JsCommentBlockState);
        return comment;
    }
    endJavaScriptComment() {
        var comment = this.endPart();
        comment.rawValue = comment.type === 'line' ?
            '//' + comment.value :
            '/*' + comment.value + '*/';
        comment.parentState.comment(comment);
    }
    beginHtmlComment() {
        this.endText();
        var comment = this.beginPart();
        comment.value = '';
        this.enterState(HtmlCommentState);
        return comment;
    }
    endHtmlComment() {
        var comment = this.endPart();
        comment.endPos = this.pos + 3;
        this.notifiers.notifyComment(comment);
    }
    beginCheckTrailingWhitespace(handler) {
        var part = this.beginPart();
        part.handler = handler;
        if (typeof handler !== 'function') {
            throw new Error('Invalid handler');
        }
        this.enterState(CheckTrailingWhiteSpaceState);
    }
    beginTagNameShorthand() {
        var parser = this;
        var shorthand = this.beginPart();
        shorthand.currentPart = null;
        shorthand.hasId = false;
        shorthand.beginPart = function(type) {
            shorthand.currentPart = {
                type: type,
                stringParts: [],
                rawParts: [],
                text: '',
                _endText() {
                    var text = this.text;

                    if (text) {
                        this.stringParts.push(JSON.stringify(text));
                        this.rawParts.push({
                            text: text,
                            pos: parser.pos - text.length,
                            endPos: parser.pos
                        });
                    }

                    this.text = '';
                },
                addPlaceholder(placeholder) {
                    var startPos = placeholder.pos + (placeholder.escape ? 2 : 3);
                    var endPos = placeholder.endPos - 1;
                    this._endText();
                    this.stringParts.push('(' + placeholder.value + ')');
                    this.rawParts.push({
                        expression: parser.src.slice(startPos, endPos),
                        pos: startPos,
                        endPos: endPos
                    });
                },
                end() {
                    this._endText();

                    var expression = this.stringParts.join('+');

                    if (type === 'id') {
                        parser.currentOpenTag.shorthandId = {
                            value: expression,
                            rawParts: this.rawParts
                        };
                    } else if (type === 'class') {
                        if (!parser.currentOpenTag.shorthandClassNames) {
                            parser.currentOpenTag.shorthandClassNames = [];
                        }

                        parser.currentOpenTag.shorthandClassNames.push({
                            value: expression,
                            rawParts: this.rawParts
                        });
                    }
                }
            };
        };
        parser.enterState(new TagNameShorthandState(this));
        return shorthand;
    }
    endTagNameShorthand() {
        var shorthand = this.endPart();
        if (shorthand.currentPart) {
            shorthand.currentPart.end();
        }
        this.enterWithinOpenTagState();
    }
    /**
     * This method gets called when we are in non-concise mode
     * and we are exiting out of non-concise mode.
     */
    endHtmlBlock() {
        if (this.text && (this.isWithinSingleLineHtmlBlock || this.htmlBlockDelimiter)) {
            // Remove the new line that was required to end a single line
            // HTML block or a delimited block
            this.text = this.text.replace(/(\r\n|\n)$/, '');
        }

        // End any text
        this.endText();

        // Make sure all tags in this HTML block are closed
        const blockStack = this.blockStack;
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
                this.notifyError(curBlock.pos,
                    'MISSING_END_TAG',
                    'Missing ending "' + curBlock.tagName + '" tag');
                return;
            }
        }

        // Resert variables associated with parsing an HTML block
        this.htmlBlockIndent = null;
        this.htmlBlockDelimiter = null;
        this.isWithinSingleLineHtmlBlock = false;

        if (this.state.name !== 'STATE_CONCISE_HTML_CONTENT') {
            this.enterState(ConciseHtmlContentState);
        }
    }
    checkForOperator() {
        var remaining = this.data.substring(this.pos);
        var matches = operators.patternNext.exec(remaining);

        if (matches) {
            var match = matches[0];
            var operator = matches[1];

            if (this.options.legacyCompatibility && operator === '-') {
                return false;
            }

            var isIgnoredOperator = this.isConcise ? match.includes('[') : match.includes('>');
            if (!isIgnoredOperator) {
                this.skip(match.length-1);
                return match;
            }
        } else {
            var previous = this.substring(this.pos - operators.longest, this.pos);
            var match2 = operators.patternPrev.exec(previous);
            if (match2) {
                this.rewind(1);
                var whitespace = this.consumeWhitespace();
                return whitespace;
            }
        }

        return false;
    }
    openTagEOL() {
        if (this.isConcise && !this.currentOpenTag.withinAttrGroup) {
            // In concise mode we always end the open tag
            this.finishOpenTag();
        }
    }
    openTagEOF() {
        if (this.isConcise) {
            if (this.currentOpenTag.withinAttrGroup) {
                this.notifyError(this.currentOpenTag.pos,
                    'MALFORMED_OPEN_TAG',
                    'EOF reached while within an attribute group (e.g. "[ ... ]").');
                return;
            }

            // If we reach EOF inside an open tag when in concise-mode
            // then we just end the tag and all other open tags on the stack
            this.finishOpenTag();
            this.htmlEOF();
        } else {
            // Otherwise, in non-concise mode we consider this malformed input
            // since the end '>' was not found.
            this.notifyError(this.currentOpenTag.pos,
                'MALFORMED_OPEN_TAG',
                'EOF reached while parsing open tag');
        }
    }
    /**
     * This function gets called when we reach EOF outside of a tag.
     */
    htmlEOF() {
        this.endText();
        var blockStack = this.blockStack;
        while(blockStack.length) {
            var curBlock = peek(blockStack);
            if (curBlock.type === 'tag') {
                if (curBlock.concise) {
                    this.closeTag(curBlock.expectedCloseTagName);
                } else {
                    // We found an unclosed tag on the stack that is not for a concise tag. That means
                    // there is a problem with the template because all open tags should have a closing
                    // tag
                    //
                    // NOTE: We have already closed tags that are open tag only or self-closed
                    this.notifyError(curBlock.pos,
                        'MISSING_END_TAG',
                        'Missing ending "' + curBlock.tagName + '" tag');
                    return;
                }
            } else if (curBlock.type === 'html') {
                // We reached the end of file while still within a single line HTML block. That's okay
                // though since we know the line is completely. We'll continue ending all open concise tags.
                blockStack.pop();
            } else {
                // There is a bug in our parser...
                throw new Error('Illegal state. There should not be any non-concise tags on the stack when in concise mode');
            }
        }
    }
    handleDelimitedBlockEOL(newLine) {
        // If we are within a delimited HTML block then we want to check if the next line is the end
        // delimiter. Since we are currently positioned at the start of the new line character our lookahead
        // will need to include the new line character, followed by the expected indentation, followed by
        // the delimiter.
        const htmlBlockIndent = this.htmlBlockIndent;
        const endHtmlBlockLookahead = htmlBlockIndent + this.htmlBlockDelimiter;

        if (this.lookAheadFor(endHtmlBlockLookahead, this.pos + newLine.length)) {
            this.skip(htmlBlockIndent.length);
            this.skip(this.htmlBlockDelimiter.length);

            this.enterState(ConciseHtmlContentState);

            this.beginCheckTrailingWhitespace((err, eof) => {
                if (err) {
                    // This is a non-whitespace! We don't allow non-whitespace
                    // after matching two or more hyphens. This is user error...
                    this.notifyError(this.pos,
                        'INVALID_CHARACTER',
                        'A non-whitespace of "' + err.ch + '" was found on the same line as the ending delimiter ("' + this.htmlBlockDelimiter + '") for a multiline HTML block');
                    return;
                }

                this.endHtmlBlock();

                if (eof) {
                    this.htmlEOF();
                }
            });
            return;
        } else if (this.lookAheadFor(htmlBlockIndent, this.pos + newLine.length)) {
            // We know the next line does not end the multiline HTML block, but we need to check if there
            // is any indentation that we need to skip over as we continue parsing the HTML in this
            // multiline HTML block

            this.skip(htmlBlockIndent.length);
            // We stay in the same state since we are still parsing a multiline, delimited HTML block
        } else if (htmlBlockIndent && !this.onlyWhitespaceRemainsOnLine()) {
            // the next line does not have enough indentation
            // so unless it is black (whitespace only),
            // we will end the block
            this.endHtmlBlock();
        }
    }
    /**
     * This function is called to determine if a tag is an "open only tag". Open only tags such as <img>
     * are immediately closed.
     * @param  {String}  tagName The name of the tag (e.g. "img")
     */
    isOpenTagOnly(tagName) {
        if (!tagName) {
            return false;
        }

        tagName = tagName.toLowerCase();

        var openTagOnly = this.options.isOpenTagOnly && this.options.isOpenTagOnly(tagName);
        if (openTagOnly == null) {
            openTagOnly = htmlTags.isOpenTagOnly(tagName);
        }

        return openTagOnly;
    }
    getAndRemoveArgument(expression) {
        const start = expression.lastLeftParenPos;
        if (start != null) {
            // The tag has an argument that we need to slice off
            const end = expression.lastRightParenPos;
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
    getAndRemoveMethod(expression) {
        if (expression.method) {
            const start = expression.lastLeftParenPos;
            const end = expression.value.length;
            var method = {
                value: 'function' + expression.value.substring(start, end),
                pos: expression.pos + start,
                endPos: expression.pos + end
            };

            // Chop off the method from the expression
            expression.value = expression.value.substring(0, start);
            // Fix the end position for the expression
            expression.endPos = expression.pos + expression.value.length;

            return method;
        }

        return undefined;
    }
    parse(data, filename) {
        super.parse(data, filename);
        this.notifiers.notifyFinish();
    }
    notifyError(pos, errorCode, message) {
        this.end();
        this.notifiers.notifyError(pos, errorCode, message);
    }
    checkForTypeofOperator() {
        var remaining = this.data.substring(this.pos);
        var matches =  /^\s+typeof\s+/.exec(remaining);

        if (matches) {
            return matches[0];
        }

        return false;
    }
    checkForTypeofOperatorAtStart() {
        var remaining = this.data.substring(this.pos);
        var matches =  /^typeof\s+/.exec(remaining);

        if (matches) {
            return matches[0];
        }

        return false;
    }
    outputDeprecationWarning(message) {
        var srcCharProps = charProps(this.src);
        var line = srcCharProps.lineAt(this.pos);
        var column = srcCharProps.columnAt(this.pos);
        var filename = this.filename;
        var location = (filename || '(unknown file)') + ':' + line + ':' + column;
        complain(message, { location: location });
    }
    /**
     * This function is used to enter into "HTML" parsing mode instead
     * of concise HTML. We push a block on to the stack so that we know when
     * return back to the previous parsing mode and to ensure that all
     * tags within a block are properly closed.
     */
    beginHtmlBlock(delimiter) {
        this.htmlBlockIndent = this.indent;
        this.htmlBlockDelimiter = delimiter;

        var parent = peek(this.blockStack);
        this.blockStack.push({
            type: 'html',
            delimiter: delimiter,
            indent: this.indent,
        });

        if (parent && parent.body) {
            if (parent.body === BODY_PARSED_TEXT) {
                this.enterState(ParsedTextContentState);
            } else if (parent.body === BODY_STATIC_TEXT) {
                this.enterState(StaticTextContentState);
            } else {
                throw new Error('Illegal value for parent.body: ' + parent.body);
            }
        } else {
            return this.enterState(HtmlContentState);
        }
    }
    lookPastWhitespaceFor(str, start) {
        var ahead = start == null ? 1 : start;
        while(this.isWhitespaceCode(this.lookAtCharCodeAhead(ahead))) ahead++;
        return !!this.lookAheadFor(str, this.pos + ahead);
    }
    getPreviousNonWhitespaceChar(start) {
        var behind = start == null ? -1 : start;
        while(this.isWhitespaceCode(this.lookAtCharCodeAhead(behind))) behind--;
        return this.lookAtCharAhead(behind);
    }
    onlyWhitespaceRemainsOnLine(offset) {
        offset = offset == null ? 1 : offset;
        return /^\s*\n/.test(this.substring(this.pos + offset));
    }
    consumeWhitespace() {
        var ahead = 1;
        var whitespace = '';
        while(this.isWhitespaceCode(this.lookAtCharCodeAhead(ahead))) {
            whitespace += this.lookAtCharAhead(ahead++);
        }
        this.skip(whitespace.length);
        return whitespace;
    }
    checkForClosingTag() {
        // Look ahead to see if we found the closing tag that will
        // take us out of the EXPRESSION state...
        var match = (
            this.lookAheadFor('/>') ||
            this.lookAheadFor('/' + peek(this.blockStack).tagName + '>') ||
            this.lookAheadFor('/' + this.expectedCloseTagName + '>')
        );

        if (match) {
            if (this.state.name === 'STATE_JS_COMMENT_LINE') {
                this.endJavaScriptComment();
            }
            this.endText();

            this.closeTag(this.expectedCloseTagName, this.pos, this.pos + 1 + match.length);
            this.skip(match.length);
            this.enterState(HtmlContentState);
            return true;
        }

        return false;
    }
    checkForCDATA() {
        if (this.lookAheadFor('![CDATA[')) {
            this.beginCDATA();
            this.skip(8);
            return true;
        }

        return false;
    }
    enterHtmlContentState() {
        if (this.state.name !== 'STATE_HTML_CONTENT') {
            this.enterState(HtmlContentState);
        }
    }
    enterConciseHtmlContentState() {
        if (this.state.name !== 'new ') {
            this.enterState(ConciseHtmlContentState);
        }
    }
    enterParsedTextContentState() {
        var blockStack = this.blockStack;
        var last = blockStack.length && blockStack[blockStack.length - 1];

        if (!last || !last.tagName) {
            throw new Error('The "parsed text content" parser state is only allowed within a tag');
        }

        if (this.isConcise) {
            // We will transition into the STATE_PARSED_TEXT_CONTENT state
            // for each of the nested HTML blocks
            last.body = BODY_PARSED_TEXT;
            this.enterState(ConciseHtmlContentState);
        } else {
            this.enterState(ParsedTextContentState);
        }
    }
    enterJsContentState() {
        this.enterParsedTextContentState();
    }
    enterCssContentState() {
        this.enterParsedTextContentState();
    }
    enterStaticTextContentState() {
        var blockStack = this.blockStack;
        var last = blockStack.length && blockStack[blockStack.length - 1];

        if (!last || !last.tagName) {
            throw new Error('The "static text content" parser state is only allowed within a tag');
        }

        if (this.isConcise) {
            // We will transition into the STATE_STATIC_TEXT_CONTENT state
            // for each of the nested HTML blocks
            last.body = BODY_STATIC_TEXT;
            this.enterState(ConciseHtmlContentState);
        } else {
            this.enterState(StaticTextContentState);
        }
    }
};
