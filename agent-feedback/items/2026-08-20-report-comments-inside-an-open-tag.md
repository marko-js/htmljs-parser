---
type: bug
impact: med
effort: low
site: src/states/OPEN_TAG.ts › OPEN_TAG
---

# Report the JavaScript comments that sit between attributes in an open tag

`OPEN_TAG.parse` enters `STATE.JS_COMMENT_LINE`/`STATE.JS_COMMENT_BLOCK` for a `//` or `/*` inside an open tag, but `OPEN_TAG.return` bails on every child that is not `STATE.EXPRESSION`, so the comment is consumed and `onComment` never fires. A comment trailing an attribute value survives because `EXPRESSION` folds it into the value range, which is what `src/__tests__/fixtures/comments-within-open-tag` records; a comment that stands on its own is unreportable, so `<div /* c */ class="box">x</div>` and the `// why` line of a multi-line attribute list emit attribute events only, with no error. Consumers cannot round-trip either one — prettier-plugin-marko drops both from its output — while `OPEN_TAG.parse`'s own `INVALID_HTML_COMMENT` text tells authors to "Use a JavaScript comment (// or /\* \*/) instead", pointing them at the form that disappears. `HTML_CONTENT.return` already emits both shapes with the delimiters stripped from `value`, so the fix is that switch in `OPEN_TAG.return`, with `comments-within-open-tag` and `open-tag-comments-concise` as the snapshots that move.

Check: `node --input-type=module -e 'import{createParser}from"./src/index.ts";const p=createParser({onComment:r=>console.log("comment",JSON.stringify(p.read(r))),onAttrName:r=>console.log("attrName",JSON.stringify(p.read(r)))});p.parse("<div /* c */ class=\"box\">x</div>")'` prints only `attrName "class"` today; expect a `comment "/* c */"` line before it.
