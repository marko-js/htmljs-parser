import type { Parser, Range } from "../internal";

export function createNotifiers(parser: Parser, listeners: any) {
  let hasError = false;

  return {
    notifyText(pos: number, endPos: number, parseMode: string) {
      if (hasError) {
        return;
      }

      const eventFunc = listeners.onText;

      if (eventFunc) {
        eventFunc.call(
          parser,
          {
            type: "text",
            value: parser.read({ start: pos, end: endPos }),
            parseMode,
            pos,
            endPos,
          },
          parser
        );
      }
    },

    notifyCDATA(cdata: any) {
      const value = parser.read(cdata.value);
      if (hasError) {
        return;
      }

      const eventFunc = listeners.onCDATA;

      if (eventFunc && value) {
        eventFunc.call(
          parser,
          {
            type: "cdata",
            pos: cdata.start,
            endPos: cdata.end,
            value: value,
          },
          parser
        );
      }
    },

    notifyError(pos: number, errorCode: string, message: string) {
      if (hasError) {
        return;
      }

      hasError = true;

      const eventFunc = listeners.onError;

      if (eventFunc) {
        eventFunc.call(
          parser,
          {
            type: "error",
            code: errorCode,
            message: message,
            pos: pos,
            endPos: Math.min(parser.pos + 1, parser.maxPos),
          },
          parser
        );
      }
    },

    notifyOpenTagName(tagInfo: any) {
      if (hasError) {
        return;
      }

      const eventFunc = listeners.onOpenTagName;

      if (eventFunc) {
        // set the literalValue property for attributes that are simple
        // string simple values or simple literal values

        const event = {
          type: "openTagName",
          tagName: {
            pos: tagInfo.tagName.start,
            endPos: tagInfo.tagName.end,
            value: parser.read(tagInfo.tagName),
          },
          pos: tagInfo.start,
          endPos: tagInfo.tagName.end,
          concise: tagInfo.concise,
          shorthandId: tagInfo.shorthandId && {
            pos: tagInfo.shorthandId.start,
            endPos: tagInfo.shorthandId.start,
            value: parser.read(tagInfo.shorthandId).slice(1),
          },
          shorthandClassNames:
            tagInfo.shorthandClassNames &&
            tagInfo.shorthandClassNames.map((className: any) => ({
              pos: className.start,
              endPos: className.end,
              value: parser.read(className).slice(1),
            })),
        };

        eventFunc.call(parser, event, parser);
      }
    },

    notifyOpenTag(tagInfo: any) {
      if (hasError) {
        return;
      }

      const eventFunc = listeners.onOpenTag;

      if (eventFunc) {
        // set the literalValue property for attributes that are simple
        // string simple values or simple literal values

        const event = {
          type: "openTag",
          tagName: {
            pos: tagInfo.tagName.start,
            endPos: tagInfo.tagName.end,
            value: parser.read(tagInfo.tagName),
          },
          var: tagInfo.var && {
            pos: tagInfo.var.start,
            endPos: tagInfo.var.end,
            value: parser.read(tagInfo.var.value),
          },
          argument: tagInfo.argument && {
            pos: tagInfo.argument.start,
            endPos: tagInfo.argument.end,
            value: parser.read(tagInfo.argument.value),
          },
          params: tagInfo.params && {
            pos: tagInfo.params.start,
            endPos: tagInfo.params.end,
            value: parser.read(tagInfo.params.value),
          },
          pos: tagInfo.start,
          endPos: tagInfo.end,
          concise: tagInfo.concise,
          openTagOnly: tagInfo.openTagOnly,
          selfClosed: tagInfo.selfClosed,
          shorthandId: tagInfo.shorthandId && {
            pos: tagInfo.shorthandId.start,
            endPos: tagInfo.shorthandId.end,
            value: parser.read(tagInfo.shorthandId).slice(1),
          },
          shorthandClassNames:
            tagInfo.shorthandClassNames &&
            tagInfo.shorthandClassNames.map((className: any) => ({
              pos: className.start,
              endPos: className.end,
              value: parser.read(className).slice(1),
            })),
          attributes: tagInfo.attributes.map((attr: any) => ({
            default: attr.default,
            spread: attr.spread,
            name: attr.default
              ? { name: "default" }
              : attr.name
              ? {
                  pos: attr.name.start,
                  endPos: attr.name.end,
                  value: parser.read(attr.name),
                }
              : undefined,
            value: attr.value && {
              pos: attr.value.start,
              endPos: attr.value.end,
              value: parser.read(attr.value.value),
            },
            pos: attr.start,
            endPos: attr.end,
            argument: attr.argument && {
              pos: attr.argument.start,
              endPos: attr.argument.end,
              value: parser.read(attr.argument.value),
            },
            method: attr.method,
            bound: attr.bound,
          })),
        };

        eventFunc.call(parser, event, parser);
      }
    },

    notifyCloseTag(closeTag: Range & { value?: Range }) {
      if (hasError) {
        return;
      }

      const eventFunc = listeners.onCloseTag;

      if (eventFunc) {
        const event = {
          type: "closeTag",
          tagName: closeTag.value && {
            pos: closeTag.start,
            endPos: closeTag.end,
            value: parser.read(closeTag.value),
          },
          pos: closeTag.start,
          endPos: closeTag.end,
        };

        eventFunc.call(parser, event, parser);
      }
    },

    notifyDocumentType(documentType: any) {
      if (hasError) {
        return;
      }

      const eventFunc = listeners.onDocumentType;

      if (eventFunc) {
        eventFunc.call(
          this,
          {
            type: "documentType",
            value: parser.read(documentType.value),
            pos: documentType.start,
            endPos: documentType.end,
          },
          parser
        );
      }
    },

    notifyDeclaration(declaration: any) {
      if (hasError) {
        return;
      }

      const eventFunc = listeners.onDeclaration;

      if (eventFunc) {
        eventFunc.call(
          parser,
          {
            type: "declaration",
            value: parser.read(declaration.value),
            pos: declaration.start,
            endPos: declaration.end,
          },
          parser
        );
      }
    },

    notifyComment(comment: any) {
      if (hasError) {
        return;
      }

      const eventFunc = listeners.onComment;

      if (eventFunc && comment.value) {
        eventFunc.call(
          parser,
          {
            type: "comment",
            value: parser.read(comment),
            pos: comment.start,
            endPos: comment.end,
          },
          parser
        );
      }
    },

    notifyScriptlet(scriptlet: any) {
      if (hasError) {
        return;
      }

      const eventFunc = listeners.onScriptlet;

      if (eventFunc && scriptlet.value) {
        eventFunc.call(
          parser,
          {
            type: "scriptlet",
            // TODO: enum
            tag: scriptlet.tag,
            block: scriptlet.block,
            value: parser.read(scriptlet.value),
            pos: scriptlet.start,
            endPos: scriptlet.end,
          },
          parser
        );
      }
    },

    notifyPlaceholder(placeholder: any) {
      if (hasError) {
        return;
      }

      const eventFunc = listeners.onPlaceholder;
      if (eventFunc) {
        const placeholderEvent = {
          type: "placeholder",
          value: {
            pos: placeholder.start,
            endPos: placeholder.end,
            value: parser.read(placeholder.value),
          },
          pos: placeholder.start,
          endPos: placeholder.end,
          escape: placeholder.escape,
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
    },
  };
}
