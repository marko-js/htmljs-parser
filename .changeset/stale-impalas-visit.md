---
"htmljs-parser": patch
---

Fix regression where the parser would continue unary keyword expressions even if the keyword was inside a word boundary. Eg `<div class=thing_new x>` would cause the parser to see the expression as `thing_` and `new x`.
