import fs from "fs";
import TreeBuilder from "./TreeBuilder";
import { createParser } from "../../src";
import { Events, EventTypes, ExpressionRange, Range } from "../../src/internal";

export default function runTest() {
  return function ({ test, resolve, snapshot }) {
    test(function () {
      const inputPath = resolve("input.htmljs");
      const testOptionsPath = resolve("test.js");
      const main = fs.existsSync(testOptionsPath) && require(testOptionsPath);

      snapshot(
        parse(
          main?.getSource?.() ??
            fs.readFileSync(inputPath, "utf8").replace(/\r\n|\n/g, "\n"),
          inputPath
        )
      );
    });
  };
}

function parse(text, inputPath) {
  const parser = createParser(text, inputPath);
  const builder = new TreeBuilder(text);
  let isConcise = true;
  let curTagName: Events.TagName;
  let curShorthandId: Events.TagShorthandId;
  let curShorthandClassNames: Events.TagShorthandClass[];
  let curTagVar: Events.TagVar;
  let curTagArgs: Events.TagArgs;
  let curTagParams: Events.TagParams;
  let curAttr: {
    name?: Events.AttrName;
    value?: Range;
    argument?: ExpressionRange;
    method?: boolean;
    spread?: boolean;
    bound?: boolean;
  };
  let curAttrs: typeof curAttr[];

  for (const data of parser) {
    switch (data.type) {
      case EventTypes.Error:
        builder.listeners.onError({
          type: "error",
          message: data.message,
          code: data.code,
          ...rangeToPos(data),
        });
        break;
      case EventTypes.Text:
        builder.listeners.onText({
          type: "text",
          ...rangeToPos(data),
          value: parser.read(data),
        });
        break;
      case EventTypes.CDATA:
        builder.listeners.onCDATA({
          type: "cdata",
          ...rangeToPos(data),
          value: parser.read(data.value),
        });
        break;
      case EventTypes.DocType:
        builder.listeners.onDocumentType({
          type: "documentType",
          ...rangeToPos(data),
          value: parser.read(data.value),
        });
        break;

      case EventTypes.Declaration:
        builder.listeners.onDeclaration({
          type: "declaration",
          ...rangeToPos(data),
          value: parser.read(data.value),
        });
        break;
      case EventTypes.Comment:
        builder.listeners.onComment({
          type: "comment",
          ...rangeToPos(data),
          value: parser.read(data),
        });
        break;
      case EventTypes.Placeholder:
        builder.listeners.onPlaceholder({
          type: "placeholder",
          escape: data.escape,
          ...rangeToPos(data),
          value: {
            ...rangeToPos(data.value),
            value: parser.read(data.value),
          },
        });
        break;
      case EventTypes.OpenTagStart: {
        isConcise = data.start === data.end;
        break;
      }
      case EventTypes.TagName: {
        curTagName = data;
        builder.listeners.onOpenTagName({
          type: "openTagName",
          tagName: {
            ...rangeToPos(curTagName),
            value: parser.read(curTagName),
            expression:
              curTagName.expressions.length === 1 &&
              curTagName.quasis[0].start === curTagName.quasis[0].end &&
              curTagName.quasis[1].start === curTagName.quasis[1].end
                ? {
                    value: parser.read(curTagName.expressions[0].value),
                  }
                : undefined,
          },
          pos: curTagName.start,
          endPos: curTagName.end,
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
        curAttr.argument = data;
        break;
      case EventTypes.AttrValue:
        curAttr.value = data.value;
        curAttr.bound = data.bound;
        break;
      case EventTypes.AttrMethod:
        curAttr.method = true;
        curAttr.argument = data.params;
        curAttr.value = data.body.value;
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
        curAttr = undefined;
        builder.listeners.onOpenTag({
          type: "openTag",
          tagName: {
            ...rangeToPos(curTagName),
            value: parser.read(curTagName),
            expression:
              curTagName.expressions.length === 1 &&
              curTagName.quasis[0].start === curTagName.quasis[0].end &&
              curTagName.quasis[1].start === curTagName.quasis[1].end
                ? {
                    value: parser.read(curTagName.expressions[0].value),
                  }
                : undefined,
          },
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
          pos: curTagName.start - (isConcise ? 0 : 1),
          endPos: data.end,
          tagNameEndPos: curTagName.end,
          selfClosed: data.selfClosed,
          openTagOnly: data.openTagOnly,
          attributes: (curAttrs || []).map((attr) => ({
            default: attr.name?.default,
            name: attr.name && {
              ...rangeToPos(attr.name),
              value: parser.read(attr.name),
            },
            pos: attr.name?.start ?? attr.value?.start,
            endPos: attr.value?.end ?? attr.name?.end,
            value: attr.value && {
              ...rangeToPos(attr.value),
              value: parser.read(attr.value),
            },
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
        break;
      case EventTypes.CloseTag:
        builder.listeners.onCloseTag({
          type: "closeTag",
          ...rangeToPos(data),
          tagName: data.value && {
            ...rangeToPos(data.value),
            value: parser.read(data.value),
          },
        });
        break;
      case EventTypes.Scriptlet:
        builder.listeners.onScriptlet({
          type: "scriptlet",
          block: data.block,
          ...rangeToPos(data),
          value: parser.read(data.value),
        });
        break;
    }
  }

  return builder.toString();
}

function rangeToPos(range: Range) {
  return {
    pos: range.start,
    endPos: range.end,
  };
}
