---
"htmljs-parser": patch
---

Fix `isValidAttrValue` (and `isValidStatement` / `isValidScriptlet`) reporting `enclosed` for a value that ends in a trailing `//` line comment (e.g. `"hello" // note`).

A line comment with no terminating newline consumes everything that would follow it on the line, so such a value is not safe to emit verbatim. It is now classified as `valid` (needs wrapping when placed inline), matching the existing behavior for an unguarded trailing newline. A comment guarded by a group (e.g. `("hello" // c\n)`) or a self-closing block comment (`"hello" /* c */`) still classifies as `enclosed`.
