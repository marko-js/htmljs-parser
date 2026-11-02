---
"htmljs-parser": minor
---

Report code after an html comment that follows a concise `;` (eg `div; <!-- a --> span`) as an error, as after any other comment there, instead of reading it as a new line nested in the tag. More comments may still follow.
