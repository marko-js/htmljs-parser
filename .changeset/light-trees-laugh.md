---
"htmljs-parser": patch
---

When parsing unenclosed expressions we look backwards for unary operators preceded by a word break. This caused a false positive when a member expression was found with the operator name, eg `input.new`. Now we ensure that these operators are not in a member expression like this.
