---
"htmljs-parser": patch
---

A scriptlet's range now starts at its `$` at the root and in concise content, as it already did in an HTML body, so `onScriptlet` reports `$ var a = 1;` rather than ` var a = 1;` there. Its `value` range is unchanged.
