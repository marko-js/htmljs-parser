---
type: cleanup
impact: low
effort: low
site: package.json › exports
---

# Expose `./package.json` from the exports map

The exports map lists only `.`, so `require("htmljs-parser/package.json")` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`, and `src/index.ts` exports no `version` either, leaving any tool that reports which parser build it is running on to read the file by hand. The hand-rolled workaround is ambiguous: `grep -o '"version": *"[^"]*"' package.json` matches both the field and the `version` npm script. `@marko/runtime-tags` already maps `"./package.json": "./package.json"`, so the parser every Marko tool depends on is the one package in the chain that cannot report its own version.

Check: `node -e "require('htmljs-parser/package.json')"` from a project with htmljs-parser installed prints `Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './package.json' is not defined by "exports"`; it should resolve to the file.
