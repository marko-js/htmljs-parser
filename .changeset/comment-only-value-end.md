---
"htmljs-parser": patch
---

An attribute value holding only a comment ends at the comment, like any other value, rather than taking in the whitespace before the `>` that ends the tag (`<div a=/* c */ >` gave the value `"/* c */ "`).
