---
type: bug
impact: med
effort: med
site: src/states/EXPRESSION.ts › EXPRESSION
---

# Emit the trailing attribute name when EOF ends an HTML mode open tag

An attribute name is only emitted from `ATTRIBUTE.return`, which requires its `STATE.EXPRESSION` child to terminate, so in HTML mode a name that runs into EOF is never reported: `<div foo` emits only the `MALFORMED_OPEN_TAG` error, while `<div foo bar` emits `attrName "foo"` and drops `bar`. Concise mode is already correct, since the EOF branch of `EXPRESSION.parse` calls `exitState()` when `this.isConcise`, so this is the HTML-only half of that branch where the `!attr.spread && !attr.name` case returns `emitError` instead. It matters because that is the state a document is in while an attribute is being typed, leaving `packages/language-tools` in marko-js/language-server with no name range to anchor completions or hover to.

Replacing that `emitError` with `this.exitState()` (letting `ATTRIBUTE.parse`'s own EOF branch report) does fix it, but wants its own PR because it changes two fixtures a maintainer should sign off on. `src/__tests__/fixtures/eof-attr-name` (`<a><b selected`) gains `attrName "selected"` and its error text sharpens to name the attribute, an improvement. But `src/__tests__/fixtures/attr-eof-default-value` (`<div =foo`) also changes: it starts emitting `attrValue "=foo"` and its error coarsens to "EOF reached while parsing open tag", so the fix reaches value parsing and loses a specific diagnostic, not just names.

Check: `node --input-type=module -e 'import{createParser}from"./src/index.ts";const p=createParser({onAttrName:r=>console.log("name",JSON.stringify(p.read(r))),onError:e=>console.log("ERR",e.message)});p.parse("<div foo")'` prints only `ERR` today and should also print `name "foo"`.
