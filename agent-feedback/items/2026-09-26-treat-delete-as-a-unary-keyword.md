---
type: bug
impact: low
effort: low
site: src/states/EXPRESSION.ts › unaryKeywords
---

# Treat `delete` as a unary keyword

`unaryKeywords` lists `typeof`, `await`, `new` and (outside types) `void`, but not `delete`, so the whitespace after `delete` ends an unenclosed attribute value: `<div a=delete obj.x b/>` gives the value `delete` plus attributes `obj.x` and `b`. The same list decides that a `!` right after the keyword is the prefix operator rather than a non-null assertion, so `delete!x` is also affected. Add `delete` to `unaryKeywords` and a fixture.

Check: `node --input-type=module -e 'import{createParser}from"./src/index.ts";const p=createParser({onAttrValue:r=>console.log("value",JSON.stringify(p.read(r.value)))});p.parse("<div a=delete obj.x b/>")'` prints `value "delete"` instead of `value "delete obj.x"`.
