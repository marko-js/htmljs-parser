---
type: bug
impact: high
effort: med
site: src/states/PARSED_TEXT_CONTENT.ts › PARSED_TEXT_CONTENT
---

# Add a text body mode that does not lex JavaScript, for prose and CSS bodies

`TagType.text` is the only text-only body mode, and `PARSED_TEXT_CONTENT.parse` lexes it as JavaScript: a quote enters `PARSED_STRING`, a backtick `TEMPLATE_STRING`, and `//` or `/*` enter `JS_COMMENT_LINE`/`JS_COMMENT_BLOCK`. That fits `<script>`, but the README's `onOpenTagName` example also returns `TagType.text` for `textarea` and `html-comment`, and marko does the same for `<title>`, `<textarea>` (compiler `marko-html.json` `parse-options.text`) and `<html-comment>`. So an apostrophe in prose (`<title>It's</title>`, `<textarea>Don't</textarea>`) fails with "EOF reached while parsing string expression", `<title>a /* b</title>` swallows the closing tag, and a `${x}` inside backticks stays literal text. `<style>` hits the `//` case: in `url(http://x) ${c}` the `//` opens a line comment, so the placeholder reaches the CSS as a literal `${c}`. Add an opt-in TagType where only placeholders and the matching closing tag are special (HTML's own RAWTEXT/RCDATA rule), keeping existing `TagType.text` events unchanged, and have marko's `packages/compiler/src/babel-plugin/parser.js › onOpenTagName` select it for every `parseOptions.text` tag except `<script>`/`<html-script>`. That mode also settles the `<style>` cases of "Treat a backslash-escaped quote as text in parsed-text bodies and parsed strings", whose `PARSED_STRING` fix `<script>` still needs.

Check: `node --input-type=module -e 'import{createParser,TagType}from"./src/index.ts";const p=createParser({onError:e=>console.log("ERR",e.message),onText:r=>console.log("text",JSON.stringify(p.read(r))),onPlaceholder:r=>console.log("placeholder",JSON.stringify(p.read(r.value))),onOpenTagName:()=>TagType.text});p.parse(process.argv[1])' "<title>It's</title>"` prints `ERR EOF reached while parsing string expression`; the same command with `'<style>.a { background: url(http://x) ${c} }</style>'` prints a single `text` range containing `${c}` and no `placeholder`. In marko, `pnpm run compile -- -o html -d` on a template containing `<title>It's</title>` fails with the same error.
