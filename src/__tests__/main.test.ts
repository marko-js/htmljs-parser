import fs from "fs";
import path from "path";
import snap from "mocha-snap";
import { ErrorCode, getLines, TagType } from "../internal";
import { createParser, Position, Ranges, Range } from "..";

const FIXTURES = path.join(__dirname, "fixtures");

for (const entry of fs.readdirSync(FIXTURES)) {
  if (entry.endsWith(".skip")) {
    it.skip(entry.slice(0, -".skip".length));
    continue;
  }

  it(entry, async () => {
    const dir = path.join(FIXTURES, entry);
    const filename = path.join(dir, "input.marko");
    const src = await fs.promises.readFile(filename, "utf-8");
    // Use this if you want to psuedo test on windows locally.
    // const src = (await fs.promises.readFile(filename, "utf-8")).replace(/\n/g, "\r\n");
    const lines = getLines(src);
    const partsByLine: {
      range: Range;
      pos: Position;
      label: string;
    }[][] = Array.from({ length: lines.length }, () => []);
    // we'll remove windows newlines for the purposes of snapshots.
    const read = (range: Range) => parser.read(range).replace(/\r/g, "");
    const addRange = (label: string, inputRange: Range) => {
      // we'll normalize windows newline positions for the snapshots.
      const range =
        src.charAt(inputRange.start) === "\r"
          ? {
              start: inputRange.start + 1,
              end: inputRange.end,
            }
          : inputRange;
      const pos = positionAt(range.start);
      partsByLine[pos.line].push({
        label,
        range,
        pos,
      });
    };
    const addValueRange = (label: string, range: Ranges.Value) => {
      addRange(label, range);
      addRange(`${label}.value`, range.value);
    };
    const addTemplateRange = (label: string, range: Ranges.Template) => {
      const [first] = range.quasis;
      addRange(label, range);

      if (first.start !== range.start || first.end !== range.end) {
        addRange(`${label}.quasis[0]`, first);

        for (let i = 0; i < range.expressions.length; i++) {
          const j = i + 1;
          addRange(`${label}.quasis[${j}]`, range.quasis[j]);
          addRange(`${label}.expressions[${i}]`, range.expressions[i]);
        }
      }
    };
    const positionAt = (offset: number): Position => {
      if (offset && lines.includes(offset + 1)) {
        // Normalize lines to their first char.
        return parser.positionAt(offset + 1);
      }

      return parser.positionAt(offset);
    };
    const tagStack: { type: TagType; range: Ranges.Template }[] = [];
    const parser = createParser({
      onError(range) {
        addRange(`error(${ErrorCode[range.code]}:${range.message})`, range);
      },
      onText(range) {
        addRange("text", range);
      },
      onPlaceholder(range) {
        addValueRange(`placeholder${range.escape ? ":escape" : ""}`, range);
      },
      onCDATA(range) {
        addValueRange("cdata", range);
      },
      onDoctype(range) {
        addValueRange("doctype", range);
      },
      onDeclaration(range) {
        addValueRange("declaration", range);
      },
      onComment(range) {
        addValueRange("comment", range);
      },
      onOpenTagStart(range) {
        addRange("openTagStart", range);
      },
      onOpenTagName(range) {
        addTemplateRange("tagName", range);

        if (range.expressions.length === 0) {
          switch (parser.read(range)) {
            case "area":
            case "base":
            case "br":
            case "col":
            case "hr":
            case "embed":
            case "img":
            case "input":
            case "link":
            case "meta":
            case "param":
            case "source":
            case "track":
            case "wbr":
              tagStack.push({ type: TagType.void, range });
              return TagType.void;
            case "script":
            case "style":
            case "textarea":
            case "html-comment":
              tagStack.push({ type: TagType.text, range });
              return TagType.text;
            case "import":
            case "export":
            case "static":
            case "class":
              tagStack.push({ type: TagType.statement, range });
              return TagType.statement;
          }
        }

        tagStack.push({ type: TagType.html, range });
        return TagType.html;
      },
      onTagShorthandId(range) {
        addTemplateRange("tagShorthandId", range);
      },
      onTagShorthandClass(range) {
        addTemplateRange("tagShorthandClass", range);
      },
      onTagTypeArgs(range) {
        addValueRange("tagTypeArgs", range);
      },
      onTagVar(range) {
        addValueRange("tagVar", range);
      },
      onTagArgs(range) {
        addValueRange("tagArgs", range);
      },
      onTagParams(range) {
        addValueRange("tagParams", range);
      },
      onTagTypeParams(range) {
        addValueRange("tagTypeParams", range);
      },
      onAttrName(range) {
        addRange("attrName", range);
      },
      onAttrArgs(range) {
        addValueRange("attrArgs", range);
      },
      onAttrValue(range) {
        addValueRange(range.bound ? `attrValue:bound` : `attrValue`, range);
      },
      onAttrMethod(range) {
        addRange("attrMethod", range);
        if (range.typeParams)
          addValueRange("attrMethod.typeParams", range.typeParams);
        addValueRange("attrMethod.params", range.params);
        addValueRange("attrMethod.body", range.body);
      },
      onAttrSpread(range) {
        addValueRange("attrSpread", range);
      },
      onOpenTagEnd(range) {
        if (range.selfClosed) tagStack.pop();
        else
          switch (tagStack.at(-1)!.type) {
            case TagType.statement:
            case TagType.void:
              tagStack.pop();
              break;
          }
        addRange(`openTagEnd${range.selfClosed ? ":selfClosed" : ""}`, range);
      },
      onCloseTagStart(range) {
        addRange("closeTagStart", range);
      },
      onCloseTagName(range) {
        addRange("closeTagName", range);
      },
      onCloseTagEnd(range) {
        addRange(`closeTagEnd(${read(tagStack.pop()!.range)})`, range);
      },
      onScriptlet(range) {
        addValueRange(range.block ? `scriptlet:block` : `scriptlet`, range);
      },
    });
    parser.parse(src);

    let result = "";
    for (let line = 0; line < partsByLine.length; line++) {
      const parts = partsByLine[line];
      const len = parts.length;
      const linePrefix = `${line + 1}${
        len || (line === 0 && lines.length > 1)
          ? "╭"
          : line === lines.length - 1
          ? "╰"
          : "├"
      }─ `;

      if (line === 0) {
        result += `${
          linePrefix +
          read({
            start: 0,
            end: lines.length > 1 ? lines[1] - 1 : src.length,
          })
        }`;
      } else {
        result += `\n${
          linePrefix +
          read({
            start: lines[line],
            end: lines.length > line + 1 ? lines[line + 1] - 1 : src.length,
          })
        }`;
      }

      if (len) {
        const padding = " ".repeat(linePrefix.length - 3);
        parts.sort((a, b) => {
          const delta = a.pos.character - b.pos.character;
          return delta === 0 ? b.range.start - a.range.start : delta;
        });

        let columns = "";
        let lastCol = 0;

        for (let i = 0; i < len; i++) {
          const part = parts[i];
          const col = part.pos.character + 1;
          const delta = col - lastCol;

          if (delta > 0) {
            columns += `${" ".repeat(delta - 1)}│`;
            lastCol = col;
          }
        }

        for (let i = len; i--; ) {
          const part = parts[i];
          const prevPart = i ? parts[i - 1] : undefined;
          const { range, pos } = part;
          let label = `─ ${part.label}`;

          if (range.end > range.start) {
            const txt = read(part.range);
            if (txt.length > 1 || /\s/.test(txt)) {
              label += ` ${JSON.stringify(txt)}`;
            }
          }

          const column = pos.character;

          if (prevPart && prevPart.pos.character === column) {
            label = `├${label}`;
          } else {
            label = `╰${label}`;
          }

          label = `${columns.slice(0, column)}${label}`;
          result += `\n${padding + (prevPart ? `│  ${label}` : `╰─ ${label}`)}`;
        }
      }
    }

    await snap(result, ".txt", dir);
  });
}
