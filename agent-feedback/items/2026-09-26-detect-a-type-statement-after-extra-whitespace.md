---
type: bug
impact: low
effort: low
site: src/states/TAG_NAME.ts › prepareStatement
---

# Detect a type statement after extra whitespace

`prepareStatement` looks for `declare `/`interface `/`type ` at exactly the position it is given, one character past the statement tag name, without skipping whitespace first. With two or more spaces (`static  type F = () => void`) the look-ahead misses, the alias is lexed as JavaScript, the line-final `void` reads as a prefix operator, and the next unindented statement is swallowed into it. Skip whitespace before the look-ahead and add a fixture.

Check: `node --input-type=module -e 'import{createParser,TagType}from"./src/index.ts";const p=createParser({onOpenTagName:r=>{const n=p.read(r);console.log("tag",n);return n==="static"?TagType.statement:TagType.html}});p.parse("static  type F = () => void\nstatic const x = 1")'` prints `tag static` once instead of twice.
