---
"htmljs-parser": major
---

Rename `onTagName` to `onOpenTagName`.
Add a new `onOpenTagStart` event (before `onOpenTagName`).
Split the `onCloseTag` event into three new events: `onClosetTagStart`, `onCloseTagName` & `onCloseTagEnd`).
