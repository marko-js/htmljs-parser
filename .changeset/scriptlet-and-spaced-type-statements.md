---
"htmljs-parser": minor
---

Read a `type`, `interface` or `declare` scriptlet as a type, as statements already are, so `$ type H = () => void` or `$ type A = B<C>` no longer swallows the next line; `$ type = x` stays JavaScript. A statement also finds its type keyword after extra whitespace (`static  type F = () => void`), and `isValidScriptlet` matches the parser.
