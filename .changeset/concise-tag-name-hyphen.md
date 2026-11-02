---
"htmljs-parser": minor
---

Read a concise line starting with `-` and a word character (eg `-if`) as a tag whose name starts with `-`, as `<-if>` already is in HTML mode. A single `-` followed by anything else is still an error, and so is any single `-` within a tag that only allows text.
