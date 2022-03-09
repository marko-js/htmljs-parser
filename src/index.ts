import { Parser, TempParser } from "./internal";

export type { Events, Range, ValueRange, TemplateRange } from "./internal";

export { EventTypes, OpenTagEnding } from "./internal";

export function createParser(text: string, filename: string) {
  return new Parser(text, filename);
}

export function createLegacyParser(listeners: any) {
  return new TempParser(listeners);
}
