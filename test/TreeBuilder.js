'use strict';
var expect = require('chai').expect;

function attributesToString(attributes, includeLiteralValues) {
    if (!attributes || attributes.length === 0) {
        return '';
    }

    return ' ' + attributes.map(function(attr) {
        var result = attr.name;

        if (attr.argument) {
            result += '(' + attr.argument.value + ')';
        }

        if (attr.value) {
            result += '=' + attr.value;
        }

        if (includeLiteralValues) {
            result += '[Literal: ' + (attr.hasOwnProperty('literalValue') ? JSON.stringify(attr.literalValue) : '(empty)') + ']';
        }
        return result;
    }).join(' ');
}

class RootNode {
    constructor() {
        this.children = [];
    }

    write(out) {
        this.children.forEach((child) => {
            child.write(out);
        });
    }
}

class Node {
    constructor(event) {
        this.event = event;
    }

    write(out) {
        var event = this.event;
        switch(event.type) {
            case 'text': {
                var line = 'text:' + JSON.stringify(event.value);
                if (out.includeTextParserState) {
                    line += ' [parseMode=' + event.parseMode + ']';
                }
                out.writeLine(line);
                break;
            }

            case 'comment': {
                out.writeLine('comment:' + JSON.stringify(event.value));
                break;
            }

            case 'cdata': {
                out.writeLine('cdata:' + JSON.stringify(event.value) + (out.includePositions ? ':' + event.pos + '-' + event.endPos : ''));
                break;
            }

            case 'declaration': {
                out.writeLine('declaration:' + JSON.stringify(event.value) + (out.includePositions ? ':' + event.pos + '-' + event.endPos : ''));
                break;
            }

            case 'documentType': {
                out.writeLine('documentType:' + JSON.stringify(event.value) + (out.includePositions ? ':' + event.pos + '-' + event.endPos : ''));
                break;
            }

            case 'placeholder': {
                out.writeLine((event.escape ? '${' : '$!{') + JSON.stringify(event.value) + '}');
                break;
            }

            case 'scriptlet': {
                out.writeLine('scriptlet:' + JSON.stringify(event.value));
                break;
            }

            case 'error': {
                out.writeLine('error:' + JSON.stringify(event.message) + ' (code: ' + JSON.stringify(event.code) + ')');
                break;
            }

            default: {
                throw new Error('Not implemented: ' + event.type);
            }
        }
    }
}

class ElementNode {
    constructor(event) {
        this.event = event;
        this.children = [];
    }

    write(out) {
        var event = this.event;
        var tagName = event.tagName;
        var tagNameExpression = event.tagNameExpression;
        var argument = event.argument;
        var attributes = event.attributes;
        var openTagOnly = event.openTagOnly === true;
        var selfClosed =  event.selfClosed === true;

        var str = '<' + tagName;

        if (tagNameExpression) {
            str += '[' + tagNameExpression + ']';
        }

        if (argument) {
            str += '(' + argument.value + ')';
        }

        if (out.includePositions) {
            str += ':' + event.pos;
        }

        if (event.shorthandId) {
            str += ' shorthandId=' + event.shorthandId.value;
        }

        if (event.shorthandClassNames) {
            str += ' shorthandClassNames=[' + event.shorthandClassNames.map((classNamePart) => {
                return classNamePart.value;
            }).join(', ') + ']';
        }

        str += attributesToString(attributes, out.includeLiteralValues) + (openTagOnly ? ' OPEN_ONLY' : '') + (selfClosed ? ' SELF_CLOSED' : '') + '>';
        out.writeLine(str);

        out.incIndent();
        this.children.forEach((child) => {
            child.write(out);
        });
        out.decIndent();

        out.writeLine('</' + tagName + '>');
    }
}



class TreeBuilder {

    constructor(src, options) {
        options = options || {};

        // Strip off the BOM character sequence so that substring tests
        // will match the parsed result
        if (src.charCodeAt(0) === 0xFEFF) {
    		src = src.slice(1);
    	}

        this.src = src;
        this.includePositions = options && options.includePositions === true;
        this.includeLiteralValues = options && options.includeLiteralValues === true;
        this.includeTextParserState = options.includeTextParserState === true;

        this.root = new RootNode();
        this.stack = [this.root];

        var openTagHandlers = options.openTagHandlers;

        this.listeners = {
            onText: (event) => {
                this.last.children.push(new Node(event));
            },

            onPlaceholder: (event) => {
                var escape = event.escape;
                var withinString = event.withinString;

                if (withinString) {
                    event.value = '$withinString(' + event.value + ')';
                }

                if (escape) {
                    expect(src.substring(event.pos, event.pos+2)).to.equal('${');
                } else {
                    expect(src.substring(event.pos, event.pos+3)).to.equal('$!{');
                }

                expect(src.substring(event.endPos-1, event.endPos)).to.equal('}');

                if (event.withinTagName) {
                    return;
                }

                var escapeFunc = escape ? '$escapeXml' : '$noEscapeXml';
                event.value = escapeFunc + '(' + event.value + ')';

                if (event.withinBody && !event.withinString) {
                    expect(event.withinAttribute).to.equal(false);
                    this.last.children.push(new Node(event));
                }
            },

            onCDATA: (event) => {
                var startPos = event.pos;
                var endPos = event.endPos;

                // Make sure the position information is correct
                expect(src.substring(startPos, startPos + '<![CDATA['.length)).to.equal('<![CDATA[');
                expect(src.substring(endPos-']]>'.length, endPos)).to.equal(']]>');

                this.last.children.push(new Node(event));
            },

            onOpenTag: (event, parser) => {
                var startPos = event.pos;
                var endPos = event.endPos;

                var tagName = event.tagName;

                if (!event.shorthandId && !event.shorthandClassNames) {
                    // Make sure the position information is correct, but only if the
                    // shorthand syntax was not used on the tag name
                    if (event.concise) {
                        expect(src.substring(startPos, startPos + tagName.length)).to.equal(tagName);
                    } else {
                        expect(src.substring(startPos, startPos + 1 + tagName.length)).to.equal('<' + tagName);

                        if (event.selfClosed) {
                            expect(src.substring(endPos - 2, endPos)).to.equal('/>');
                        } else {
                            expect(src.charAt(endPos-1)).to.equal('>');
                        }

                    }
                }


                var el = new ElementNode(event);
                this.last.children.push(el);
                this.stack.push(el);

                var openTagHandler = openTagHandlers && openTagHandlers[tagName];
                if (openTagHandler) {
                    openTagHandler.call(parser, event, parser);
                }
            },

            onCloseTag: (event) => {
                var tagName = event.tagName;

                var last = this.stack.pop();

                if (!last) {
                    throw new Error('Illegal state: unmatched close tag: ' + tagName);
                }

                var lastEvent = last.event;

                if (last.event.tagName !== event.tagName) {
                    throw new Error('Illegal state: incorrectly close tag: ' + last.event.tagName + ' != ' + tagName);
                }

                // Make sure the position information is correct
                var startPos = event.pos;
                var endPos = event.endPos;

                if (lastEvent.concise || lastEvent.selfClosed || lastEvent.openTagOnly) {
                    expect(startPos == null).to.equal(true);
                    expect(endPos == null).to.equal(true);
                } else {
                    if (!lastEvent.shorthandId && !lastEvent.shorthandClassNames) {
                        var actualEndTag = src.substring(startPos, endPos);
                        if (actualEndTag !== '</' + tagName + '>' && actualEndTag !== '</>') {
                            throw new Error('Incorrect start/stop pos for close tag: ' + actualEndTag);
                        }
                    }
                }


                last.closeEvent = event;
            },

            onDocumentType: (event) => {
                expect(src.substring(event.pos, event.pos+2)).to.equal('<!');
                expect(src.substring(event.endPos-1, event.endPos)).to.equal('>');
                this.last.children.push(new Node(event));
            },

            onDeclaration: (event) => {
                expect(src.substring(event.pos, event.pos+2)).to.equal('<?');
                expect(src.substring(event.endPos-1, event.endPos)).to.equal('>');
                this.last.children.push(new Node(event));
            },

            onComment: (event) => {
                var prefix = src.substring(event.pos, event.pos + 2);
                if (prefix === '//') {
                } else if (prefix === '/*') {
                    expect(src.substring(event.endPos-2, event.endPos)).to.equal('*/');
                } else {
                    expect(src.substring(event.pos, event.pos+4)).to.equal('<!--');
                    expect(src.substring(event.endPos-3, event.endPos)).to.equal('-->');
                }

                this.last.children.push(new Node(event));
            },

            onScriptlet: (event) => {
                expect(src.substring(event.pos, event.pos+2)).to.equal('<%');
                expect(src.substring(event.endPos-2, event.endPos)).to.equal('%>');
                this.last.children.push(new Node(event));
            },

            onError: (event) => {
                this.last.children.push(new Node(event));
            }
        };
    }

    get last() {
        return this.stack[this.stack.length-1];
    }

    toString() {
        var indent = '';
        var buffer = '';
        var out = {
            includePositions: this.includePositions === true,
            includeLiteralValues: this.includeLiteralValues === true,
            includeTextParserState: this.includeTextParserState === true,
            incIndent() {
                indent += '    ';
            },
            decIndent() {
                indent = indent.substring(4);
            },
            writeLine(text) {
                buffer += indent + text + '\n';
            }
        };

        this.root.write(out);

        return buffer;
    }

}

module.exports = TreeBuilder;