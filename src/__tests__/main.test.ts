import fs from "fs";
import path from "path";
import snap from "mocha-snap";
import { getLines } from "../internal";
import { createParser, Position, Ranges, Range } from "..";

const FIXTURES = path.join(__dirname, "fixtures");

for (const entry of fs.readdirSync(FIXTURES)) {
  it(entry, async () => {
    const dir = path.join(FIXTURES, entry);
    const filename = path.join(dir, "input.marko");
    const src = await fs.promises.readFile(filename, "utf-8");
    const lines = getLines(src);
    const partsByLine: {
      range: Range;
      pos: Position;
      label: string;
    }[][] = Array.from({ length: lines.length }, () => []);
    const addRange = (label: string, range: Range) => {
      const pos = parser.positionAt(range.start);
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
    const tagStack: Ranges.TagName[] = [];
    const parser = createParser({
      onError(range) {
        addRange(`error(${range.code}:${range.message})`, range);
      },
      onText(range) {
        addRange("text", range);
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
      onTagName(range) {
        tagStack.push(range);
        addTemplateRange("tagName", range);
      },
      onTagShorthandId(range) {
        addTemplateRange("tagShorthandId", range);
      },
      onTagShorthandClass(range) {
        addTemplateRange("tagShorthandClass", range);
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
        addValueRange("attrMethod.params", range.params);
        addValueRange("attrMethod.body", range.body);
      },
      onAttrSpread(range) {
        addValueRange("attrSpread", range);
      },
      onOpenTagEnd(range) {
        addRange(
          `openTagEnd(${parser.read(tagStack[tagStack.length - 1])})`,
          range
        );
      },
      onCloseTag(range) {
        const label = `closeTag(${parser.read(tagStack.pop()!)})`;
        if (range.value) {
          addValueRange(label, range as Ranges.Value);
        } else {
          addRange(label, range);
        }
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
          parser.read({
            start: 0,
            end: lines[1],
          })
        }`;
      } else {
        result += `\n${
          linePrefix +
          parser.read({
            start: lines[line] + 1,
            end: lines[line + 1],
          })
        }`;
      }

      if (len) {
        const padding = " ".repeat(linePrefix.length - 3);
        parts.sort((a, b) => {
          const delta = (a.pos.character || 1) - (b.pos.character || 1);
          return delta === 0 ? b.range.start - a.range.start : delta;
        });

        let columns = "";
        let lastCol = 0;

        for (let i = 0; i < len; i++) {
          const part = parts[i];
          const col = part.pos.character || 1;
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
            const txt = parser.read(part.range);
            if (txt.length > 1 || /\s/.test(txt)) {
              label += ` ${JSON.stringify(
                parser.read(part.range).replace(/\r\n/g, "\n")
              )}`;
            }
          }

          const column = pos.character || 1;

          if (prevPart && (prevPart.pos.character || 1) === column) {
            label = `├${label}`;
          } else {
            label = `╰${label}`;
          }

          label = `${columns.slice(0, column - 1)}${label}`;
          result += `\n${padding + (prevPart ? `│  ${label}` : `╰─ ${label}`)}`;
        }
      }
    }

    await snap(result, ".txt", dir);
  });
}
