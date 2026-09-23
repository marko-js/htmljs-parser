---
"htmljs-parser": patch
---

Read an odd run of five or more backslashes before `${` or `$!{` as escapes, like a run of one or three: `\\\\\${x}` is now the text `\\${x}` rather than two backslashes and a placeholder.
