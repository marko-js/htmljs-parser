# htmljs-parser

An HTML parser recognizes content and string placeholders and allows JavaScript expressions as attribute values

## Conventions

When the parser misreports a structure, fix it here rather than working around it in prettier, the compiler, or language-tools. Changing the events for input that already parses and compiles correctly breaks every consumer: treat it as a breaking change. Fixing a misparse (input that errored, or compiled to the wrong code) is a feature, not a breaking change: release it as a minor, and raise the htmljs-parser floor in the compiler and prettier-plugin-marko together, since both decide what is valid with this parser.

## Agent feedback

Anything actionable but out of scope for the current task (suspected bug, cleanup, perf or size win, tooling friction, confusing code) must be filed in [`agent-feedback/`](agent-feedback/README.md) before finishing. Never drop it silently. Never fix it inside an unrelated diff.
