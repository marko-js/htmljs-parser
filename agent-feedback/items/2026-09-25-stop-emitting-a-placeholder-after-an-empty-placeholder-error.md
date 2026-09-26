---
type: bug
impact: low
effort: low
site: src/states/PLACEHOLDER.ts › PLACEHOLDER
---

# Stop emitting a placeholder after the empty-placeholder error

`PLACEHOLDER.return` calls `emitError` for an empty expression, which sets `pos` past EOF, and then still runs `this.pos++; this.exitState()`, so `exit` emits `onPlaceholder` after `onError` with an `end` beyond the input. The compiler hides this because its `onError` throws, but a consumer that records errors and keeps going gets an event after the error with an out-of-range end; `packages/language-tools/src/parser.ts` in marko-js/language-server registers `onPlaceholder` and no `onError`. Return right after `emitError`, as the other states do, and pin it with a fixture.

Check: `node --input-type=module -e 'import{createParser}from"./src/index.ts";const p=createParser({onError:e=>console.log("ERR",JSON.stringify(e)),onPlaceholder:r=>console.log("placeholder",JSON.stringify(r))});p.parse("<div>${}</div>")'` prints `ERR {"start":7,"end":7,"code":20,...}` and then `placeholder {"start":5,"end":16,...}` for a 14-character input.
