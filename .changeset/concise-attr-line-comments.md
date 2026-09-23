---
"htmljs-parser": patch
---

Report the comments on the lines before a comma-continued concise attr line through `onOpenTagComment`. They were skipped without an event, so consumers dropped them.
