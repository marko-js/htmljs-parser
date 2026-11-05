---
type: dx
impact: med
effort: low
site: src/states/ATTRIBUTE.ts › ATTRIBUTE.return
---

# Name the attribute mistake behind a comment-only or glued attribute value

When an attribute value ends, `ATTRIBUTE.return` reports only an empty value (`Missing value for attribute`) and otherwise hands the range to `onAttrValue` as is, so three ordinary attribute mistakes reach Marko's Babel parse as one whole value and come back as generic expression errors that never mention attributes. `<div class=/* todo */></div>` passes the value `/* todo */` (Marko reports "Expected an expression, but found only whitespace or comments."); `<const/x=/* pre */ 1/>` ends the value at the whitespace after the comment, so `1` becomes the next attribute's name; and `<div class="a"id="b"/>` passes `"a"id="b"` as one value (Marko reports "Expected a single expression, but found `i` after it."), where the fix is a space before `id`. The parser knows when a value ends that it holds only comments, or that a string ran into the next attribute's name, so it should report these through `emitError`, and continue a value past its leading comments so `x=/* pre */ 1` reads `1`. Once released, bump `htmljs-parser` in marko's `@marko/compiler` and regenerate marko's `error-attr-value-only-comment` and `error-attr-value-missing-whitespace` fixtures, which pin the generic wording until then.

Check: `node --input-type=module -e 'import{createParser}from"./src/index.ts";const p=createParser({onError:e=>console.log("ERR",e.message),onAttrName:r=>console.log("name",JSON.stringify(p.read(r))),onAttrValue:r=>console.log("value",JSON.stringify(p.read(r.value)))});p.parse(process.argv[1])' '<div class=/* todo */></div>'` prints the value `"/* todo */"` and no error; the same with `'<const/x=/* pre */ 1/>'` prints the value `"/* pre */"` then an attribute named `"1"`, and with `'<div class="a"id="b"/>'` the single value `"\"a\"id=\"b\""`.
