htmljs-parser
=============

HTML parsers written according to the HTML spec will interpret all
attribute values as strings which makes it challenging to properly
describe a value's type (boolean, string, number, array, etc.)
or to provide a complex JavaScript expression as a value.
The ability to describe JavaScript expressions within attributes
is important for HTML-based template compilers.

For example, consider a HTML-based template that wishes to
support a custom tag named `<say-hello>` that supports an
attribute named `message` that can be a string literal or a JavaScript expression.


Ideally, the template compiler should be able to handle any of the following:

```html
<say-hello message="Hello world!" />
<say-hello message=("Hello " + personName + "!") />
<say-hello message="Hello ${personName}!" />
```

This parser extends the HTML grammar to add these important features:

- JavaScript expressions as attribute values
```html
<say-hello message=("Hello " + personName) count=2+2 large=true />
```
- Placeholders in the content of an element
```html
<div>
    Hello ${personName}
</div>
```
- Placeholders within attribute value strings
```html
<div data-message="Hello ${personName}!">
```
- JavaScript flow-control statements within HTML elements
```html
<div for(a in b) />
<div if(a === b) />
```
- JavaScript flow-control statements as elements
```html
<for (a in b)>
<if (a in b)>
```

# Installation

```bash
npm install htmljs-parser
```

# Usage

```javascript
var parser = require('htmljs-parser').createParser({
    onText: function(event) {
        // Text within an HTML element
        var value = event.value;
    },

    onPlaceholder: function(event) {
        //  ${<value>]} // escape = true
        // $!{<value>]} // escape = false
        var value = event.value; // String
        var escaped = event.escaped; // boolean
        var withinBody = event.withinBody; // boolean
        var withinAttribute = event.withinAttribute; // boolean
        var withinString = event.withinString; // boolean
        var withinOpenTag = event.withinOpenTag; // boolean
        var pos = event.pos; // Integer
    },

    onCDATA: function(event) {
        // <![CDATA[<value>]]>
        var value = event.value; // String
        var pos = event.pos; // Integer
    },

    onOpenTag: function(event) {
        var tagName = event.tagName; // String
        var attributes = event.attributes; // Array
        var argument = event.argument; // Object
        var pos = event.pos; // Integer
    },

    onCloseTag: function(event) {
        // close tag
        var tagName = event.tagName; // String
        var pos = event.pos; // Integer
    },

    onDocumentType: function(event) {
        // Document Type/DTD
        // <!<value>>
        // Example: <!DOCTYPE html>
        var value = event.value; // String
        var pos = event.pos; // Integer
    },

    onDeclaration: function(event) {
        // Declaration
        // <?<value>?>
        // Example: <?xml version="1.0" encoding="UTF-8" ?>
        var value = event.value; // String
        var pos = event.pos; // Integer
    },

    onComment: function(event) {
        // Text within XML comment
        var value = event.value; // String
        var pos = event.pos; // Integer
    },

    onScriptlet: function(event) {
        // Text within <% %>
        var value = event.value; // String
        var pos = event.pos; // Integer
    },

    onError: function(event) {
        // Error
        var message = event.message; // String
        var code = event.code; // String
        var pos = event.pos; // Integer
    }
});

parser.parse(str);
```

## Content Parsing Modes

The parser, by default, will look for HTML tags within content. This behavior
might not be desirable for certain tags, so the parser allows the parsing mode
to be changed (usually in response to an `onOpenTag` event).

There are three content parsing modes:

- **HTML Content (DEFAULT):**
    The parser will look for any HTML tag and content placeholders while in
    this mode and parse opening and closing tags accordingly.

- **Parsed Text Content**: The parser will look for the closing tag that matches
    the current open tag as well as content placeholders but all other content
    will be interpreted as text.

- **Static Text Content**: The parser will look for the closing tag that matches
    the current open tag but all other content will be interpreted as raw text.

```javascript
var htmljs = require('htmljs-parser');
var parser = htmljs.createParser({
    onOpenTag: function(event) {
        // open tag
        switch(event.tagName) {
            case 'textarea':
                //fall through
            case 'script':
                //fall through
            case 'style':
                // parse the content within these tags but only
                // look for placeholders and the closing tag.
                parser.enterParsedTextContentState();
                break;
            case 'dummy'
                // treat content within <dummy>...</dummy> as raw
                // text and ignore other tags and placeholders
                parser.enterStaticTextContentState();
                break;
            default:
                // The parser will switch to HTML content parsing mode
                // if the parsing mode is not explicitly changed by
                // "onOpenTag" function.
        }
    }
});

parser.parse(str);
```

## Parsing Events

The `htmljs-parser` is an event-based parser which means that it will emit
events as it is parsing the document. Events are emitted via calls
to `on<eventname>` function which are supplied as properties in the options
via call to `require('htmljs-parser').createParser(options)`.

### onOpenTag

The `onOpenTag` function will be called each time an opening tag is
encountered.

**EXAMPLE: Simple tag**

INPUT:

```html
<div>
```

OUTPUT EVENT:

```javascript
{
    type: 'openTag',
    tagName: 'div',
    attributes: []
}
```

**EXAMPLE: Tag with literal attribute values**

INPUT:

```html
<div class="demo" disabled=false data-number=123>
```

OUTPUT EVENT:

```javascript
{
    type: 'openTag',
    tagName: 'div',
    attributes: [
        {
            name: 'class',
            value: '"demo"',
            literalValue: 'demo'
        },
        {
            name: 'disabled',
            value: 'false',
            literalValue: false
        },
        {
            name: 'data-number',
            value: '123',
            literalValue: 123
        }
    ]
}
```

**EXAMPLE: Tag with expression attribute**

INPUT:

```html
<say-something message="Hello "+data.name>
```

OUTPUT EVENT:

```javascript
{
    type: 'openTag',
    tagName: 'div',
    attributes: [
        {
            name: 'message',
            value: '"Hello "+data.name'
        }
    ]
}
```

**EXAMPLE: Tag with an argument**

INPUT:

```html
<for(var i = 0; i < 10; i++)>
```

OUTPUT EVENT:

```javascript
{
    type: 'openTag',
    tagName: 'for',
    argument: {
        value: 'var i = 0; i < 10; i++',
        pos: ... // Integer
    },
    attributes: []
}
```

**EXAMPLE: Attribute with an argument**

INPUT:

```html
<div if(x > y)>
```

OUTPUT EVENT:

```javascript
{
    type: 'openTag',
    tagName: 'div',
    attributes: [
        {
            name: 'if',
            argument: {
                value: 'x > y',
                pos: ... // Integer
            }
        }
    ]
}
```

### onCloseTag

The `onCloseTag` function will be called each time a closing tag is
encountered.

**EXAMPLE: Simple close tag**

INPUT:

```html
</div>
```

OUTPUT EVENT:

```javascript
{
    type: 'closeTag',
    tagName: 'div'
}
```

### onText

The `onText` function will be called each time within an element
when textual data is encountered.

**NOTE:** Text within `<![CDATA[` `]]>` will be emitted via call
to `onCDATA`.

**EXAMPLE**

In the following example code, the `TEXT` sequences will be emitted as
text events.

INPUT:

```html
Simple text
```

OUTPUT EVENT:

```javascript
{
    type: 'text',
    value: 'Simple text'
}
```

### onCDATA

The `onCDATA` function will be called when text within `<![CDATA[` `]]>`
is encountered.

**EXAMPLE:**

INPUT:

```html
<![CDATA[This is text]]>
```

OUTPUT EVENT:

```javascript
{
    type: 'cdata',
    value: 'This is text'
}
```

### onPlaceholder

The `onPlaceholder` function will be called each time a placeholder
is encountered.

If the placeholder starts with the `$!{` sequence then `event.escape`
will be `false`.

If the placeholder starts with the `${` sequence then `event.escape` will be
`true`.

Text within `<![CDATA[` `]]>` and `<!--` `-->` will not be parsed so you
cannot use placeholders for these blocks of code.

**EXAMPLE:**

INPUT:

```html
${"This is an escaped placeholder"}
$!{"This is a non-escaped placeholder"}
```

OUTPUT EVENTS

```html
${name}
```

```javascript
{
    type: 'placeholder',
    value: 'name',
    escape: true
}
```

--------

```html
$!{name}
```

```javascript
{
    type: 'placeholder',
    value: 'name',
    escape: true
}
```

**NOTE:**
The `escape` flag is merely informational. The application code is responsible
for interpreting this flag to properly escape the expression.

Here's an example of modifying the expression based on the `event.escape` flag:

```javascript
onPlaceholder: function(event) {
    if (event.escape) {
        event.value = 'escapeXml(' + event.value + ')';
    }
}
```

### onDocumentType

The `onDocumentType` function will be called when the document type declaration
is encountered _anywhere_ in the content.

**EXAMPLE:**

INPUT:

```html
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0//EN">
```

OUTPUT EVENT:

```javascript
{
    type: 'documentType',
    value: 'DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0//EN"'
}
```

### onDeclaration

The `onDeclaration` function will be called when an XML declaration
is encountered _anywhere_ in the content.

**EXAMPLE:**

INPUT:

```html
<?xml version="1.0" encoding="UTF-8"?>
```

OUTPUT EVENT:

```javascript
{
    type: 'declaration',
    value: 'xml version="1.0" encoding="UTF-8"'
}
```

### onComment

The `onComment` function will be called when text within `<!--` `-->`
is encountered.

**EXAMPLE:**

INPUT:

```html
<!--This is a comment-->
```

OUTPUT EVENT:

```javascript
{
    type: 'comment',
    value: 'This is a comment'
}
```

### onScriptlet

The `onScriptlet` function will be called when text within `<%` `%>`
is encountered.

**EXAMPLE:**

INPUT:

```html
<% console.log("Hello World!"); %>
```

OUTPUT EVENT:

```javascript
{
    type: 'scriptlet',
    value: ' console.log("Hello World!"); '
}
```

### onError

The `onError` function will be called when malformed content is detected.
The most common cause for an error is due to reaching the end of the
input while still parsing an open tag, close tag, XML comment, CDATA section,
DTD, XML declaration, or placeholder.

Possible error codes:

- `MISSING_END_TAG`
- `MISSING_END_DELIMITER`
- `MALFORMED_OPEN_TAG`
- `MALFORMED_CLOSE_TAG`
- `MALFORMED_CDATA`
- `MALFORMED_PLACEHOLDER`
- `MALFORMED_DOCUMENT_TYPE`
- `MALFORMED_DECLARATION`
- `MALFORMED_COMMENT`
- `EXTRA_CLOSING_TAG`
- `MISMATCHED_CLOSING_TAG`
- ...

**EXAMPLE:**

INPUT:

```html
<a href="
```

OUTPUT EVENT:

```javascript
{
    type: 'error',
    code: 'MALFORMED_OPEN_TAG',
    message: 'EOF reached while parsing open tag.',
    pos: 0,
    endPos: 9
}
```