---
type: bug
impact: med
effort: med
site: src/states/PARSED_TEXT_CONTENT.ts › PARSED_TEXT_CONTENT
---

# Lex regular expression literals in `<script>` bodies

`PARSED_TEXT_CONTENT` lexes a `TagType.text` body as JavaScript strings, templates and comments, but checks a `/` only for `//` and `/*`: it never enters `STATE.REGULAR_EXPRESSION` the way `EXPRESSION` does. A quote inside a regex literal therefore opens a string, so `<script>s.replace(/["']/g, "")</script>` runs to the end of the file with "EOF reached while parsing string expression". (An escaped quote or slash has its own item, "Treat a backslash-escaped quote as text in parsed-text bodies and parsed strings".) Regex lexing cannot simply be added, because the same body mode serves `<style>`, where `url(/favicon.ico)` would read as an unterminated regex. Once `<style>` and the other prose bodies move to a mode that does not lex JavaScript (see "Add a text body mode that does not lex JavaScript"), enter `REGULAR_EXPRESSION` here when the previous significant character cannot end an operand, as `EXPRESSION` does with `canFollowDivision`, and add a fixture.

Check: `node --input-type=module -e 'import{createParser,TagType}from"./src/index.ts";const p=createParser({onError:e=>console.log("ERR",e.message),onOpenTagName:()=>TagType.text});p.parse("<script>s.replace(/[\"\x27]/g, \"\")</script>")'` prints `ERR EOF reached while parsing string expression`.
