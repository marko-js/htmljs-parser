---
"htmljs-parser": patch
---

Refactor parser to allow individual states to process multiple characters. This allows for eager scanning, simplifies things some, and improves performance by about 30% in realworld tempaltes.
