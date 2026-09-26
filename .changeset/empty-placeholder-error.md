---
"htmljs-parser": patch
---

An empty placeholder (`${}`) now stops at its error instead of also emitting an `onPlaceholder` whose end is past the input.
