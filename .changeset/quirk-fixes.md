---
"htmljs-parser": minor
---

Fix several misparses:

- An html comment ends at the first `-->`, so `<!-- a->b -->` is one comment.
- A `/` after a keyword that an operand follows (`return`, `typeof`, `in`, …) starts a regular expression, and `return !x` reads `!` as a prefix.
- A text body treats a backslash-escaped quote, backtick or slash as text and skips regular expression literals (unless one would hide a placeholder or the closing tag), and a parsed string treats any escaped character as text.
- A spaced TypeScript non-null `!` ends an unenclosed value (`<div a=x ! b>`).
- An html mode attribute name cut off by EOF is still reported (`<div foo`).
- An attribute value continues past leading comments (`x=/* note */ 1`).
