---
"htmljs-parser": minor
---

Report an unfinished construct at EOF in concise mode, as html mode does: unclosed tag or attribute arguments, parameters, type arguments, a method body, a `$ { … }` scriptlet or a `${…}` in a tag name were accepted silently, with a range claiming a closer past the end of the input. EOF errors now name what was being parsed (eg "attribute arguments", "tag parameters"), and the value of an `<!--->` comment is an empty range rather than an inverted one.
