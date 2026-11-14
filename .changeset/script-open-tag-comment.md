---
"htmljs-parser": patch
---

Fix a crash on a `//` comment holding a text tag's closing tag in its open tag (`<script// a</script>`).
