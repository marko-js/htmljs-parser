---
"htmljs-parser": patch
---

Improves consistency with v2 of the parser by allowing expressions to span multiple lines if the line is ended with the continuation. This change also allows html attributes and grouped concise attributes to span multiple lines with a new line before _or after_ the continuation.
