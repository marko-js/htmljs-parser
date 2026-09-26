---
"htmljs-parser": patch
---

Treat a trailing TypeScript non-null assertion directly after an operand (`x!`, `f()!`, `a[0]!`) as postfix, so it ends an unenclosed attribute, tag variable or statement value. `<div title=x! id="a"/>` now reports two attributes rather than one value `x! id="a"`, and `<div title=x!/>` no longer fails as an unterminated regular expression.
