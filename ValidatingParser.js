'use strict';

var Parser = require('./Parser');

function notify(listeners, eventType, event) {
    var listenerFunc = listeners[eventType];
    if (listenerFunc) {
        listenerFunc(event);
    }
}

var htmlTags = require('./html-tags');

var openTagOnly = htmlTags.openTagOnly;
var requireClosingTag = htmlTags.requireClosingTag;

class Node {
    constructor(event) {
        this.event = event;
    }

    emitChildrenEvents(listeners) {
        var children = this.children;
        if (!children) {
            return;
        }

        for (var i=0, len=children.length; i<len; i++) {
            children[i].emitEvents(listeners);
        }
    }

    addChild(childNode) {
        var children = this.children;
        if (!children) {
            this.children = [childNode];
        } else {
            children.push(childNode);
        }
    }

    addChildren(newChildren) {
        if (!newChildren) {
            return;
        }

        var children = this.children;
        if (!children) {
            this.children = newChildren;
        } else {
            this.children = this.children.concat(newChildren);
        }
    }

    toJSON() {

        var result = {};

        if (this.isRoot) {
            result.isRoot = true;
        }

        if (this.event) {
            if (this.event.type === 'opentag') {
                result.tagName = this.event.tagName;
                result.attributes = this.event.attributes;
            } else {
                result.event = this.event;
            }
        }


        if (this.children && this.children.length) {
            result.children = this.children;
        }

        return result;
    }
}

class RootNode extends Node {
    constructor() {
        super();
        this.children = null;
        this.isRoot = true;
    }



    emitEvents(listeners) {
        this.emitChildrenEvents(listeners);
    }
}

class ElementNode extends Node {
    constructor(event) {
        super(event);
        this.children = null;
        this.tagName = event.tagName;
        this.closetagEvent = null;
    }

    emitEvents(listeners) {
        var closetagEvent = this.closetagEvent;

        if (!closetagEvent) {
            closetagEvent = {
                type: 'closetag',
                tagName: this.tagName,
                selfClosing: true
            };
        }
        notify(listeners, 'onopentag', this.event);
        this.emitChildrenEvents(listeners);
        notify(listeners, 'onclosetag', closetagEvent);
    }

    getTagName() {
        return this.tagName;
    }
}

class LeafNode extends Node {
    constructor(event) {
        super(event);
        this.children = null;
    }

    emitEvents(listeners) {
        notify(listeners, 'on' + this.event.type, this.event);
    }

    addChild() {
        throw new Error('Illegal state');
    }
}

class ValidatingParser {
    constructor(listeners, options) {
        var root;
        var stack;
        var error;

        this.reset = function() {
            // Reset stateful variables to their initial states so that the parser
            // can be reused...
            root = new RootNode();
            stack = [root];
            error = undefined;
        };

        function notifyError(err) {
            if (error) {
                return;
            }

            error = err;
            var listener = listeners.onerror;
            if (!listener) {
                throw err;
            } else {
                listener(err);
            }
        }

        function addLeafNode(event) {
             stack[stack.length - 1].addChild(new LeafNode(event));
        }

        var parserStateProvider = options && options.parserStateProvider;

        this.parser = new Parser({

            ontext(event) {
                addLeafNode(event);
            },

            oncontentplaceholder(event) {
                addLeafNode(event);
            },

            onnestedcontentplaceholder(event) {
                notify(listeners, 'on' + event.type, event);
            },

            onattributeplaceholder(event) {
                notify(listeners, 'on' + event.type, event);
            },

            oncdata(event) {
                addLeafNode(event);
            },

            onopentag(event) {
                var tagName = event.tagName;
                var isOpenTagOnly = openTagOnly[tagName.toLowerCase()];

                if (isOpenTagOnly) {
                    delete event.selfClosed;
                    event.openTagOnly = true;
                }

                if (parserStateProvider) {
                    var newParseState = parserStateProvider(event);
                    if (newParseState) {
                        switch(newParseState) {
                            case 'static-text': {
                                this.enterStaticTextContentState();
                                break;
                            }
                            case 'parsed-text': {
                                this.enterParsedTextContentState();
                                break;
                            }
                            case 'html': {
                                this.enterHtmlContentState();
                                break;
                            }
                            default: {
                                throw new Error('Invalid parse state: ' + newParseState);
                            }
                        }
                    }
                }

                var newNode = new ElementNode(event);
                var parent = stack[stack.length - 1];
                parent.addChild(newNode);
                stack.push(newNode);

                if (event.selfClosed || isOpenTagOnly) {
                    stack.length--;
                }

                if (event.selfClosed && requireClosingTag[tagName.toLowerCase()]) {
                    delete event.selfClosed;
                }
            },

            onclosetag(event) {
                if (event.selfClosed) {
                    return;
                }

                var i = stack.length - 1;
                var last = stack[i];
                var tagName = event.tagName;

                if (openTagOnly[tagName.toLowerCase()]) {

                    return notifyError({
                        type: 'error',
                        code: 'ERR_INVALID_CLOSING_TAG',
                        message: 'Invalid closing tag: </' + tagName + '>',
                        pos: event.pos,
                        endPos: event.endPos,
                        tagName: tagName
                    });
                }

                var missingClosingTagNode = null;

                if (!last.isRoot) {
                    if (last.getTagName() === tagName) {
                        last.closetagEvent = event;
                        // Correctly matched tag
                        stack.length--; // Remove the last item from the stack
                        return;
                    }

                    // We need to fix all of the tags
                    var curNode = last;

                    curNode.event.openTagOnly = true;

                    do {
                        if (curNode.tagName && requireClosingTag[curNode.getTagName().toLowerCase()]) {
                            missingClosingTagNode = curNode;
                        }

                        var children = curNode.children;
                        curNode.children = null;
                        curNode = stack[--i];
                        curNode.addChildren(children);

                        if (curNode.isRoot) {
                            break;
                        } else if (curNode.getTagName() === tagName) {
                            // If we got here then we found a matching closing tag for the tag
                            // that was closed. However, if we found any intermediate tags that
                            // that was missing a closing tag then trigger an error.
                            if (missingClosingTagNode) {
                                return notifyError({
                                    type: 'error',
                                    code: 'ERR_MISSING_CLOSING_TAG',
                                    message: 'Missing closing tag: </' + missingClosingTagNode.getTagName() + '>',
                                    pos: missingClosingTagNode.event.pos,
                                    endPos: missingClosingTagNode.event.endPos,
                                    tagName: missingClosingTagNode.getTagName()
                                });
                            }
                            // The value of "i" will be the index of the matched tag on the stack.
                            // Remove the matched tag from the stack and everything after it;
                            stack.length = i - 1;
                            curNode.closetagEvent = event;
                            return;
                        } else {
                            curNode.event.openTagOnly = true;
                        }
                    } while(true);
                }

                return notifyError({
                    type: 'error',
                    code: 'ERR_UNMATCHED_CLOSING_TAG',
                    message: 'Unmatched closing tag: </' + tagName + '>',
                    pos: event.pos,
                    endPos: event.endPos,
                    tagName: tagName
                });
            },

            ondtd(event) {
                addLeafNode(event);
            },

            ondeclaration(event) {
                addLeafNode(event);
            },

            oncomment(event) {
                addLeafNode(event);
            },

            onfinish() {
                var stackLength = stack.length;
                if (stackLength > 1) {
                    var i = stackLength - 1;
                    var curNode = stack[i];

                    while (i > 0) {
                        if (curNode.tagName && requireClosingTag[curNode.getTagName().toLowerCase()]) {
                            return notifyError({
                                type: 'error',
                                code: 'ERR_MISSING_CLOSING_TAG',
                                message: 'Missing closing tag: </' + curNode.getTagName() + '>',
                                pos: curNode.event.pos,
                                endPos: curNode.event.endPos,
                                tagName: curNode.getTagName()
                            });
                        }

                        var children = curNode.children;
                        curNode.children = null;
                        curNode = stack[--i];
                        curNode.addChildren(children);
                    }
                }

                if (error) {
                    return;
                }

                root.emitEvents(listeners);
            }
        }, options);
    }

    parse(data) {
        this.reset();
        this.parser.parse(data);
    }
}

module.exports = ValidatingParser;