---
type: bug
impact: med
effort: low
site: src/states/PARSED_TEXT_CONTENT.ts › PARSED_TEXT_CONTENT
---

# Treat a backslash-escaped quote as text in parsed-text bodies and parsed strings

A `TagType.text` body (`<style>`, `<script>`) is lexed as JavaScript strings, templates and comments, and a backslash counts only when `STATE.checkForPlaceholder` finds an escaped `${`. Otherwise it falls through as text and the character after it still switches state; `src/states/PARSED_STRING.ts` › `PARSED_STRING` has the mirror hole, where the quote of `\"` closes the string. So `<style>.a\" {}` and `content: 'it\'s'` run to the end of the file with "EOF reached while parsing string expression", as does a `<script>` regex with an escaped quote (`s.replace(/\"/g, "&quot;")`). A `<script>` regex with `\//` (`/^https?:\/\//`) opens a line comment instead, which silently drops every placeholder after it on that line. Fix both states: inside a parsed string a backslash escapes the next character; in the body it escapes a quote, backtick, slash or backslash, but not `<` or a newline, so `\</style>` still closes the tag and delimited blocks still end at the line. `src/scanner.c` › `scan_frame_content` in marko-js/tree-sitter mirrors both paths and needs the same change. The unescaped quote in `/["']/` is a separate gap: see "Lex regular expression literals in `<script>` bodies".

Check: `node --input-type=module -e 'import{createParser,TagType}from"./src/index.ts";const p=createParser({onError:e=>console.log("ERR",e.message),onPlaceholder:r=>console.log("placeholder",p.read(r.value)),onOpenTagName:()=>TagType.text});p.parse(process.argv[1])' '<script>if (/^https?:\/\//.test(u)) go(${x})</script>'` prints nothing (no `placeholder x`); with `'<style>.a\" {}</style>'` it prints `ERR EOF reached while parsing string expression`.
