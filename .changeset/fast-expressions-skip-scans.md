---
"htmljs-parser": patch
---

Speed up expression parsing by skipping work that provably cannot match. The
per-character `shouldTerminate` check is skipped for identifier/number
characters (no terminator ever matches one), and the unary/binary operator
keyword scans bail out immediately when the surrounding character cannot start
or end a keyword. This improves steady-state parsing throughput by ~2.5% with no
behavior change.
