import { CODE } from "../internal";

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
