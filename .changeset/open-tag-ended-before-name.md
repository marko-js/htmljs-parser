---
"htmljs-parser": minor
---

Name an open tag that ends before its name (eg a concise line of just `,`, or `<,>`) empty, so a tag never ends without `onOpenTagName`; the compiler and editor tooling crashed on these, and `<,>` crashed the parser at the end of the template.
