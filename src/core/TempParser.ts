import { Parser, Range, OpenTagEnding, Ranges } from "../internal";

export class TempParser {
  constructor(private _handlers: any) {
    this._handlers = _handlers;
  }
  parse(data: string, filename: string) {
    let curTagName: Ranges.TagName | undefined = undefined;
    let curShorthandId: Ranges.Template | undefined;
    let curShorthandClassNames: Ranges.Template[] | undefined;
    let curTagVar: Ranges.Value | undefined;
    let curTagArgs: Ranges.Value | undefined;
    let curTagParams: Ranges.Value | undefined;
    let curAttr:
      | {
          name?: Range;
          value?: Range;
          argument?: Ranges.Value;
          method?: boolean;
          spread?: boolean;
          bound?: boolean;
        }
      | undefined;
    let curAttrs: Exclude<typeof curAttr, undefined>[] | undefined;

    const parser = new Parser({
      onError: (data) => {
        this._handlers.onError?.({
          type: "error",
          pos: data.start,
          endPos: data.end,
          code: data.code,
          message: data.message,
        });
      },
      onText: (data) => {
        this._handlers.onText?.({
          type: "text",
          pos: data.start,
          endPos: data.end,
          value: parser.read(data),
        });
      },
      onCDATA: (data) => {
        this._handlers.onCDATA?.({
          type: "cdata",
          pos: data.start,
          endPos: data.end,
          value: parser.read(data.value),
        });
      },
      onDoctype: (data) => {
        this._handlers.onDocumentType?.({
          type: "documentType",
          pos: data.start,
          endPos: data.end,
          value: parser.read(data.value),
        });
      },
      onDeclaration: (data) => {
        this._handlers.onDeclaration?.({
          type: "declaration",
          pos: data.start,
          endPos: data.end,
          value: parser.read(data.value),
        });
      },
      onComment: (data) => {
        this._handlers.onComment?.({
          type: "comment",
          pos: data.start,
          endPos: data.end,
          value: parser.read(data.value),
        });
      },
      onPlaceholder: (data) => {
        this._handlers.onPlaceholder?.({
          type: "placeholder",
          pos: data.start,
          endPos: data.end,
          escape: data.escape,
          value: parser.read(data.value),
        });
      },
      onTagName: (data) => {
        curTagName = data;
      },
      onTagShorthandId: (data) => {
        curShorthandId = data;
      },
      onTagShorthandClass: (data) => {
        curShorthandClassNames ??= [];
        curShorthandClassNames.push(data);
      },
      onTagVar: (data) => {
        curTagVar = data;
      },
      onTagArgs: (data) => {
        curTagArgs = data;
      },
      onTagParams: (data) => {
        curTagParams = data;
      },
      onAttrName: (data) => {
        curAttrs ??= [];
        curAttrs.push(
          (curAttr = { name: data.start === data.end ? undefined : data })
        );
      },
      onAttrArgs: (data) => {
        curAttr!.argument = data;
      },
      onAttrValue: (data) => {
        curAttr!.value = data.value;
        curAttr!.bound = data.bound;
      },
      onAttrMethod: (data) => {
        curAttr!.method = true;
        curAttr!.argument = data.params;
        curAttr!.value = data.body.value;
      },
      onAttrSpread: (data) => {
        curAttr = undefined;
        curAttrs ??= [];
        curAttrs.push({
          value: data.value,
          spread: true,
        });
      },
      onOpenTagEnd: (data) => {
        this._handlers.onOpenTag?.({
          type: "openTag",
          tagName: parser.read(curTagName!),
          tagNameExpression:
            curTagName!.expressions.length === 1 &&
            curTagName!.quasis[0].start === curTagName!.quasis[0].end &&
            curTagName!.quasis[1].start === curTagName!.quasis[1].end &&
            parser.read(curTagName!.expressions[0].value),
          var: curTagVar && {
            pos: curTagVar.start,
            endPos: curTagVar.end,
            value: parser.read(curTagVar.value),
          },
          argument: curTagArgs && {
            pos: curTagArgs.start,
            endPos: curTagArgs.end,
            value: parser.read(curTagArgs.value),
          },
          params: curTagParams && {
            pos: curTagParams.start,
            endPos: curTagParams.end,
            value: parser.read(curTagParams.value),
          },
          pos: curTagName!.start - (curTagName!.concise ? 0 : 1),
          endPos: data.end,
          tagNameEndPos: curTagName!.end,
          selfClosed: Boolean(data.ending & OpenTagEnding.self),
          openTagOnly: Boolean(data.ending & OpenTagEnding.void),
          code:
            Boolean(data.ending & OpenTagEnding.code) &&
            parser.read({ start: curTagName!.start, end: data.end }),
          attributes: (curAttrs || []).map((attr) => ({
            default: !attr.spread && !attr.name,
            name: attr.name ? parser.read(attr.name) || "default" : undefined,
            pos: attr.name?.start ?? attr.value?.start,
            endPos: attr.value?.end ?? attr.name?.end,
            value: attr.value && parser.read(attr.value),
            bound: attr.bound,
            method: attr.method,
            spread: attr.spread,
            argument: attr.argument && {
              pos: attr.argument.start,
              endPos: attr.argument.end,
              value: parser.read(attr.argument.value),
            },
          })),
          concise: curTagName!.concise,
          shorthandId: curShorthandId && {
            pos: curShorthandId.start,
            endPos: curShorthandId.end,
            value: parser.read(curShorthandId).slice(1),
          },
          shorthandClassNames:
            curShorthandClassNames &&
            curShorthandClassNames.map((shorthandClassName) => ({
              pos: shorthandClassName.start,
              endPos: shorthandClassName.end,
              value: parser.read(shorthandClassName).slice(1),
            })),
        });

        curTagName = undefined;
        curShorthandId = undefined;
        curShorthandClassNames = undefined;
        curTagVar = undefined;
        curTagArgs = undefined;
        curTagParams = undefined;
        curAttrs = undefined;
        curAttr = undefined;
      },
      onCloseTag: (data) => {
        this._handlers.onCloseTag?.(
          data.value
            ? {
                type: "closeTag",
                pos: data.start,
                endPos: data.end,
                tagName: parser.read(data.value),
              }
            : {
                type: "closeTag",
                pos: null,
                endPos: null,
                tagName: "",
              }
        );
      },
      onScriptlet: (data) => {
        this._handlers.onScriptlet?.({
          type: "scriptlet",
          pos: data.start,
          endPos: data.end,
          block: data.block,
          line: !data.block,
          value: parser.read(data.value),
        });
      },
    });

    parser.parse(data, filename);

    this._handlers.onfinish?.();
  }
}
