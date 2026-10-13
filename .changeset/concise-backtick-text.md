---
"htmljs-parser": minor
---

Add backtick text to concise mode. A run of backticks after a tag's attributes (or at the start of a line) begins text just like `--`, either on one line or as an indented block closed by a line of the same backticks. The text is exactly what follows the opening backticks, so leading and trailing whitespace is kept, and a closing run of the same length is optional on a single line and may be followed by a comment. A backtick after whitespace where an attribute could start was previously read as an attribute named by the template literal; it is now text.

`onText` and `onPlaceholder` ranges now have a `delimiter`: the range of the `--` or backtick run that began the concise text block, or `undefined` outside of one.

A concise line that ends its open tag before any tag name, such as a line that starts with a semicolon, is now reported as a parse error instead of emitting an open tag end with no tag name.
