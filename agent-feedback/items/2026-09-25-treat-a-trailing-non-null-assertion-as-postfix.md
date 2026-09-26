---
type: bug
impact: low
effort: low
site: src/states/EXPRESSION.ts › lookBehindForOperator
---

# Treat a trailing TypeScript `!` as postfix when it ends an unenclosed value

`lookBehindForOperator` returns a continuation for any trailing `!` (`case CODE.EXCLAMATION`), so a non-null assertion that ends an unenclosed attribute or tag-variable value waits for an operand and swallows whatever follows. In marko, `<const/z=input.x!>` fails with 'Unexpected token, expected "</>/<=/>="' on the next line, `<div title=input.x!/>` with "EOL reached while parsing regular expression" (EOF when it ends the file), and `<div title=input.x! id="a"/>` with "Expected a single expression, but found `i` after it"; every error points away from the `!`, and wrapping the value in parens is the only workaround. When the character before `!` ends an operand (an identifier char, `)`, `]`), the `!` is postfix and must not continue the expression; add fixtures for the three shapes.

Check: `node --input-type=module -e 'import{createParser}from"./src/index.ts";const p=createParser({onError:e=>console.log("ERR",e.message),onAttrValue:r=>console.log("value",JSON.stringify(p.read(r.value)))});p.parse("<div title=x! id=\"a\"/>")'` prints `value "x! id=\"a\""`, one value spanning both attributes; `p.parse("<div title=x!/>")` prints `ERR EOF reached while parsing regular expression`.
