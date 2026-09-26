---
type: bug
impact: low
effort: low
site: src/states/EXPRESSION.ts › lookBehindForOperator
---

# Treat a spaced, repeated or literal-trailing TypeScript `!` as postfix when it ends an unenclosed value

`lookBehindForOperator` reads a trailing `!` as postfix only when the character directly before it is an identifier char (other than a keyword operator), `)` or `]`. A non-null assertion after whitespace (`x !`, which TypeScript accepts), a repeated one (`x!!`), or one after a string, template or object literal (`"s"!`, `` `s`! ``, `{a:1}!`) is still read as a prefix operator waiting for an operand, so an unenclosed attribute, tag-variable or statement value ending in one swallows what follows (`<div a="s"! b/>` gives the one value `"s"! b`), and every error points away from the `!`. These shapes are rare (prettier prints `x!`, and typescript-eslint flags `x!!`), so decide whether they are worth the extra look-behind; if so, walk back over whitespace and prior postfix `!`s and accept a closing quote or backtick before testing for an operand. A `}` needs care, since in a statement it can also close a block that a prefix `!` follows. Add a fixture per shape.

Check: `node --input-type=module -e 'import{createParser}from"./src/index.ts";const p=createParser({onError:e=>console.log("ERR",e.message)});p.parse("<div title=x!!/>");p.parse("<div title=x !/>");p.parse("<div title=\"s\"!/>")'` prints `ERR EOF reached while parsing regular expression` three times.
