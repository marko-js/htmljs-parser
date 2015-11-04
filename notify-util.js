var CODE_NEWLINE = 10;
var NUMBER_REGEX = /^[\-\+]?\d*(?:\.\d+)?(?:e[\-\+]?\d+)?$/;

function _removeDelimitersFromArgument(arg) {
    return arg.substring(1, arg.length - 1);
}

function _updateAttributeLiteralValue(attr) {
    var expression = attr.expression;
    if (expression.length === 0) {
        attr.literalValue = '';
    } else if (expression === 'true') {
        attr.literalValue = true;
    } else if (expression === 'false') {
        attr.literalValue = false;
    } else if (expression === 'null') {
        attr.literalValue = null;
    } else if (expression === 'undefined') {
        attr.literalValue = undefined;
    } else if (NUMBER_REGEX.test(expression)) {
        attr.literalValue = Number(expression);
    }
}

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
                if (elementArguments) {
                    elementArguments = _removeDelimitersFromArgument(elementArguments);
                }

                // set the literalValue property for attributes that are simple
                // string simple values or simple literal values
                var i = attributes.length;
                while(--i >= 0) {
                    var attr = attributes[i];

                    // if possib
                    if (attr.isStringLiteral) {
                        var expression = attr.expression;
                        attr.literalValue = expression.substring(1, expression.length - 1);
                    } else if (attr.isSimpleLiteral) {
                        _updateAttributeLiteralValue(attr);
                    }

                    if (attr.argument) {
                        attr.argument = _removeDelimitersFromArgument(attr.argument);
                    }

                    delete attr.isStringLiteral;
                    delete attr.isSimpleLiteral;
                }

                var event = {
                    type: 'opentag',
                    name: name,
                    attributes: attributes
                };

                if (elementArguments) {
                    event.argument = elementArguments;
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
                ['depth', 'stringDelimiter', 'delimiterDepth', 'parentState', 'handler']
                    .forEach(function(key) {
                        delete placeholder[key];
                    });
                eventFunc.call(parser, placeholder);
            }
        }
    };
};