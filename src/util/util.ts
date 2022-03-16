import { CODE } from "../internal";
import type { Location, Position, Range } from "./constants";

export function isWhitespaceCode(code: number) {
  // For all practical purposes, the space character (32) and all the
  // control characters below it are whitespace. We simplify this
  // condition for performance reasons.
  // NOTE: This might be slightly non-conforming.
  return code <= CODE.SPACE;
}

export function getLoc(lines: number[], range: Range): Location {
  const start = getPos(lines, 0, range.start);
  const end =
    range.start === range.end
      ? start
      : getPos(lines, start.line - 1, range.end);
  return { start, end };
}

export function getPos(
  lines: number[],
  startLine: number,
  index: number
): Position {
  let max = lines.length - 1;
  let line = startLine;

  while (line < max) {
    const mid = (1 + line + max) >>> 1;

    if (lines[mid] <= index) {
      line = mid;
    } else {
      max = mid - 1;
    }
  }

  return {
    line: line + 1,
    column: index - lines[line],
  };
}

export function getLines(src: string) {
  const lines = [-1];
  for (let i = 0; i < src.length; i++) {
    if (src.charCodeAt(i) === CODE.NEWLINE) {
      lines.push(i);
    }
  }

  return lines;
}
