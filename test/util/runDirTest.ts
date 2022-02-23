import fs from "fs";
import TreeBuilder from "./TreeBuilder";
import { createParser } from "../../src";
import {
  AttrMethodRange,
  ErrorRange,
  ExpressionRange,
  PlaceholderRange,
  Range,
  ScriptletRange,
  TemplateRange,
} from "../../src/internal";
import { OpenTagRange } from "../../src/states";

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
  let curTagName: TemplateRange;
  let curShorthandId: TemplateRange;
  let curShorthandClassNames: TemplateRange[];
  let curTagVar: ExpressionRange;
  let curTagArgs: ExpressionRange;
  let curTagParams: ExpressionRange;
  let curAttrs: (
    | Partial<{ name: AttrNamePos } & AttrValuePos>
    | ExpressionRange
  )[];

  for (const [type, data] of parser) {
    switch (type) {
      case "error":
        builder.listeners.onError({
          type,
          message: (data as ErrorRange).message,
          code: (data as ErrorRange).code,
          ...rangeToPos(data),
        });
        break;
      case "text":
        builder.listeners.onText({
          type,
          ...rangeToPos(data),
          value: parser.read(data),
        });
        break;
      case "cdata":
        builder.listeners.onCDATA({
          type,
          ...rangeToPos(data),
          value: parser.read((data as ExpressionRange).value),
        });
        break;
      case "doctype":
        builder.listeners.onDocumentType({
          type: "documentType",
          ...rangeToPos(data),
          value: parser.read((data as ExpressionRange).value),
        });
        break;

      case "declaration":
        builder.listeners.onDeclaration({
          type,
          ...rangeToPos(data),
          value: parser.read((data as ExpressionRange).value),
        });
        break;
      case "comment":
        builder.listeners.onComment({
          type,
          ...rangeToPos(data),
          value: parser.read(data),
        });
        break;
      case "placeholder":
        builder.listeners.onPlaceholder({
          type,
          escape: (data as PlaceholderRange).escape,
          ...rangeToPos(data),
          value: {
            ...rangeToPos((data as PlaceholderRange).value),
            value: parser.read((data as PlaceholderRange).value),
          },
        });
        break;
      case "tagStart": {
        isConcise = data.start === data.end;
        break;
      }
      case "tagName": {
        curTagName = data as TemplateRange;
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
      case "tagShorthandId":
        curShorthandId = data as TemplateRange;
        break;
      case "tagShorthandClass":
        curShorthandClassNames ??= [];
        curShorthandClassNames.push(data as TemplateRange);
        break;
      case "tagVar":
        curTagVar = data as ExpressionRange;
        break;
      case "tagArgs":
        curTagArgs = data as ExpressionRange;
        break;
      case "tagParams":
        curTagParams = data as ExpressionRange;
        break;
      case "attrName":
        curAttrs ??= [];
        curAttrs.push({ name: data as AttrNamePos });
        break;
      case "attrArgs":
        Object.assign(curAttrs[curAttrs.length - 1], { argument: data });
        break;
      case "attrValue":
        Object.assign(curAttrs[curAttrs.length - 1], data);
        break;
      case "attrMethod":
        Object.assign(curAttrs[curAttrs.length - 1], {
          method: true,
          value: (data as AttrMethodRange).body,
          argument: (data as AttrMethodRange).params,
        });
        break;
      case "spreadAttr":
        curAttrs ??= [];
        curAttrs.push(data);
        break;
      case "tagEnd":
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
          selfClosed: (data as OpenTagRange).selfClosed,
          openTagOnly: (data as OpenTagRange).openTagOnly,
          attributes: (
            (curAttrs || []) as ({ name: AttrNamePos } & AttrValuePos)[]
          ).map((attr) => ({
            default: attr.name?.default,
            name: attr.name && {
              ...rangeToPos(attr.name),
              value: parser.read(attr.name),
            },
            pos: attr.start,
            endPos: attr.end,
            value: attr.value && {
              ...rangeToPos(attr.value),
              value: parser.read(attr.value),
            },
            bound: attr.bound,
            method: attr.method,
            spread: attr.name === undefined,
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
      case "closeTag":
        builder.listeners.onCloseTag({
          type,
          ...rangeToPos(data),
          tagName: (data as ExpressionRange).value && {
            ...rangeToPos((data as ExpressionRange).value),
            value: parser.read((data as ExpressionRange).value),
          },
        });
        break;
      case "scriptlet":
        builder.listeners.onScriptlet({
          type,
          block: (data as ScriptletRange).block,
          ...rangeToPos(data),
          value: parser.read((data as ExpressionRange).value),
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
