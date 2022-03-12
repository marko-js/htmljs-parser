import { type Handlers, Parser } from "./internal";
export {
  OpenTagEnding,
  type Handlers,
  type Ranges,
  type Range,
} from "./internal";

export function createParser(handlers: Handlers) {
  return new Parser(handlers);
}
