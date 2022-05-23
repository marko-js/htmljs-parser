# htmljs-parser

## 3.3.5

### Patch Changes

- [#108](https://github.com/marko-js/htmljs-parser/pull/108) [`8a988f4`](https://github.com/marko-js/htmljs-parser/commit/8a988f48e976f7ad68494a059973176ecfd43462) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fix issue where parser would sometimes not consume enough characters and cause a bracket mismatch

## 3.3.4

### Patch Changes

- [#103](https://github.com/marko-js/htmljs-parser/pull/103) [`a4e3635`](https://github.com/marko-js/htmljs-parser/commit/a4e3635f790ebccdbacb3f432064891c7cee9b60) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fixes issue where expressions could consume an extra character when windows line endings used.

* [#103](https://github.com/marko-js/htmljs-parser/pull/103) [`1f2c9b0`](https://github.com/marko-js/htmljs-parser/commit/1f2c9b01d852ec7f735b2aa8e48a54ac67d63919) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - When parsing unenclosed expressions we look backwards for unary operators preceded by a word break. This caused a false positive when a member expression was found with the operator name, eg `input.new`. Now we ensure that these operators are not in a member expression like this.

- [#103](https://github.com/marko-js/htmljs-parser/pull/103) [`469b4bc`](https://github.com/marko-js/htmljs-parser/commit/469b4bc23fa5412bae6f2b3a701c180b1f77b812) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Improves consistency with v2 of the parser by allowing expressions to span multiple lines if the line is ended with the continuation. This change also allows html attributes and grouped concise attributes to span multiple lines with a new line before _or after_ the continuation.

## 3.3.3

### Patch Changes

- [#101](https://github.com/marko-js/htmljs-parser/pull/101) [`9034f55`](https://github.com/marko-js/htmljs-parser/commit/9034f559ce8f7ca4746cd58b7750a3ba7865cabb) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Parse tag variable type as an continuable expression.

## 3.3.2

### Patch Changes

- [#99](https://github.com/marko-js/htmljs-parser/pull/99) [`b1a3008`](https://github.com/marko-js/htmljs-parser/commit/b1a300874e9b67972a5a0f82855d083109fd3361) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fix expression continuations containing equals not consuming enough characters

## 3.3.1

### Patch Changes

- [#95](https://github.com/marko-js/htmljs-parser/pull/95) [`c577179`](https://github.com/marko-js/htmljs-parser/commit/c5771791c8ff799d9eb5b057eb3ec8d808b77c4c) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Switch from semantic-release to changesets
