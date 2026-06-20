---
"htmljs-parser": patch
---

Speed up expression parsing by skipping work that provably cannot match. An
identifier/number character is never whitespace, never a terminator (no
`shouldTerminate` implementation matches a word character), and is not handled
by the expression switch, so it now takes a fast path that just advances the
position. The unary/binary operator keyword scans also bail out immediately when
the surrounding character cannot start or end a keyword. This improves
steady-state parsing throughput with no behavior change.
