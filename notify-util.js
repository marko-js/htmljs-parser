module.exports = Notifiers;

function Notifiers(parser, listeners) {
    if (!(this instanceof Notifiers)) return new Notifiers(parser, listeners);
    this.hasError = false;
    this.parser = parser;
    this.listeners = listeners;
}

const proto = Notifiers.prototype;

proto.notifyText = function notifyText(value, textParseMode) {
    if (this.hasError) {
        return;
    }

    var eventFunc = this.listeners.onText;

    if (eventFunc && (value.length > 0)) {
        eventFunc.call(this.listeners, {
            type: 'text',
            value: value,
            parseMode: textParseMode
        }, this.parser);
    }
};

proto.notifyCDATA = function notifyCDATA(value, pos, endPos) {
    if (this.hasError) {
        return;
    }

    var eventFunc = this.listeners.onCDATA;

    if (eventFunc && value) {
        eventFunc.call(this.listeners, {
            type: 'cdata',
            value: value,
            pos: pos,
            endPos: endPos
        }, this.parser);
    }
};

proto.notifyError = function notifyError(pos, errorCode, message) {
    if (this.hasError) {
        return;
    }

    this.hasError = true;

    var eventFunc = this.listeners.onError;
    if (!eventFunc) return;

    eventFunc.call(this.listeners, {
        type: 'error',
        code: errorCode,
        message: message,
        pos: pos,
        endPos: this.parser.pos
    }, this.parser);
};

proto.notifyOpenTagName = function notifyOpenTagName(tagInfo) {
    if (this.hasError) {
        return;
    }

    var eventFunc = this.listeners.onOpenTagName;
    if (!eventFunc) return;

    // set the literalValue property for attributes that are simple
    // string simple values or simple literal values

    var event = {
        type: 'openTagName',
        tagName: tagInfo.tagName,
        tagNameExpression: tagInfo.tagNameExpression,
        emptyTagName: tagInfo.emptyTagName,
        pos: tagInfo.pos,
        endPos: tagInfo.tagNameEndPos,
        concise: tagInfo.concise
    };

    if (tagInfo.shorthandId) {
        event.shorthandId = tagInfo.shorthandId;
    }

    if (tagInfo.shorthandClassNames) {
        event.shorthandClassNames = tagInfo.shorthandClassNames;
    }

    event.setParseOptions = function (parseOptions) {
        if (!parseOptions) {
            return;
        }
        tagInfo.parseOptions = parseOptions;
    };

    eventFunc.call(this.listeners, event, this.parser);
};

proto.notifyOpenTag = function notifyOpenTag(tagInfo) {
    if (this.hasError) {
        return;
    }

    var eventFunc = this.listeners.onOpenTag;
    if (!eventFunc) return;

    // set the literalValue property for attributes that are simple
    // string simple values or simple literal values

    var event = {
        type: 'openTag',
        tagName: tagInfo.tagName,
        tagNameExpression: tagInfo.tagNameExpression,
        emptyTagName: tagInfo.emptyTagName,
        var: tagInfo.var,
        argument: tagInfo.argument,
        params: tagInfo.params,
        pos: tagInfo.pos,
        endPos: tagInfo.endPos,
        tagNameEndPos: tagInfo.tagNameEndPos,
        openTagOnly: tagInfo.openTagOnly,
        selfClosed: tagInfo.selfClosed,
        concise: tagInfo.concise
    };

    if (tagInfo.shorthandId) {
        event.shorthandId = tagInfo.shorthandId;
    }

    if (tagInfo.shorthandClassNames) {
        event.shorthandClassNames = tagInfo.shorthandClassNames;
    }

    event.attributes = tagInfo.attributes.map((attr) => {
        var newAttr = {
            default: attr.default,
            name: attr.name,
            value: attr.value,
            pos: attr.pos,
            endPos: attr.endPos,
            argument: attr.argument,
            method: attr.method,
            bound: attr.bound
        };

        if ('literalValue' in attr) {
            newAttr.literalValue = attr.literalValue;
        }

        return newAttr;
    });

    event.setParseOptions = function (parseOptions) {
        if (!parseOptions) {
            return;
        }
        var newState = parseOptions.state;

        if (newState) {
            if (newState === 'parsed-text') {
                this.parser.enterParsedTextContentState();
            } else if (newState === 'static-text') {
                this.parser.enterStaticTextContentState();
            }
        }

        tagInfo.parseOptions = parseOptions;
    };

    eventFunc.call(this.listeners, event, this.parser);
};

proto.notifyCloseTag = function notifyCloseTag(tagName, pos, endPos) {
    if (this.hasError) {
        return;
    }

    var eventFunc = this.listeners.onCloseTag;
    if (!eventFunc) return;

    var event = {
        type: 'closeTag',
        tagName: tagName,
        pos: pos,
        endPos: endPos
    };

    eventFunc.call(this.listeners, event, this.parser);
};

proto.notifyDocumentType = function notifyDocumentType(documentType) {
    if (this.hasError) {
        return;
    }

    var eventFunc = this.listeners.onDocumentType;
    if (!eventFunc) return;

    eventFunc.call(this.listeners, {
        type: 'documentType',
        value: documentType.value,
        pos: documentType.pos,
        endPos: documentType.endPos
    }, this.parser);
};

proto.notifyDeclaration = function notifyDeclaration(declaration) {
    if (this.hasError) {
        return;
    }

    var eventFunc = this.listeners.onDeclaration;
    if (!eventFunc) return;

    eventFunc.call(this.listeners, {
        type: 'declaration',
        value: declaration.value,
        pos: declaration.pos,
        endPos: declaration.endPos
    }, this.parser);
};

proto.notifyComment = function notifyComment(comment) {
    if (this.hasError) {
        return;
    }

    var eventFunc = this.listeners.onComment;

    if (eventFunc && comment.value) {
        eventFunc.call(this.listeners, {
            type: 'comment',
            value: comment.value,
            pos: comment.pos,
            endPos: comment.endPos
        }, this.parser);
    }
};

proto.notifyScriptlet = function notifyScriptlet(scriptlet) {
    if (this.hasError) {
        return;
    }

    var eventFunc = this.listeners.onScriptlet;

    if (eventFunc && scriptlet.value) {
        eventFunc.call(this.listeners, {
            type: 'scriptlet',
            tag: scriptlet.tag,
            line: scriptlet.line,
            block: scriptlet.block,
            value: scriptlet.value,
            pos: scriptlet.pos,
            endPos: scriptlet.endPos
        }, this.parser);
    }
};

proto.notifyPlaceholder = function notifyPlaceholder(placeholder) {
    if (this.hasError) {
        return;
    }

    var eventFunc = this.listeners.onPlaceholder;
    if (!eventFunc) return placeholder.value;

    var placeholderEvent = {
        type: 'placeholder',
        value: placeholder.value,
        pos: placeholder.pos,
        endPos: placeholder.endPos,
        escape: placeholder.escape !== false,
        withinBody: placeholder.withinBody === true,
        withinAttribute: placeholder.withinAttribute === true,
        withinString: placeholder.withinString === true,
        withinOpenTag: placeholder.withinOpenTag === true,
        withinTagName: placeholder.withinTagName === true
    };

    eventFunc.call(this.listeners, placeholderEvent, this.parser);
    return placeholderEvent.value;
};

proto.notifyString = function notifyString(string) {
    if (this.hasError) {
        return;
    }

    var eventFunc = this.listeners.onString;
    if (!eventFunc) return string.value;

    var stringEvent = {
        type: 'string',
        value: string.value,
        pos: string.pos,
        endPos: string.endPos,
        stringParts: string.stringParts,
        isStringLiteral: string.isStringLiteral
    };

    eventFunc.call(this.listeners, stringEvent, this.parser);
    return stringEvent.value;
};

proto.notifyFinish = function notifyFinish() {
    if (this.listeners.onfinish) {
        this.listeners.onfinish.call(this.listeners, {}, this.parser);
    }
};
