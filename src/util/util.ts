import { CODE, type Parser } from "../internal";
import { ErrorCode, Location, Position } from "./constants";

export function isWhitespaceCode(code: number) {
  // For all practical purposes, the space character (32) and all the
  // control characters below it are whitespace. We simplify this
  // condition for performance reasons.
  // NOTE: This might be slightly non-conforming.
  return code <= CODE.SPACE;
}

/**
 * Given a source code line offsets, a start offset and an end offset, returns a Location object with line & character information for the start and end offsets.
 */
export function getLocation(
  lines: number[],
  startOffset: number,
  endOffset: number
): Location {
  const start = getPosition(lines, startOffset);
  const end =
    startOffset === endOffset
      ? start
      : getPosAfterLine(lines, start.line, endOffset);
  return { start, end };
}

/**
 * Given a source code line offsets and an offset, returns a Position object with line & character information.
 */
export function getPosition(lines: number[], offset: number): Position {
  return getPosAfterLine(lines, 0, offset);
}

/**
 * Scan through some source code and generate an array of offsets for each newline.
 * Useful for generating line/column information for source code.
 */
export function getLines(src: string) {
  const lines = [0];
  for (let i = 0; i < src.length; i++) {
    if (src.charCodeAt(i) === CODE.NEWLINE) {
      lines.push(i + 1);
    }
  }

  return lines;
}

export function htmlEOF(this: Parser) {
  this.endText();

  while (this.activeTag) {
    if (this.activeTag.concise) {
      this.closeTagEnd(this.pos, this.pos, undefined);
    } else {
      // We found an unclosed tag on the stack that is not for a concise tag. That means
      // there is a problem with the template because all open tags should have a closing
      // tag
      //
      // NOTE: We have already closed tags that are open tag only or self-closed
      return this.emitError(
        this.activeTag,
        ErrorCode.MISSING_END_TAG,
        'Missing ending "' + this.read(this.activeTag.tagName) + '" tag'
      );
    }
  }
}

export function matchesCloseAngleBracket(code: number) {
  return code === CODE.CLOSE_ANGLE_BRACKET;
}

export function matchesCloseParen(code: number) {
  return code === CODE.CLOSE_PAREN;
}

export function matchesCloseCurlyBrace(code: number) {
  return code === CODE.CLOSE_CURLY_BRACE;
}

export function matchesPipe(code: number) {
  return code === CODE.PIPE;
}

function getPosAfterLine(
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
    line,
    character: index - lines[line],
  };
}
