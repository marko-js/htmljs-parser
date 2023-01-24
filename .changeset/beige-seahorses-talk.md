---
"htmljs-parser": patch
---

Fixes an issue where attribute names that started with a keyword (eg: `as-thing` or `instanceof-thing`) were incorrectly treated as an expression continuation.
