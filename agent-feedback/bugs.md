# Suspected Bugs

Out-of-scope defects noticed while working on something else. Format and rules: [README.md](README.md).

## Unterminated `${` in concise line position is dropped with no event and no error

`src/states/CONCISE_HTML_CONTENT.ts` | 2026-07-23 | impact:high | effort:med

Parsing `"<div>keep</div>\n${unterminated\n"` emits events only for the `div` tag: the whole second
line produces no event and no `onError`, so the text is invisible to every consumer. A terminated
`${x}` in the same position does emit (`onOpenTagName` for the concise tag), and the equivalent
HTML-mode input does report `EOF reached while parsing placeholder`, so this is specific to an
unterminated placeholder reaching EOF while in concise mode. Any consumer that rebuilds source
from the event stream silently deletes the line — `prettier-plugin-marko` did exactly that before
it started throwing on `onError`, and it still loses this input because no error is reported.
The state should call `emitError` (e.g. `MALFORMED_PLACEHOLDER`) when it hits EOF mid-placeholder.
Re-verify: `createParser({ onError: console.log, onText: console.log, onOpenTagName: console.log })
.parse("<div>keep</div>\n${unterminated\n")` — nothing fires for line 2.
