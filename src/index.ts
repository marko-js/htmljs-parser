import { Parser } from "./internal";

export function createParser(listeners: any) {
  return new Parser(listeners);
}
