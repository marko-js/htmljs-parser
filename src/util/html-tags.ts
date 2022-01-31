const openTagOnly = new Set([
  "base",
  "br",
  "col",
  "hr",
  "embed",
  "img",
  "input",
  "keygen",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

export function isOpenTagOnly(tagName: string) {
  return openTagOnly.has(tagName);
}
