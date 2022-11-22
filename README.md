<h1 align="center">
  <!-- Logo -->
  <br/>
  htmljs-parser
  <br/>

  <!-- Format -->
  <a href="https://github.com/prettier/prettier">
    <img src="https://img.shields.io/badge/styled_with-prettier-ff69b4.svg" alt="Styled with prettier"/>
  </a>
  <!-- CI -->
  <a href="https://github.com/marko-js/htmljs-parser/actions/workflows/ci.yml">
    <img src="https://github.com/marko-js/htmljs-parser/actions/workflows/ci.yml/badge.svg" alt="Build status"/>
  </a>
  <!-- Coverage -->
  <a href="https://codecov.io/gh/marko-js/htmljs-parser">
    <img src="https://codecov.io/gh/marko-js/htmljs-parser/branch/main/graph/badge.svg?token=Sv8ePs16ix" alt="Code Coverage"/>
  </a>
  <!-- NPM Version -->
  <a href="https://npmjs.org/package/htmljs-parser">
    <img src="https://img.shields.io/npm/v/htmljs-parser.svg" alt="NPM version"/>
  </a>
  <!-- Downloads -->
  <a href="https://npmjs.org/package/htmljs-parser">
    <img src="https://img.shields.io/npm/dm/htmljs-parser.svg" alt="Downloads"/>
  </a>
</h1>

An HTML parser with super powers used by [Marko](https://markojs.com/docs/syntax/).

# Installation

```console
npm install htmljs-parser
```

# Creating A Parser

First we must create a parser instance and pass it some handlers for the various parse events shown below.

Each parse event is called a `Range` and is an object with start and end properties which are zero-based offsets from the beginning of th parsed code.

Additional meta data and nested ranges are exposed on some events shown below.

You can get the raw string from any range using `parser.read(range)`.

```javascript
import { createParser, ErrorCode, TagType } from "htmljs-parser";

const parser = createParser({
  /**
   * Called when the parser encounters an error.
   *
   * @example
   * 1╭─ <a><b
   *  ╰─     ╰─ error(code: 19, message: "EOF reached while parsing open tag")
   */
  onError(range) {
    range.code; // An error code id. You can see the list of error codes in ErrorCode imported above.
    range.message; // A human readable (hopefully) error message.
  },

  /**
   * Called when some static text is parsed within some body content.
   *
   * @example
   * 1╭─ <div>Hi</div>
   *  ╰─      ╰─ text "Hi"
   */
  onText(range) {},

  /**
   * Called after parsing a placeholder within body content.
   *
   * @example
   * 1╭─ <div>${hello} $!{world}</div>
   *  │       │ │      │  ╰─ placeholder.value "world"
   *  │       │ │      ╰─ placeholder "$!{world}"
   *  │       │ ╰─ placeholder:escape.value "hello"
   *  ╰─      ╰─ placeholder:escape "${hello}"
   */
  onPlaceholder(range) {
    range.escape; // true for ${} placeholders and false for $!{} placeholders.
    range.value; // Another range that includes only the placeholder value itself without the wrapping braces.
  },

  /**
   * Called when we find a comment at the root of the document or within a tags contents.
   * It will not be fired for comments within expressions, such as attribute values.
   *
   * @example
   * 1╭─ <!-- hi -->
   *  │  │   ╰─ comment.value " hi "
   *  ╰─ ╰─ comment "<!-- hi -->"
   * 2╭─ // hi
   *  │  │ ╰─ comment.value " hi"
   *  ╰─ ╰─ comment "// hi"
   */
  onComment(range) {
    range.value; // Another range that only includes the contents of the comment.
  },

  /**
   * Called after parsing a CDATA section.
   * // https://developer.mozilla.org/en-US/docs/Web/API/CDATASection
   *
   * @example
   * 1╭─ <![CDATA[hi]]>
   *  │  │        ╰─ cdata.value "hi"
   *  ╰─ ╰─ cdata "<![CDATA[hi]]>"
   */
  onCDATA(range) {
    range.value; // Another range that only includes the contents of the CDATA.
  },

  /**
   * Called after parsing a DocType comment.
   * https://developer.mozilla.org/en-US/docs/Web/API/DocumentType
   *
   * @example
   * 1╭─ <!DOCTYPE html>
   *  │  │ ╰─ doctype.value "DOCTYPE html"
   *  ╰─ ╰─ doctype "<!DOCTYPE html>"
   */
  onDoctype(range) {
    range.value; // Another range that only includes the contents of the DocType.
  },

  /**
   * Called after parsing an XML declaration.
   * https://developer.mozilla.org/en-US/docs/Web/XML/XML_introduction#xml_declaration
   *
   * @example
   * 1╭─ <?xml version="1.0" encoding="UTF-8"?>
   *  │  │ ╰─ declaration.value "xml version=\"1.0\" encoding=\"UTF-8\""
   *  ╰─ ╰─ declaration "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
   */
  onDeclaration(range) {
    range.value; // Another range that only includes the contents of the declaration.
  },

  /**
   * Called after parsing a scriptlet (new line followed by a $).
   *
   * @example
   * 1╭─ $ foo();
   *  │   │╰─ scriptlet.value "foo();"
   *  ╰─  ╰─ scriptlet " foo();"
   * 2╭─ $ { bar(); }
   *  │   │ ╰─ scriptlet:block.value " bar(); "
   *  ╰─  ╰─ scriptlet:block " { bar(); }"
   */
  onScriptlet(range) {
    range.block; // true if the scriptlet was contained within braces.
    range.value; // Another range that includes only the value itself without the leading $ or surrounding braces (if applicable).
  },

  /**
   * Called when we're about to begin an HTML open tag (before the tag name).
   * Note: This is only called for HTML mode tags and can be used to track if you are in concise mode.
   *
   * @example
   * 1╭─ <div>Hi</div>
   *  ╰─ ╰─ openTagStart
   */
  onOpenTagStart(range) {},

  /**
   * Called when a tag name, which can include placeholders, has been parsed.
   *
   * @example
   * 1╭─ <div/>
   *  ╰─  ╰─ openTagName "div"
   * 2╭─ <hello-${test}-again/>
   *  │   │     │      ╰─ openTagName.quasis[1] "-again"
   *  │   │     ╰─ openTagName.expressions[0] "${test}"
   *  │   ├─ openTagName.quasis[0] "hello-"
   *  ╰─  ╰─ openTagName "hello-${test}-again"
   */
  onOpenTagName(range) {
    range.quasis; // An array of ranges that indicate the string literal parts of the tag name.
    range.expressions; // A list of placeholder ranges (similar to whats emitted via onPlaceholder).

    // Return a different tag type enum value to enter a different parse mode.
    // Below is approximately what Marko uses:
    switch (parser.read(range)) {
      case "area":
      case "base":
      case "br":
      case "col":
      case "embed":
      case "hr":
      case "img":
      case "input":
      case "link":
      case "meta":
      case "param":
      case "source":
      case "track":
      case "wbr":
        // TagType.void makes this a void element (cannot have children).
        return TagType.void;
      case "html-comment":
      case "script":
      case "style":
      case "textarea":
        // TagType.text makes the child content text only (with placeholders).
        return TagType.text;
      case "class":
      case "export":
      case "import":
      case "static":
        // TagType.statement makes this a statement tag where the content following the tag name will be parsed as script code until we reach a new line, eg for `import x from "y"`).
        return TagType.statement;
    }

    // TagType.html is the default which allows child content as html with placeholders.
    return TagType.html;
  },

  /**
   * Called when a shorthand id, which can include placeholders, has been parsed.
   *
   * @example
   * 1╭─ <div#hello-${test}-again/>
   *  │      ││     │       ╰─ tagShorthandId.quasis[1] "-again"
   *  │      ││     ╰─ tagShorthandId.expressions[0] "${test}"
   *  │      │╰─ tagShorthandId.quasis[0] "hello-"
   *  ╰─     ╰─ tagShorthandId "#hello-${test}-again"
   */
  onTagShorthandId(range) {
    range.quasis; // An array of ranges that indicate the string literal parts of the shorthand id name.
    range.expressions; // A list of placeholder ranges (similar to whats emitted via onPlaceholder).
  },

  /**
   * Called when a shorthand class name, which can include placeholders, has been parsed.
   * Note there can be multiple of these.
   *
   * @example
   * 1╭─ <div.hello-${test}-again/>
   *  │      ││     │       ╰─ tagShorthandClassName.quasis[1] "-again"
   *  │      ││     ╰─ tagShorthandClassName.expressions[0] "${test}"
   *  │      │╰─ tagShorthandClassName.quasis[0] "hello-"
   *  ╰─     ╰─ tagShorthandClassName "#hello-${test}-again"
   */
  onTagShorthandClass(range) {
    range.quasis; // An array of ranges that indicate the string literal parts of the shorthand id name.
    range.expressions; // A list of placeholder ranges (similar to whats emitted via onPlaceholder).
  },

  /**
   * Called after the type arguments for a tag have been parsed.
   *
   * @example
   * 1╭─ <foo<string>>
   *  │      │╰─ tagTypeArgs.value "string"
   *  ╰─     ╰─ tagTypeArgs "<string>"
   */
  onTagTypeArgs(range) {
    range.value; // Another range that includes only the type arguments themselves and not the angle brackets.
  },

  /**
   * Called after a tag variable has been parsed.
   *
   * @example
   * 1╭─ <div/el/>
   *  │      │╰─ tagVar.value "el"
   *  ╰─     ╰─ tagVar "/el"
   */
  onTagVar(range) {
    range.value; // Another range that includes only the tag var itself and not the leading slash.
  },

  /**
   * Called after tag arguments have been parsed.
   *
   * @example
   * 1╭─ <if(x)>
   *  │     │╰─ tagArgs.value "x"
   *  ╰─    ╰─ tagArgs "(x)"
   */
  onTagArgs(range) {
    range.value; // Another range that includes only the args themselves and not the outer parenthesis.
  },

  /**
   * Called after type parameters for the tag parameters have been parsed.
   *
   * @example
   * 1╭─ <tag<T>|input: { name: T }|>
   *  │      │╰─ tagTypeParams.value
   *  ╰─     ╰─ tagTypeParams "<T>"
   */
  onTagTypeParams(range) {
    range.value; // Another range that includes only the type params themselves and not the angle brackets.
  },

  /**
   * Called after tag parameters have been parsed.
   *
   * @example
   * 1╭─ <for|item| of=list>
   *  │      │╰─ tagParams.value "item"
   *  ╰─     ╰─ tagParams "|item|"
   */
  onTagParams(range) {
    range.value; // Another range that includes only the params themselves and not the outer pipes.
  },

  /**
   * Called after an attribute name as been parsed.
   * Note this may be followed by the related AttrArgs, AttrValue or AttrMethod. It can also be directly followed by another AttrName, AttrSpread or the OpenTagEnd if this is a boolean attribute.
   *
   * @example
   * 1╭─ <div class="hi">
   *  ╰─      ╰─ attrName "class"
   */
  onAttrName(range) {},

  /**
   * Called after attr arguments have been parsed.
   *
   * @example
   * 1╭─ <div if(x)>
   *  │         │╰─ attrArgs.value "x"
   *  ╰─        ╰─ attrArgs "(x)"
   */
  onAttrArgs(range) {
    range.value; // Another range that includes only the args themselves and not the outer parenthesis.
  },

  /**
   * Called after an attr value has been parsed.
   *
   * @example
   * 1╭─ <input name="hi" value:=x>
   *  │             ││         │ ╰─ attrValue:bound.value
   *  │             ││         ╰─ attrValue:bound ":=x"
   *  │             │╰─ attrValue.value "\"hi\""
   *  ╰─            ╰─ attrValue "=\"hi\""
   */
  onAttrValue(range) {
    range.bound; // true if the attribute value was preceded by :=.
    range.value; // Another range that includes only the value itself without the leading = or :=.
  },

  /**
   * Called after an attribute method shorthand has been parsed.
   *
   * @example
   * 1╭─ <div onClick(ev) { foo(); }>
   *  │              ││   │╰─ attrMethod.body.value " foo(); "
   *  │              ││   ╰─ attrMethod.body "{ foo(); }"
   *  │              │╰─ attrMethod.params.value "ev"
   *  │              ├─ attrMethod.params "(ev)"
   *  ╰─             ╰─ attrMethod "(ev) { foo(); }"
   */
  onAttrMethod(range) {
    range.typeParams; // Another range which includes the type params for the method.
    range.typeParams.value; // Another range which includes the type params without outer angle brackets.

    range.params; // Another range which includes the params for the method.
    range.params.value; // Another range which includes the method params without outer parenthesis.

    range.body; // Another range which includes the entire body block.
    range.body.value; // Another range which includes the body block without outer braces.
  },

  /**
   * Called after we've parsed a spread attribute.
   *
   * @example
   * 1╭─ <div ...attrs>
   *  │       │  ╰─ attrSpread.value "attrs"
   *  ╰─      ╰─ attrSpread "...attrs"
   */
  onAttrSpread(range) {
    range.value; // Another range that includes only the value itself without the leading ...
  },

  /**
   * Called once we've completed parsing the open tag.
   *
   * @example
   * 1╭─ <div><span/></div>
   *  │      │     ╰─ openTagEnd:selfClosed "/>"
   *  ╰─     ╰─ openTagEnd ">"
   */
  onOpenTagEnd(range) {
    range.selfClosed; // true if this tag was self closed (the onCloseTag* handlers will not be called if so).
  },

  /**
   * Called when we start parsing and html closing tag.
   * Note this is not emitted for concise, selfClosed, void or statement tags.
   *
   * @example
   * 1╭─ <div><span/></div>
   *  ╰─             ╰─ closeTagStart "</"
   */
  onCloseTagStart(range) {},

  /**
   * Called after the content within the brackets of an html closing tag has been parsed.
   * Note this is not emitted for concise, selfClosed, void or statement tags.
   *
   * @example
   * 1╭─ <div><span/></div>
   *  ╰─               ╰─ closeTagName "div"
   */
  onCloseTagName(range) {},

  /**
   * Called once the closing tag has finished parsing, or in concise mode we hit an outdent or eof.
   * Note this is not called for selfClosed, void or statement tags.
   *
   * @example
   * 1╭─ <div><span/></div>
   *  ╰─                  ╰─ closeTagEnd ">"
   */
  onCloseTagEnd(range) {},
});
```

Finally after setting up the parser with it's handlers, it's time to pass in some source code to parse.

```javascript
parser.parse("<div></div>");
```

# Parser Helpers

The parser instance provides a few helpers to make it easier to work with the parsed content.

```javascript
// Pass any range object into this method to get the raw string from the source for the range.
parser.read(range);

// Given an zero based offset within the source code, returns a position object that contains line and column properties.
parser.positionAt(offset);

// Given a range object returns a location object with start and end properties which are each position objects as returned from the "positionAt" api.
parser.locationAt(range);
```

# Code of Conduct

This project adheres to the [eBay Code of Conduct](./.github/CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.
