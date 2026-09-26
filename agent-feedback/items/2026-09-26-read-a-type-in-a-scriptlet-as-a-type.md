---
type: bug
impact: low
effort: low
site: src/states/INLINE_SCRIPT.ts › INLINE_SCRIPT
---

# Read a `type`/`interface`/`declare` scriptlet as a type

The non-block branch of `INLINE_SCRIPT.parse` sets up its `STATE.EXPRESSION` without the `declare `/`interface `/`type ` look-ahead that `prepareStatement` in `src/states/TAG_NAME.ts` runs for statements, so a type in a scriptlet is lexed as JavaScript. A line-final `void` or `>` then reads as an operator waiting for an operand, and the scriptlet swallows the next line: `$ type H = () => void` or `$ type A = B<C>` followed by `<div/>` gives one scriptlet, and inside `<div>` it runs past `</div>` to a missing-end-tag error. `prepareScriptlet` in `src/util/validators.ts` mirrors the same gap. Share the type look-ahead from `prepareStatement` with both (scriptlets do not set `consumeIndentedContent`), and add a fixture per input.

Check: `node --input-type=module -e 'import{createParser}from"./src/index.ts";const p=createParser({onScriptlet:r=>console.log("scriptlet",JSON.stringify(p.read(r.value)))});p.parse("$ type H = () => void\n<div/>")'` prints `scriptlet "type H = () => void\n<div/>"` instead of ending the scriptlet at the newline and opening a `div`.
