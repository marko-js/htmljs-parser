---
"htmljs-parser": minor
---

Report common open tag mistakes with errors that name them:

- An attribute value that is only a comment, such as `<div class=/* todo */>`, now reports an `INVALID_ATTRIBUTE_VALUE` error naming the attribute, instead of parsing as a value with no expression.
- An attribute glued to the value before it, such as `<div class="a"id="b">`, now reports a `MALFORMED_OPEN_TAG` error asking for a space before `id`, instead of reading `"a"id="b"` as one value. A closed string, template literal, `)` or `]` followed by a name triggers it, except for keyword operators like `in` and `instanceof`.
