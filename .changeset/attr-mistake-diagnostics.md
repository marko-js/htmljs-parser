---
"htmljs-parser": minor
---

Report common open tag mistakes with errors that name them:

- An attribute value that is only a comment, such as `<div class=/* todo */>`, now reports an `INVALID_ATTRIBUTE_VALUE` error naming the attribute, instead of parsing as a value with no expression.
