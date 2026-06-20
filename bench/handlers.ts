import { type ParserOptions, TagType } from "../src/index.ts";

/**
 * Tags the real Marko compiler treats as raw-text content (their body is not
 * parsed as markup). Returning `TagType.text` for these exercises the
 * PARSED_TEXT_CONTENT state, which is otherwise never hit with no-op handlers.
 */
const TEXT_TAGS = new Set(["script", "style", "textarea", "html-comment"]);

export interface BenchSink {
  /** Source of the file currently being parsed (set before each parse). */
  src: string;
  /** Accumulated checksum, read after parsing to defeat dead-code elimination. */
  sum: number;
  errors: number;
}

/**
 * Builds a full set of parser handlers that do a small, constant amount of work
 * (accumulating a checksum from every emitted range). This forces the parser
 * down its real emit paths instead of the optional-chaining fast-outs taken
 * when a handler is absent, giving a representative measurement.
 */
export function createHandlers(sink: BenchSink): ParserOptions {
  const r = (data: { start: number; end: number }) => {
    sink.sum = (sink.sum + data.start + data.end) | 0;
  };

  return {
    onError(data) {
      sink.errors++;
      sink.sum = (sink.sum + data.start) | 0;
    },
    onText: r,
    onPlaceholder: r,
    onComment: r,
    onCDATA: r,
    onDeclaration: r,
    onDoctype: r,
    onScriptlet: r,
    onOpenTagStart: r,
    onOpenTagName(data) {
      r(data);
      // Classify a handful of well-known raw-text tags so that state gets
      // exercised. Reading the name is also part of a realistic handler.
      const name = sink.src.slice(data.start, data.end);
      return TEXT_TAGS.has(name) ? TagType.text : TagType.html;
    },
    onTagShorthandId: r,
    onTagShorthandClass: r,
    onTagTypeArgs: r,
    onTagVar: r,
    onTagArgs: r,
    onTagTypeParams: r,
    onTagParams: r,
    onAttrName: r,
    onAttrArgs: r,
    onAttrValue: r,
    onAttrMethod(data) {
      r(data);
      r(data.body);
      r(data.params);
    },
    onAttrSpread: r,
    onOpenTagEnd: r,
    onCloseTagStart: r,
    onCloseTagName: r,
    onCloseTagEnd: r,
  } satisfies ParserOptions as ParserOptions;
}

export function newSink(): BenchSink {
  return { src: "", sum: 0, errors: 0 };
}
