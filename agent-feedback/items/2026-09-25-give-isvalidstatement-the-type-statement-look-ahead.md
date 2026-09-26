---
type: bug
impact: low
effort: low
site: src/util/validators.ts › prepareStatement
---

# Give `isValidStatement` the type-statement look-ahead the parser uses

`prepareStatement` copies part of `TAG_NAME.exit`'s statement setup (`operators`, `terminatedByEOL`, `consumeIndentedContent`) but not its `declare `/`interface `/`type ` look-ahead that sets `inType`/`forceType`, so the validator lexes a type alias as JavaScript while the parser lexes it as a type. It disagrees both ways: `isValidStatement("type A = Record<\n  string,\n  number\n>")` returns `invalid` although the parser reads `static type A = Record<` plus those lines as one statement, and `isValidStatement("type A = B<C>\nfoo")` returns `valid` although the parser ends the statement at the newline and opens a `foo` tag. prettier-plugin-marko trusts only `enclosed`, so a long `static type` alias it breaks across lines is wrapped in a needless `static { … }` block. Share `TAG_NAME.exit`'s type look-ahead with `prepareStatement` and add both inputs to `src/__tests__/validate.test.ts`.

Check: `node --input-type=module -e 'import{isValidStatement}from"./src/index.ts";console.log(isValidStatement("type A = Record<\n  string,\n  number\n>"), isValidStatement("type A = B<C>\nfoo"))'` prints `0 1`; the parser treats the first as one statement (`enclosed`, 2) and splits the second (`invalid`, 0).
