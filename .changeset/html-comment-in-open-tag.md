---
"htmljs-parser": minor
---

An `<!--` inside an open tag now reports a targeted `INVALID_HTML_COMMENT` error pointing at the comment, instead of being read as tag type arguments, as attribute type parameters, or (after a whitespace-terminated attribute value) consumed as a less-than operator. Like `</`, a `<!--` no longer continues an unenclosed attribute value, so `<div class="a" <!-- note --> id="b">` reports the comment rather than silently parsing as `class=("a" < !--note)` plus two junk attributes.
