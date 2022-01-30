import { CODE } from "../internal";

export function cloneValue(data) {
  return {
    value: data.value,
    pos: data.pos,
    endPos: data.endPos
  }
}

export function getTagName(tag: any) {
  return tag.tagName.pos === undefined ? "" : tag.tagName.value;
}

export function isWhitespaceCode(code) {
  // For all practical purposes, the space character (32) and all the
  // control characters below it are whitespace. We simplify this
  // condition for performance reasons.
  // NOTE: This might be slightly non-conforming.
  return code <= CODE.SPACE;
}

export function peek(array) {
  var len = array.length;
  if (!len) {
    return undefined;
  }
  return array[len - 1];
}
