import { Parser } from "./internal";

export function createParser(text: string, filename: string) {
  return new Parser(text, filename);
}
