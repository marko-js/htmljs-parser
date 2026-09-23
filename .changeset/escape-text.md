---
"htmljs-parser": minor
---

Export `escapeText`, which escapes text content so the parser reads it back as the same text, for tools that print Marko source. Only a backslash run before `${` or `$!{` is changed; pass the content printed after the text as the second argument so that a backslash run ending the text does not escape a placeholder it leads into.
