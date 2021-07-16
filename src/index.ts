import { Parser } from "./internal";

export function createParser(listeners, options) {
  var parser = new Parser(listeners, options || {});
  return parser;
}
