import { CODE, ValuePart } from "../internal";

export function cloneValue<T extends ValuePart>(data: T) {
  return {
    value: data.value,
    pos: data.pos,
    endPos: data.endPos,
  } as ValuePart;
}

export function getTagName(tag: any) {
  return tag.tagName.pos === undefined ? "" : tag.tagName.value;
}

export function isWhitespaceCode(code: number) {
  // For all practical purposes, the space character (32) and all the
  // control characters below it are whitespace. We simplify this
  // condition for performance reasons.
  // NOTE: This might be slightly non-conforming.
  return code <= CODE.SPACE;
}

export function peek<T = unknown>(array: T[]): T | undefined {
  const len = array.length;
  return len === 0 ? undefined : array[len - 1];
}
