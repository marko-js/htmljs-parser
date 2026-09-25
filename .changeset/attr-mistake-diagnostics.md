---
"htmljs-parser": minor
---

Report common open tag mistakes with errors that name them:

- An attribute value that is only a comment, such as `<div class=/* todo */>`, now reports an `INVALID_ATTRIBUTE_VALUE` error naming the attribute, instead of parsing as a value with no expression.
- An attribute glued to the value before it, such as `<div class="a"id="b">`, now reports a `MALFORMED_OPEN_TAG` error asking for a space before `id`, instead of reading `"a"id="b"` as one value. A closed string, template literal, `)` or `]` followed by a name triggers it, except for keyword operators like `in` and `instanceof`.
- A closing tag inside a concise mode line, such as `hello</div>` or `Click here</a> to continue`, now reports an `EXTRA_CLOSING_TAG` error saying the line is a tag rather than text and to prefix text with `--`, instead of reading the closing tag as type arguments or type parameters. HTML mode is unchanged.
- A closing tag or an indented line given to the void tag just parsed, such as `<input>hi</input>` or text indented under a concise `input`, now says `The "input" tag does not support body content`, instead of an unexpected closing tag or extra indentation. This applies to any tag `onOpenTagName` returns `TagType.void` for, and a closing tag reports `EXTRA_CLOSING_TAG` even inside another tag, where it used to report `MISMATCHED_CLOSING_TAG`.
