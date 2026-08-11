---
"htmljs-parser": minor
---

Support an `async` keyword before shorthand methods, eg `<button async onClick() {}>` and the default attribute form `<foo async (event) {}>`. `onAttrMethod` reports these with `async: true` and a range starting at the keyword. A shorthand method can no longer be named `async`, but an `async` that is not followed by a shorthand method is still an ordinary attribute, so `<script async src="x">` is unchanged.
