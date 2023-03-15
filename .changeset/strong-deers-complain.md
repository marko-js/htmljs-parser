---
"htmljs-parser": patch
---

Fixes a regression where the parsed text state (used by eg `script`, `style`) was not properly entering back into text for the closing quote on the string.
