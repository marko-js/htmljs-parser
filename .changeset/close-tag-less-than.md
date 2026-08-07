---
"htmljs-parser": patch
---

In HTML mode, a "</" after a whitespace-terminated unenclosed attribute value is now treated as a close tag instead of being consumed as a less-than operator, and a close tag found before the open tag is closed reports a targeted error suggesting parentheses.
