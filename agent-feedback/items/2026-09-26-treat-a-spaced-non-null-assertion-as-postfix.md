---
type: bug
impact: low
effort: low
site: src/states/EXPRESSION.ts › lookBehindForOperator
---

# Treat a spaced or `}`-trailing TypeScript `!` as postfix when it ends an unenclosed value

`lookBehindForOperator` reads a trailing `!` (or run of `!`) as postfix only when the character directly before it ends an operand: a word that is not a keyword operator, `)`, `]`, a closing quote or a backtick. A non-null assertion after whitespace (`x !`, which TypeScript accepts) or after an object literal (`{a:1}!`) is still read as a prefix operator waiting for an operand, so an unenclosed attribute, tag-variable or statement value ending in one swallows what follows (`<div a=x ! b/>` gives the one value `x ! b`). Both shapes are rare (prettier prints `x!`), so decide whether they are worth the extra look-behind; if so, walk back over whitespace before testing for an operand. A `}` needs care, since in a statement it can also close a block that a prefix `!` follows. Add a fixture per shape.

Check: `node --input-type=module -e 'import{createParser}from"./src/index.ts";const p=createParser({onAttrValue:r=>console.log("value",JSON.stringify(p.read(r.value)))});p.parse("<div a=x ! b/>")'` prints `value "x ! b"`.
