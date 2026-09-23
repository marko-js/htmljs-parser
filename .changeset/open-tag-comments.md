---
"htmljs-parser": minor
---

Add an `onOpenTagComment` handler for a JavaScript comment that stands alone in an open tag, eg `<div /* c */ class="box">` or a `// why` line between attributes, which the parser used to consume without an event. A comment that follows a value is still part of that value. It is a separate handler from `onComment`, so a consumer only sees these comments once it handles them.
