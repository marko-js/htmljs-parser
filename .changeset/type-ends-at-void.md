---
"htmljs-parser": patch
---

End a type at a line-final `void`. A type statement such as `export type H = () => void` carried on into the next line, and a `void` return type before `{` (`function foo(): void {`) read the body as a type; `void` inside a type is now always the `void` type rather than a prefix operator.
