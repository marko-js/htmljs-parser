---
type: bug
impact: med
effort: low
site: src/states/PARSED_TEXT_CONTENT.ts › PARSED_TEXT_CONTENT
---

# Treat a backslash-escaped quote as text in parsed-text bodies and parsed strings

Inside a `TagType.text` body the only backslash handling is `STATE.checkForPlaceholder`, which declines unless the run of backslashes leads to `${`, so a `\` falls through to the eager text run and the `"`/`'` after it still enters `STATE.PARSED_STRING`. `src/states/PARSED_STRING.ts` › `PARSED_STRING` has the mirror hole, where the quote of `\"` matches `str.quoteCharCode` and closes the string. An odd number of escaped quotes therefore runs to EOF and emits `INVALID_TEMPLATE_STRING` "EOF reached while parsing string expression"; marko maps `<style>`/`<script>` to `TagType.text`, so it surfaces as a code frame on the line after the tag. Escaped quotes are legal in CSS selectors and `content:` strings, so `<style>.a\" { color: red }</style>` and `content: 'it\'s'` are both unparseable today. The defect is quote-specific rather than backslash-general: `\2014` parses fine, and `src/__tests__/fixtures/parsed-text-style-tag` passes only because its escaped quotes come in pairs. Fix symmetrically in the two files: when `checkForPlaceholder` declines a `CODE.BACK_SLASH` and the next char is a quote (the active `quoteCharCode` in `PARSED_STRING`), consume both chars as text instead of letting the quote change state. Lock it in with a new `src/__tests__/fixtures/` dir plus `pnpm test:update`.

Check: `node --input-type=module -e 'import{createParser,TagType}from"./src/index.ts";const p=createParser({onError:e=>console.log("ERR",e.message),onText:r=>console.log("text",JSON.stringify(p.read(r))),onOpenTagName:()=>TagType.text});p.parse("<style>.a\\\" { color: red }</style>")'` prints `ERR EOF reached while parsing string expression` today and should print a single `text` range.
