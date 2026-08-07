---
"htmljs-parser": minor
---

In HTML mode, a whitespace-preceded `>=` in an unenclosed attribute value is now parsed as a comparison operator (eg `<if=count >= 10>`), and a whitespace-preceded `>` that looks like a split comparison (eg `<if=count > 10>`) now reports an error suggesting parentheses instead of silently ending the tag.
