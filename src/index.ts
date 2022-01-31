import { Parser } from "./internal";

export function createParser(listeners, options) {
  return new Parser(listeners, options || {});
}
