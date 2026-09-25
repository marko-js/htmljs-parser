---
"htmljs-parser": minor
---

Whitespace after the comments that lead an attribute value no longer ends the value, so `x=/* @__PURE__ */ fn()` and `<const/x=/* pre */ 1>` keep the whole expression with its comments, instead of a comment-only value followed by stray attributes. This applies to `=`, `:=` and `...` values. A concise mode `x=// c` still ends at the newline, a value that is only comments still ends at `>`, `/>` or a concise end of line, and `isValidAttrValue` now accepts these values too.
