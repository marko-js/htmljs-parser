---
"htmljs-parser": minor
---

A keyword operator directly after a spread's `...` is an operator, so `<div ...new Attrs()/>` is one spread rather than `...new` plus an attribute `Attrs()`. A run of non-null assertions (`x!!`) and one after a string or template literal (`"s"!`, `` `s`! ``) now ends an unenclosed value like `x!` does.
