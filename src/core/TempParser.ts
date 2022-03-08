import {
  Events,
  EventTypes,
  ValueRange,
  Parser,
  Range,
  OpenTagEnding,
} from "../internal";

export class TempParser {
  constructor(private _handlers: any) {
    this._handlers = _handlers;
  }
  parse(data: string, filename: string) {
    const parser = new Parser(data, filename);
    let curTagName: Events.TagName | undefined = undefined;
    let curShorthandId: Events.TagShorthandId | undefined;
    let curShorthandClassNames: Events.TagShorthandClass[] | undefined;
    let curTagVar: Events.TagVar | undefined;
    let curTagArgs: Events.TagArgs | undefined;
    let curTagParams: Events.TagParams | undefined;
    let curAttr:
      | {
          name?: Events.AttrName;
          value?: Range;
          argument?: ValueRange;
          method?: boolean;
          spread?: boolean;
          bound?: boolean;
        }
      | undefined;
    let curAttrs: Exclude<typeof curAttr, undefined>[] | undefined;

    for (const data of parser) {
      switch (data.type) {
        case EventTypes.Error:
          this._handlers.onError?.({
            type: "error",
            pos: data.start,
            endPos: data.end,
            code: data.code,
            message: data.message,
          });
          break;
        case EventTypes.Text:
          this._handlers.onText?.({
            type: "text",
            pos: data.start,
            endPos: data.end,
            value: parser.read(data),
          });
          break;
        case EventTypes.CDATA:
          this._handlers.onCDATA?.({
            type: "cdata",
            pos: data.start,
            endPos: data.end,
            value: parser.read(data.value),
          });
          break;
        case EventTypes.DocType:
          this._handlers.onDocumentType?.({
            type: "documentType",
            pos: data.start,
            endPos: data.end,
            value: parser.read(data.value),
          });
          break;

        case EventTypes.Declaration:
          this._handlers.onDeclaration?.({
            type: "declaration",
            pos: data.start,
            endPos: data.end,
            value: parser.read(data.value),
          });
          break;
        case EventTypes.Comment:
          this._handlers.onComment?.({
            type: "comment",
            pos: data.start,
            endPos: data.end,
            value: parser.read(data.value),
          });
          break;
        case EventTypes.Placeholder:
          this._handlers.onPlaceholder?.({
            type: "placeholder",
            pos: data.start,
            endPos: data.end,
            escape: data.escape,
            value: parser.read(data.value),
          });
          break;
        case EventTypes.TagName: {
          curTagName = data;
          break;
        }
        case EventTypes.TagShorthandId:
          curShorthandId = data;
          break;
        case EventTypes.TagShorthandClass:
          curShorthandClassNames ??= [];
          curShorthandClassNames.push(data);
          break;
        case EventTypes.TagVar:
          curTagVar = data;
          break;
        case EventTypes.TagArgs:
          curTagArgs = data;
          break;
        case EventTypes.TagParams:
          curTagParams = data;
          break;
        case EventTypes.AttrName:
          curAttrs ??= [];
          curAttrs.push((curAttr = { name: data }));
          break;
        case EventTypes.AttrArgs:
          curAttr!.argument = data;
          break;
        case EventTypes.AttrValue:
          curAttr!.value = data.value;
          curAttr!.bound = data.bound;
          break;
        case EventTypes.AttrMethod:
          curAttr!.method = true;
          curAttr!.argument = data.params;
          curAttr!.value = data.body.value;
          break;
        case EventTypes.AttrSpread:
          curAttr = undefined;
          curAttrs ??= [];
          curAttrs.push({
            value: data.value,
            spread: true,
          });
          break;
        case EventTypes.OpenTagEnd:
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
              default: attr.name?.default,
              name: attr.name
                ? attr.name.default
                  ? "default"
                  : parser.read(attr.name)
                : undefined,
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
          break;
        case EventTypes.CloseTag:
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
          break;
        case EventTypes.Scriptlet:
          this._handlers.onScriptlet?.({
            type: "scriptlet",
            pos: data.start,
            endPos: data.end,
            block: data.block,
            line: !data.block,
            value: parser.read(data.value),
          });
          break;
      }
    }

    this._handlers.onfinish?.();
  }
}
