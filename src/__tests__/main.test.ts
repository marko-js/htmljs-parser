import fs from "fs";
import path from "path";
import { createParser, Range } from "..";
import { CODE, Ranges } from "../internal";

const FIXTURES = path.join(__dirname, "fixtures");

for (const entry of fs.readdirSync(FIXTURES)) {
  describe(entry, () => {
    it("parses", async () => {
      const filename = path.join(FIXTURES, entry, "input.marko");
      const src = await fs.promises.readFile(filename, "utf-8");
      const lines = getLines(src);
      const partsByLine: {
        range: Range;
        loc: ReturnType<typeof getLocRange>;
        label: string;
      }[][] = lines.map(() => []);
      const addRange = (label: string, range: Range) => {
        const loc = getLocRange(lines, range);
        partsByLine[loc.start.line - 1].push({
          label,
          range,
          loc,
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
          addRange(`openTagEnd(${parser.read(tagStack[tagStack.length - 1])})`, range);
        },
        onCloseTag(range) {
          const label = `closeTag(${parser.read(tagStack.pop()!)})`
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
      parser.parse(src, filename);

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
            const delta = (a.loc.start.column || 1) - (b.loc.start.column || 1);
            return delta === 0 ? b.range.start - a.range.start : delta;
          });

          let columns = "";
          let lastCol = 0;

          for (let i = 0; i < len; i++) {
            const part = parts[i];
            const col = part.loc.start.column || 1;
            const delta = col - lastCol;

            if (delta > 0) {
              columns += `${" ".repeat(delta - 1)}│`;
              lastCol = col;
            }
          }

          for (let i = len; i--; ) {
            const part = parts[i];
            const prevPart = i ? parts[i - 1] : undefined;
            const { range, loc } = part;
            let label = `─ ${part.label}`;

            if (range.end > range.start) {
              const txt = parser.read(part.range);
              if (txt.length > 1 || /\s/.test(txt)) {
                label += ` ${JSON.stringify(parser.read(part.range))}`;
              }
            }

            if (
              prevPart &&
              (prevPart.loc.start.column || 1) === (loc.start.column || 1)
            ) {
              label = `├${label}`;
            } else {
              label = `╰${label}`;
            }

            label = `${columns.slice(0, (loc.start.column || 1) - 1)}${label}`;
            result += `\n${
              padding + (prevPart ? `│  ${label}` : `╰─ ${label}`)
            }`;
          }
        }
      }

      console.log(result);
    });
  });
}

function getLocRange(lines: number[], range: Range) {
  const start = findLoc(lines, 0, range.start);
  const end =
    range.start === range.end
      ? start
      : findLoc(lines, start.line - 1, range.end);
  return { start, end };
}

function findLoc(lines: number[], startLine: number, pos: number) {
  let max = lines.length - 1;
  let line = startLine;

  while (line < max) {
    const mid = (1 + line + max) >>> 1;

    if (lines[mid] <= pos) {
      line = mid;
    } else {
      max = mid - 1;
    }
  }

  return {
    line: line + 1,
    column: line === 0 ? pos + 1 : pos - lines[line],
  };
}

function getLines(src: string) {
  const lines = [0]; // TODO: should this include BOM?
  for (let i = 0; i < src.length; i++) {
    if (src.charCodeAt(i) === CODE.NEWLINE) {
      lines.push(i);
    }
  }

  return lines;
}
