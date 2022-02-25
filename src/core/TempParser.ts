import {
  Events,
  EventTypes,
  ExpressionRange,
  Parser,
  Range,
} from "../internal";

export class TempParser {
  constructor(private _handlers: any) {
    this._handlers = _handlers;
  }
  parse(data: string, filename: string) {
    const parser = new Parser(data, filename);
    let isConcise = true;
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
          argument?: ExpressionRange;
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
            message: data.message,
            code: data.code,
            ...rangeToPos(data),
          });
          break;
        case EventTypes.Text:
          this._handlers.onText?.({
            type: "text",
            ...rangeToPos(data),
            value: parser.read(data),
          });
          break;
        case EventTypes.CDATA:
          this._handlers.onCDATA?.({
            type: "cdata",
            ...rangeToPos(data),
            value: parser.read(data.value),
          });
          break;
        case EventTypes.DocType:
          this._handlers.onDocumentType?.({
            type: "documentType",
            ...rangeToPos(data),
            value: parser.read(data.value),
          });
          break;

        case EventTypes.Declaration:
          this._handlers.onDeclaration?.({
            type: "declaration",
            ...rangeToPos(data),
            value: parser.read(data.value),
          });
          break;
        case EventTypes.Comment:
          this._handlers.onComment?.({
            type: "comment",
            ...rangeToPos(data),
            value: parser.read(data),
          });
          break;
        case EventTypes.Placeholder:
          this._handlers.onPlaceholder?.({
            type: "placeholder",
            escape: data.escape,
            ...rangeToPos(data),
            value: parser.read(data.value),
          });
          break;
        case EventTypes.OpenTagStart: {
          isConcise = data.start === data.end;
          break;
        }
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
              ...rangeToPos(curTagVar),
              value: parser.read(curTagVar.value),
            },
            argument: curTagArgs && {
              ...rangeToPos(curTagArgs),
              value: parser.read(curTagArgs.value),
            },
            params: curTagParams && {
              ...rangeToPos(curTagParams),
              value: parser.read(curTagParams.value),
            },
            pos: curTagName!.start - (isConcise ? 0 : 1),
            endPos: data.end,
            tagNameEndPos: curTagName!.end,
            selfClosed: data.selfClosed,
            openTagOnly: data.openTagOnly,
            attributes: (curAttrs || []).map((attr) => ({
              default: attr.name?.default,
              name: attr.name && parser.read(attr.name),
              pos: attr.name?.start ?? attr.value?.start,
              endPos: attr.value?.end ?? attr.name?.end,
              value: attr.value && parser.read(attr.value),
              bound: attr.bound,
              method: attr.method,
              spread: attr.spread,
              argument: attr.argument && {
                ...attr.argument,
                value: parser.read(attr.argument.value),
              },
            })),
            concise: isConcise,
            shorthandId: curShorthandId && {
              ...rangeToPos(curShorthandId),
              value: parser.read(curShorthandId).slice(1),
            },
            shorthandClassNames:
              curShorthandClassNames &&
              curShorthandClassNames.map((shorthandClassName) => ({
                ...rangeToPos(shorthandClassName),
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
                  ...rangeToPos(data),
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
            block: data.block,
            line: !data.block,
            ...rangeToPos(data),
            value: parser.read(data.value),
          });
          break;
      }
    }
  }
}

function rangeToPos(range: Range) {
  return {
    pos: range.start,
    endPos: range.end,
  };
}
