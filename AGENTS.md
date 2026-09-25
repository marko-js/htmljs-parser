# htmljs-parser

An HTML parser recognizes content and string placeholders and allows JavaScript expressions as attribute values

## Conventions

When the parser misreports a structure, fix it here rather than working around it in prettier, the compiler, or language-tools. Changing which events existing input produces breaks every consumer: treat it as a breaking change.

## Agent feedback

Anything actionable but out of scope for the current task (suspected bug, cleanup, perf or size win, tooling friction, confusing code) must be filed in [`agent-feedback/`](agent-feedback/README.md) before finishing. Never drop it silently. Never fix it inside an unrelated diff.
