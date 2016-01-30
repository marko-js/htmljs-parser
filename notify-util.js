exports.createNotifiers = function(parser, listeners) {
    var hasError = false;

    return {
        notifyText(value) {
            if (hasError) {
                return;
            }

            var eventFunc = listeners.onText;

            if (eventFunc && (value.length > 0)) {
                eventFunc.call(parser, {
                    type: 'text',
                    value: value
                }, parser);
            }
        },

        notifyCDATA(value, pos, endPos) {
            if (hasError) {
                return;
            }

            var eventFunc = listeners.onCDATA;

            if (eventFunc && value) {
                eventFunc.call(parser, {
                    type: 'cdata',
                    value: value,
                    pos: pos,
                    endPos: endPos
                }, parser);
            }
        },

        notifyError(pos, errorCode, message) {
            if (hasError) {
                return;
            }

            hasError = true;

            var eventFunc = listeners.onError;

            if (eventFunc) {
                eventFunc.call(parser, {
                    type: 'error',
                    code: errorCode,
                    message: message,
                    pos: pos,
                    endPos: parser.pos
                }, parser);
            }
        },

        notifyOpenTag(tagInfo) {
            if (hasError) {
                return;
            }

            var eventFunc = listeners.onOpenTag;

            if (eventFunc) {
                // set the literalValue property for attributes that are simple
                // string simple values or simple literal values

                var attributes = tagInfo.attributes;

                var i = attributes.length;
                while(--i >= 0) {
                    var attr = attributes[i];
                    var value = attr.value;



                    delete attr.isStringLiteral;
                    delete attr.isSimpleLiteral;
                }

                var event = {
                    type: 'openTag',
                    tagName: tagInfo.tagName,
                    argument: tagInfo.argument,
                    attributes,
                    pos: tagInfo.pos,
                    endPos: tagInfo.endPos,
                    openTagOnly: tagInfo.openTagOnly,
                    selfClosed: tagInfo.selfClosed,
                    concise: tagInfo.concise
                };

                eventFunc.call(parser, event, parser);
            }
        },

        notifyCloseTag(tagName, pos, endPos) {
            if (hasError) {
                return;
            }

            var eventFunc = listeners.onCloseTag;

            if (eventFunc) {
                var event = {
                    type: 'closeTag',
                    tagName: tagName,
                    pos: pos,
                    endPos: endPos
                };

                eventFunc.call(parser, event, parser);
            }
        },

        notifyDocumentType(documentType) {
            if (hasError) {
                return;
            }

            var eventFunc = listeners.onDocumentType;

            if (eventFunc) {
                eventFunc.call(this, {
                    type: 'documentType',
                    value: documentType.value,
                    pos: documentType.pos,
                    endPos: documentType.endPos
                }, parser);
            }
        },

        notifyDeclaration(declaration) {
            if (hasError) {
                return;
            }

            var eventFunc = listeners.onDeclaration;

            if (eventFunc) {
                eventFunc.call(parser, {
                    type: 'declaration',
                    value: declaration.value,
                    pos: declaration.pos,
                    endPos: declaration.endPos
                }, parser);
            }
        },

        notifyComment(comment) {
            if (hasError) {
                return;
            }

            var eventFunc = listeners.onComment;

            if (eventFunc && comment.value) {
                eventFunc.call(parser, {
                    type: 'comment',
                    value: comment.value,
                    pos: comment.pos,
                    endPos: comment.endPos
                }, parser);
            }
        },

        notifyPlaceholder(placeholder) {
            if (hasError) {
                return;
            }

            var eventFunc = listeners.onPlaceholder;
            if (eventFunc) {
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
                };

                eventFunc.call(parser, placeholderEvent, parser);
                return placeholderEvent.value;
            }

            return placeholder.value;
        },

        notifyFinish() {
            if (listeners.onfinish) {
                listeners.onfinish.call(parser, {}, parser);
            }
        }
    };
};