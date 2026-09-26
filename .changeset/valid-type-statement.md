---
"htmljs-parser": patch
---

`isValidStatement` now reads a statement starting with `type `, `interface ` or `declare ` as a type, as the parser does, so a multi-line type argument list is `enclosed` and a type followed by an unindented line is `invalid`.
