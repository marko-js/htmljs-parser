import { type ParserOptions, type Range, Parser } from "./internal";
export {
  TagType,
  ErrorCode,
  type ParserOptions as Handlers,
  type Position,
  type Location,
  type Ranges,
  type Range,
} from "./internal";

/**
 * Creates a new Marko parser.
 */
export function createParser(handlers: ParserOptions) {
  // Expose a subset of the parser api.
  const parser = new Parser(handlers);

  return {
    /**
     * Parses code and calls the provided handlers.
     */
    parse(code: string) {
      return parser.parse(code);
    },
    /**
     * Given an offset range in the current source code, reads and returns the substring in the input code.
     */
    read(range: Range) {
      return parser.read(range);
    },
    /**
     * Given a offset in the current source code, returns a Position object with line & character information.
     */
    positionAt(offset: number) {
      return parser.positionAt(offset);
    },
    /**
     * Given a offset range in the current source code, returns a Location object with a start & end position information.
     */
    locationAt(range: Range) {
      return parser.locationAt(range);
    },
  };
}
