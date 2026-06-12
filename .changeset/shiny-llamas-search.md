---
"htmljs-parser": minor
---

Replace TypeScript enums with erasable const modules so the source runs directly under node's type stripping. The public `TagType`, `ErrorCode`, and `Validity` values keep their runtime shape and values, and their types are now the equivalent literal unions. Constant values remain fully inlined in the published bundles.
