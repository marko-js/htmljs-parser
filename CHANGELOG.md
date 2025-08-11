# htmljs-parser

## 5.7.2

### Patch Changes

- [#192](https://github.com/marko-js/htmljs-parser/pull/192) [`eed2eb1`](https://github.com/marko-js/htmljs-parser/commit/eed2eb1eba4a3a5275b03ec4a07bfcf7da2ac7dd) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fix regression where typescript unary operators were being used in javascript contexts.

## 5.7.1

### Patch Changes

- [#190](https://github.com/marko-js/htmljs-parser/pull/190) [`aabf1f1`](https://github.com/marko-js/htmljs-parser/commit/aabf1f13061b9f4dce63e66ede79416660fec70f) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fix arrow function parsing in type expressions.

## 5.7.0

### Minor Changes

- [#186](https://github.com/marko-js/htmljs-parser/pull/186) [`f297f19`](https://github.com/marko-js/htmljs-parser/commit/f297f19b8f2b27d41df99d98a1fbf0801e2c96ba) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Improve expression parsing for typescript, especially around multi line generics.

### Patch Changes

- [#187](https://github.com/marko-js/htmljs-parser/pull/187) [`1110d1d`](https://github.com/marko-js/htmljs-parser/commit/1110d1d8ed21f92e1dfa56d8f0ca17c719c19bc5) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fix regexp charset parsing issue.

## 5.6.2

### Patch Changes

- [#184](https://github.com/marko-js/htmljs-parser/pull/184) [`eb9865c`](https://github.com/marko-js/htmljs-parser/commit/eb9865c821d232a5ce0bbd0642b8ef3857c2d71c) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Avoid startText call at eof.

## 5.6.1

### Patch Changes

- [#182](https://github.com/marko-js/htmljs-parser/pull/182) [`7c4f4c3`](https://github.com/marko-js/htmljs-parser/commit/7c4f4c3a5e0205807607694614c4be1d017c7d41) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fix regression caused by indented statement parsing.

## 5.6.0

### Minor Changes

- [#180](https://github.com/marko-js/htmljs-parser/pull/180) [`22bfdda`](https://github.com/marko-js/htmljs-parser/commit/22bfdda84034970787a61114e9bc20e8b9d78f17) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - When parsing statements, consume any indented content without errors.

## 5.5.4

### Patch Changes

- [#178](https://github.com/marko-js/htmljs-parser/pull/178) [`06f4716`](https://github.com/marko-js/htmljs-parser/commit/06f47161304cbb0bb80f8a8c7ed4442ff2e89b3b) Thanks [@LuLaValva](https://github.com/LuLaValva)! - Fix operator-terminated comments in scriptlets

## 5.5.3

### Patch Changes

- [#175](https://github.com/marko-js/htmljs-parser/pull/175) [`4fcee24`](https://github.com/marko-js/htmljs-parser/commit/4fcee24a3fcfdf7c580dac86500906a8b20e2a1e) Thanks [@LuLaValva](https://github.com/LuLaValva)! - Add support for `satisfies`

## 5.5.2

### Patch Changes

- [#171](https://github.com/marko-js/htmljs-parser/pull/171) [`aa98807`](https://github.com/marko-js/htmljs-parser/commit/aa98807ef3e9f2d439e499f737bfe1b7c923983a) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Upgrade dependencies and configs

## 5.5.1

### Patch Changes

- [#168](https://github.com/marko-js/htmljs-parser/pull/168) [`3a696d0`](https://github.com/marko-js/htmljs-parser/commit/3a696d018d063665c36296565279881d6b05d8c6) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - When the preceding character of an expression is a quote, prefer division over regexp state. This improves parsing for inline css grid properties.

## 5.5.0

### Minor Changes

- [#164](https://github.com/marko-js/htmljs-parser/pull/164) [`13a33a3`](https://github.com/marko-js/htmljs-parser/commit/13a33a3499889b4abf3001cf505b08558e303eea) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Allow indented javascript style comments that are not under a parent tag in concise mode.

## 5.4.3

### Patch Changes

- [#161](https://github.com/marko-js/htmljs-parser/pull/161) [`be73442`](https://github.com/marko-js/htmljs-parser/commit/be734429cc67b87a21a6a0c8880da64a3475d03e) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fixes a regression where the parsed text state (used by eg `script`, `style`) was not properly entering back into text for the closing quote on the string.

- [#162](https://github.com/marko-js/htmljs-parser/pull/162) [`085451c`](https://github.com/marko-js/htmljs-parser/commit/085451cc574b56ce6689f2168a9eed1bd0f0b0e6) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Always consume next character of expression if terminator was preceded by an operator.

## 5.4.2

### Patch Changes

- [#158](https://github.com/marko-js/htmljs-parser/pull/158) [`fe98530`](https://github.com/marko-js/htmljs-parser/commit/fe985307a2112ba48c1317a16481c321ba256619) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fixes an regression where string literals inside of parsed text nodes (eg `<script>`) were not properly changing the parser state. This caused issues when comment like syntax was embedded within these string literals"

## 5.4.1

### Patch Changes

- [#156](https://github.com/marko-js/htmljs-parser/pull/156) [`72b3379`](https://github.com/marko-js/htmljs-parser/commit/72b3379fb37d2c4e76976bcb4bb0312b376068a3) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fix regression where the parser would continue unary keyword expressions even if the keyword was inside a word boundary. Eg `<div class=thing_new x>` would cause the parser to see the expression as `thing_` and `new x`.

## 5.4.0

### Minor Changes

- [#154](https://github.com/marko-js/htmljs-parser/pull/154) [`6b5b196`](https://github.com/marko-js/htmljs-parser/commit/6b5b1968d332078042406c62ee9be3f21e5ed687) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - In concise mode, a new line which starts with a coma will now continue attributes for the current tag.

- [#154](https://github.com/marko-js/htmljs-parser/pull/154) [`6b5b196`](https://github.com/marko-js/htmljs-parser/commit/6b5b1968d332078042406c62ee9be3f21e5ed687) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Allow a comma to follow the tag name to begin attributes.

### Patch Changes

- [#154](https://github.com/marko-js/htmljs-parser/pull/154) [`61e6966`](https://github.com/marko-js/htmljs-parser/commit/61e696631d18472978e2c5a2f4959cb852e0414f) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Avoid continuing expressions after a period if after the whitespace is something that could not be an identifier.

## 5.3.0

### Minor Changes

- [#152](https://github.com/marko-js/htmljs-parser/pull/152) [`ea65c9f`](https://github.com/marko-js/htmljs-parser/commit/ea65c9fe8fac0a47122b4f3b6b811856e2ceac99) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Improve handling ambiguity with tag type args vs type params. Type args must now always be directly adjacent the tag name, otherwise it will become type params.

## 5.2.4

### Patch Changes

- [#150](https://github.com/marko-js/htmljs-parser/pull/150) [`0d7210b`](https://github.com/marko-js/htmljs-parser/commit/0d7210b6d77ff57b55f38d8c9ee15effbfa05603) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fix issue with tag variable not terminated on concise mode text delimiter

## 5.2.3

### Patch Changes

- [#148](https://github.com/marko-js/htmljs-parser/pull/148) [`948830e`](https://github.com/marko-js/htmljs-parser/commit/948830ef7bddf1d76cb75b6cbb14dcb79adfb115) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fix issue with semi-colon after a block scriptlet.

## 5.2.2

### Patch Changes

- [#146](https://github.com/marko-js/htmljs-parser/pull/146) [`bcfd809`](https://github.com/marko-js/htmljs-parser/commit/bcfd809fd376527e5fe624aa8418dd62fb2bf4fa) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fixes an issue where attribute names that started with a keyword (eg: `as-thing` or `instanceof-thing`) were incorrectly treated as an expression continuation.

## 5.2.1

### Patch Changes

- [#143](https://github.com/marko-js/htmljs-parser/pull/143) [`635b97c`](https://github.com/marko-js/htmljs-parser/commit/635b97c33e14e64a71b9894bc6a37988136d9fa1) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fix issue where and extra character was being consumed if an escaped placeholder was at the end of a tag.

## 5.2.0

### Minor Changes

- [#141](https://github.com/marko-js/htmljs-parser/pull/141) [`81cff30`](https://github.com/marko-js/htmljs-parser/commit/81cff303caa95b7d425bbe5c3c056f369522d0e5) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Add support for type parameter/argument parsing.
  This adds a new `onTagTypeParams`, `onTagTypeArgs` events and a `.typeParams` property on the `AttrMethod` range.

## 5.1.5

### Patch Changes

- [#138](https://github.com/marko-js/htmljs-parser/pull/138) [`8c34227`](https://github.com/marko-js/htmljs-parser/commit/8c342277b2c5be4899f5d973a2acdeb60ba3edd7) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fixes a parse error where division is immediately followed by enclosed code.

## 5.1.4

### Patch Changes

- [#136](https://github.com/marko-js/htmljs-parser/pull/136) [`b5fa4d0`](https://github.com/marko-js/htmljs-parser/commit/b5fa4d02599cf8ec840d70e813b08959ba0ec21d) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Optimize parser constructor to avoid initializing unecessary properties.

* [#134](https://github.com/marko-js/htmljs-parser/pull/134) [`cdbc6b2`](https://github.com/marko-js/htmljs-parser/commit/cdbc6b2cfb22070f2330e7e37eb61a79e21f0c4d) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Improve missing attribute error when the tag is immediately closed without the attribute value.

## 5.1.3

### Patch Changes

- [#132](https://github.com/marko-js/htmljs-parser/pull/132) [`59a10d5`](https://github.com/marko-js/htmljs-parser/commit/59a10d57b1c6fa273ceafe19ff814a1ae03409bf) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fix regression which caused script tags with a trailing comment as the same line as the closing tag to not always parse properly.

* [#132](https://github.com/marko-js/htmljs-parser/pull/132) [`59a10d5`](https://github.com/marko-js/htmljs-parser/commit/59a10d57b1c6fa273ceafe19ff814a1ae03409bf) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Remove unecessary check for cdata inside parsed text state.

## 5.1.2

### Patch Changes

- [#130](https://github.com/marko-js/htmljs-parser/pull/130) [`ebc850f`](https://github.com/marko-js/htmljs-parser/commit/ebc850f8aa0f5ad544f11cae18998a42cf56f54b) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Switch from regexp based parsing for the expression continuations. This slightly improves performance and more importantly fixes usage of the parser in safari.

## 5.1.1

### Patch Changes

- [#127](https://github.com/marko-js/htmljs-parser/pull/127) [`222b145`](https://github.com/marko-js/htmljs-parser/commit/222b145f4052596807b848116fb7f7581ddadc7c) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fix regression around JS style comments in the body by requiring that they are preceded by a whitespace.

## 5.1.0

### Minor Changes

- [#125](https://github.com/marko-js/htmljs-parser/pull/125) [`725bcb3`](https://github.com/marko-js/htmljs-parser/commit/725bcb3b3efa400fb187f3eecbb7b98cdd0b19c8) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Expose some apis for generating position and location information.

## 5.0.4

### Patch Changes

- [#123](https://github.com/marko-js/htmljs-parser/pull/123) [`b8bfcd9`](https://github.com/marko-js/htmljs-parser/commit/b8bfcd95c900e9b013510499576c4f879e6365cb) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Comma will now always terminate a tag variable.

## 5.0.3

### Patch Changes

- [#121](https://github.com/marko-js/htmljs-parser/pull/121) [`b1e68a3`](https://github.com/marko-js/htmljs-parser/commit/b1e68a300e75aeb538b1045dfd20b451abd74d09) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fix regression that causes incorrect expression continuations after regexps.

## 5.0.2

### Patch Changes

- [#119](https://github.com/marko-js/htmljs-parser/pull/119) [`28fde07`](https://github.com/marko-js/htmljs-parser/commit/28fde072243fc80ddb9eb263c2ef061dbd785b94) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Support JS line comments inside the open tag (previously just block comments could be used).

* [#119](https://github.com/marko-js/htmljs-parser/pull/119) [`28fde07`](https://github.com/marko-js/htmljs-parser/commit/28fde072243fc80ddb9eb263c2ef061dbd785b94) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Support JS style comments in HTML bodies (previously allowed in parsed text and concise mode).

## 5.0.1

### Patch Changes

- [#117](https://github.com/marko-js/htmljs-parser/pull/117) [`8bd3c40`](https://github.com/marko-js/htmljs-parser/commit/8bd3c4057d485d6b1e47f15bd48e333e25b9951e) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fix issue with onCloseTagStart not called for text mode tags (eg style, script, textarea & html-comment).

## 5.0.0

### Major Changes

- [#114](https://github.com/marko-js/htmljs-parser/pull/114) [`14f3499`](https://github.com/marko-js/htmljs-parser/commit/14f3499cd96d45bad081823e95a2bfecb7ae1474) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Rename `onTagName` to `onOpenTagName`.
  Add a new `onOpenTagStart` event (before `onOpenTagName`).
  Split the `onCloseTag` event into three new events: `onClosetTagStart`, `onCloseTagName` & `onCloseTagEnd`).

## 4.0.0

### Major Changes

- [#112](https://github.com/marko-js/htmljs-parser/pull/112) [`2ad4628`](https://github.com/marko-js/htmljs-parser/commit/2ad462818eca5985f89c497b1f2efe2945a48730) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Switch character position offsets for newlines to be to similar to vscode. Previously the newline was counted as the first character of the line, now it is the last character of the previous line.

## 3.3.6

### Patch Changes

- [#110](https://github.com/marko-js/htmljs-parser/pull/110) [`281750a`](https://github.com/marko-js/htmljs-parser/commit/281750ab71f7415b765ddb5440477f293746fafa) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Rename publish script to release in order to avoid a double publish in the CI

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
