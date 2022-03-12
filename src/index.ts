import { Handlers, Parser } from "./internal";

export type { Handlers, Ranges, Range } from "./internal";

export { OpenTagEnding } from "./internal";

export function createParser(handlers: Handlers) {
  return new Parser(handlers);
}
