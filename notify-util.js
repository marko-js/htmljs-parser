var CODE_NEWLINE = 10;

exports.createNotifiers = function(parser, listeners) {
    return {
        notifyText: function(txt) {
            if (listeners.ontext && (txt.length > 0)) {
                listeners.ontext({
                    type: 'text',
                    text: txt
                });
            }
        },

        notifyCDATA: function(txt) {
            if (listeners.oncdata && txt) {
                listeners.oncdata({
                    type: 'cdata',
                    text: txt
                });
            }
        },

        notifyError: function(pos, errorCode, message) {
            if (listeners.onerror) {

                var lineNumber = parser.lineNumber;

                var data = parser.data;
                var i = data.pos;
                while(--i >= pos) {
                    var code = data.charCodeAt(i);
                    if (code === CODE_NEWLINE) {
                        lineNumber--;
                    }
                }

                listeners.onerror({
                    type: 'error',
                    code: errorCode,
                    message: message,
                    startPos: pos,
                    endPos: parser.pos,
                    lineNumber: lineNumber
                });
            }
        },

        notifyOpenTag: function(name, attributes, elementArguments, selfClosed) {
            if (listeners.onopentag) {

                // set the staticText property for attributes that are simple
                // string values...
                var i = attributes.length;
                while(--i >= 0) {
                    var attr = attributes[i];
                    if (attr.possibleStaticText) {
                        var expression = attr.expression;
                        attr.staticText = expression.substring(1, expression.length - 1);
                    }

                    delete attr.possibleStaticText;
                }

                var event = {
                    type: 'opentag',
                    name: name,
                    attributes: attributes
                };

                if (elementArguments) {
                    event.arguments = elementArguments;
                }

                if (selfClosed) {
                    event.selfClosed = true;
                }

                listeners.onopentag.call(parser, event);
            }
        },

        notifyCloseTag: function(name, selfClosed) {
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
        },

        notifyDTD: function(dtd) {
            if (listeners.ondtd) {
                listeners.ondtd({
                    type: 'dtd',
                    dtd: dtd
                });
            }
        },

        notifyDeclaration: function(declaration) {
            if (listeners.ondeclaration) {
                listeners.ondeclaration.call(parser, {
                    type: 'declaration',
                    declaration: declaration
                });
            }
        },

        notifyCommentText: function(txt) {
            if (listeners.oncomment && txt) {
                listeners.oncomment.call(parser, {
                    type: 'comment',
                    comment: txt
                });
            }
        },

        notifyPlaceholder: function(placeholder) {
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
    };
};