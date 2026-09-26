---
type: bug
impact: med
effort: low
site: src/states/EXPRESSION.ts › tsUnaryKeywords
---

# End a type at a line-final `void` instead of continuing onto the next line

`tsUnaryKeywords` spreads `unaryKeywords`, which includes `void`, so inside a type (`inType`, and `forceType` for statements `TAG_NAME.exit` opens with `type `/`interface `/`declare `) `lookBehindForOperator` reads a line-final `void` return type as a prefix operator and carries the expression onto the next line. A `void` that ends a type is always the `void` type, never an operator. In marko, `export type H = (v: string) => void` followed by `<div/>` fails with "Unexpected token, expected ','", and `static type F = () => void` followed by `static const x = 1` fails with "Unexpected reserved word 'static'". Keep `void` out of the in-type keyword list (it stays in `unaryKeywords` for JS), and add a fixture for each case.

Check: `node --input-type=module -e 'import{createParser,TagType}from"./src/index.ts";const p=createParser({onError:e=>console.log("ERR",e.message),onOpenTagName:r=>{const n=p.read(r);console.log("tag",n);return n==="export"?TagType.statement:TagType.html}});p.parse("export type H = () => void\n<div/>")'` prints only `tag export`; with `=> string` in place of `=> void` it also prints `tag div`.
