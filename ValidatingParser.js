'use strict';

var Parser = require('./Parser');

function notify(listeners, eventType, event) {
    var listenerFunc = listeners[eventType];
    if (listenerFunc) {
        listenerFunc(event);
    }
}

var htmlTags = require('./html-tags');

var startTagOnly = htmlTags.startTagOnly;
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
                tagName: this.tagName
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

        function notifyError(err, event) {
            if (error) {
                return;
            }

            error = err;

            for (var k in event) {
                if (event.hasOwnProperty(k)) {
                    err[k] = event[k];
                }
            }

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
                var newNode = new ElementNode(event);
                var parent = stack[stack.length - 1];
                parent.addChild(newNode);
                stack.push(newNode);

                var tagName = event.tagName;
                if (event.selfClosed || startTagOnly[tagName.toLowerCase()]) {
                    stack.length--;
                }
            },

            onclosetag(event) {
                if (event.selfClosed) {
                    return;
                }

                var i = stack.length - 1;
                var last = stack[i];
                var tagName = event.tagName;

                if (startTagOnly[tagName.toLowerCase()]) {
                    return notifyError(
                        new Error('Invalid closing tag: </' + tagName + '>'),
                        event);
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
                                return notifyError(
                                    new Error('Missing closing tag: </' + missingClosingTagNode.getTagName() + '>'),
                                    missingClosingTagNode.event);
                            }
                            // The value of "i" will be the index of the matched tag on the stack.
                            // Remove the matched tag from the stack and everything after it;
                            stack.length = i - 1;
                            curNode.closetagEvent = event;
                            return;
                        }
                    } while(true);
                }

                return notifyError(
                    new Error('Unmatched closing tag: </' + tagName + '>'),
                    event);
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
                            return notifyError(
                                new Error('Missing closing tag: </' + curNode.getTagName() + '>'),
                                curNode.event);
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

    enterHtmlContentState () {
        this.parser.enterHtmlContentState();
    }

    enterJsContentState () {
        this.parser.enterJsContentState();
    }

    enterCssContentState () {
        this.parser.enterCssContentState();
    }

    enterParsedTextContentState () {
        this.parser.enterParsedTextContentState();
    }

    enterStaticTextContentState () {
        this.parser.enterStaticTextContentState();
    }

    parse(data) {
        this.reset();
        this.parser.parse(data);
    }
}

module.exports = ValidatingParser;