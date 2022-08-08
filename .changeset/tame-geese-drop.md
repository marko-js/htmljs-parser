---
"htmljs-parser": patch
---

Switch from regexp based parsing for the expression continuations. This slightly improves performance and more importantly fixes usage of the parser in safari.
