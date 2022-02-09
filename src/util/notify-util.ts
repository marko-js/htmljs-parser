import { Parser, ValuePart } from "../internal";

export function createNotifiers(parser: Parser, listeners) {
  let hasError = false;

  return {
    notifyText(pos, endPos, value, parseMode) {
      if (hasError) {
        return;
      }

      const eventFunc = listeners.onText;

      if (eventFunc && value.length > 0) {
        eventFunc.call(
          parser,
          {
            type: "text",
            value,
            parseMode,
            pos,
            endPos,
          },
          parser
        );
      }
    },

    notifyCDATA(cdata) {
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
            pos: cdata.pos,
            endPos: cdata.endPos,
            value: value,
          },
          parser
        );
      }
    },

    notifyError(pos, errorCode, message) {
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

    notifyOpenTagName(tagInfo) {
      if (hasError) {
        return;
      }

      const eventFunc = listeners.onOpenTagName;

      if (eventFunc) {
        // set the literalValue property for attributes that are simple
        // string simple values or simple literal values

        const event = {
          type: "openTagName",
          tagName: tagInfo.tagName,
          pos: tagInfo.pos,
          endPos: tagInfo.tagName.endPos,
          concise: tagInfo.concise,
          shorthandId: tagInfo.shorthandId,
          shorthandClassNames: tagInfo.shorthandClassNames,
        };

        eventFunc.call(parser, event, parser);
      }
    },

    notifyOpenTag(tagInfo) {
      if (hasError) {
        return;
      }

      const eventFunc = listeners.onOpenTag;

      if (eventFunc) {
        // set the literalValue property for attributes that are simple
        // string simple values or simple literal values

        const event = {
          type: "openTag",
          tagName: tagInfo.tagName,
          var: tagInfo.var,
          argument: tagInfo.argument,
          params: tagInfo.params,
          pos: tagInfo.pos,
          endPos: tagInfo.endPos,
          concise: tagInfo.concise,
          openTagOnly: tagInfo.openTagOnly,
          selfClosed: tagInfo.selfClosed,
          shorthandId: tagInfo.shorthandId,
          shorthandClassNames: tagInfo.shorthandClassNames,
          attributes: tagInfo.attributes.map((attr) => ({
            default: attr.default,
            spread: attr.spread,
            name: attr.name,
            value: attr.value,
            pos: attr.pos,
            endPos: attr.endPos,
            argument: attr.argument,
            method: attr.method,
            bound: attr.bound,
          })),
        };

        eventFunc.call(parser, event, parser);
      }
    },

    notifyCloseTag(
      pos: number | undefined,
      endPos: number | undefined,
      tagName: ValuePart | undefined
    ) {
      if (hasError) {
        return;
      }

      const eventFunc = listeners.onCloseTag;

      if (eventFunc) {
        const event = {
          type: "closeTag",
          tagName: tagName
            ? {
                value: tagName.value,
                pos: tagName.pos,
                endPos: tagName.endPos,
              }
            : undefined,
          pos,
          endPos,
        };

        eventFunc.call(parser, event, parser);
      }
    },

    notifyDocumentType(documentType) {
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
            pos: documentType.pos,
            endPos: documentType.endPos,
          },
          parser
        );
      }
    },

    notifyDeclaration(declaration) {
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
            pos: declaration.pos,
            endPos: declaration.endPos,
          },
          parser
        );
      }
    },

    notifyComment(comment) {
      if (hasError) {
        return;
      }

      const eventFunc = listeners.onComment;

      if (eventFunc && comment.value) {
        eventFunc.call(
          parser,
          {
            type: "comment",
            value: comment.value,
            pos: comment.pos,
            endPos: comment.endPos,
          },
          parser
        );
      }
    },

    notifyScriptlet(scriptlet) {
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
            value: scriptlet.value,
            pos: scriptlet.pos,
            endPos: scriptlet.endPos,
          },
          parser
        );
      }
    },

    notifyPlaceholder(placeholder) {
      if (hasError) {
        return;
      }

      const eventFunc = listeners.onPlaceholder;
      if (eventFunc) {
        const placeholderEvent = {
          type: "placeholder",
          value: placeholder.value,
          pos: placeholder.pos,
          endPos: placeholder.endPos,
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
