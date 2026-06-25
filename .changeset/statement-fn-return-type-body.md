---
"htmljs-parser": patch
---

Fix a spurious "Mismatched group" error when a `>` (or other comparison) appears in the body of a statement function that declares a return type, e.g.:

```marko
export function a(): b {
  return c > d;
}
```

Previously the type-parsing state from the return type annotation leaked into the function body, so a `>` was treated as a closing generic bracket. A `{` that follows a completed type now correctly ends the annotation and parses the block as a value.
