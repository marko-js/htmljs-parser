---
"htmljs-parser": patch
---

Fixes an regression where string literals inside of parsed text nodes (eg `<script>`) were not properly changing the parser state. This caused issues when comment like syntax was embedded within these string literals"
