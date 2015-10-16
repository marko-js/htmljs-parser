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
var htmljs = require('htmljs-parser');
var parser = htmljs.createParser({
    ontext: function(event) {
        // text
    },

    oncontentplaceholder: function(event) {
        // placeholder within content
    },

    onnestedcontentplaceholder: function(event) {
        // placeholder within string that is within content placeholder
    },

    onattributeplaceholder: function(event) {
        // placeholder within attribute
    },

    oncdata: function(event) {
        // CDATA
    },

    onopentag: function(event) {
        // open tag
    },

    onclosetag: function(event) {
        // close tag
    },

    ondtd: function(event) {
        // DTD (e.g. <DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0//EN">)
    },

    ondeclaration: function(event) {
        // Declaration (e.g. <?xml version="1.0" encoding="UTF-8" ?>)
    },

    oncomment: function(event) {
        // Text within XML comment
    },

    onerror: function(event) {
        // Error
    }
});

parser.parse(str);
```

## Content Parsing Modes

The parser, by default, will look for HTML tags within content. This behavior
might not be desirable for certain tags, so the parser allows the parsing mode
to be changed (usually in response to an `onopentag` event).

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
    onopentag: function(event) {
        // open tag
        switch(event.name) {
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
                // "onopentag" function.
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

### onopentag

The `onopentag` function will be called each time an opening tag is
encountered.

**EXAMPLE: Simple tag**

INPUT:

```html
<div>
```

OUTPUT EVENT:

```javascript
{
    type: 'opentag',
    name: 'div',
    attributes: []
}
```

**EXAMPLE: Tag with simple string attribute**

INPUT:

```html
<div class="demo">
```

OUTPUT EVENT:

```javascript
{
    type: 'opentag',
    name: 'div',
    attributes: [
        {
            name: 'class',
            expression: '"demo"',
            staticText: 'demo'
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
    type: 'opentag',
    name: 'div',
    attributes: [
        {
            name: 'message',
            expression: '"Hello "+data.name'
        }
    ]
}
```

**EXAMPLE: Tag with arguments**

INPUT:

```html
<for(var i = 0; i < 10; i++)>
```

OUTPUT EVENT:

```javascript
{
    type: 'opentag',
    name: 'for',
    arguments: [
        '(var i = 0; i < 10; i++)'
    ],
    attributes: []
}
```

**EXAMPLE: Attribute arguments**

INPUT:

```html
<div if(x > y)>
```

OUTPUT EVENT:

```javascript
{
    type: 'opentag',
    name: 'div',
    attributes: [
        {
            name: 'if',
            arguments: [
                '(x > y)'
            ]
        }
    ]
}
```

### onclosetag

The `onclosetag` function will be called each time a closing tag is
encountered.

**EXAMPLE: Simple close tag**

INPUT:

```html
</div>
```

OUTPUT EVENT:

```javascript
{
    type: 'closetag',
    name: 'div'
}
```

### ontext

The `ontext` function will be called each time within an element
when textual data is encountered.

**NOTE:** Text within `<![CDATA[` `]]>` will be emitted via call
to `oncdata`.

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
    text: 'Simple text'
}
```

### oncdata

The `oncdata` function will be called when text within `<![CDATA[` `]]>`
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
    text: 'This is text'
}
```

### oncontentplaceholder

The `oncontentplaceholder` function will be called each time a placeholder
is encountered within parsed textual content within elements.

If the placeholder starts with the "$!{" sequence then `event.escape`
will be `false`.

If the placeholder starts with the "${" sequence then `event.escape` will be
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

```javascript
{
    type: 'contentplaceholder',
    expression: '"This is an escaped placeholder"',
    escape: true
}
```

```javascript
{
    type: 'contentplaceholder',
    expression: '"This is a non-escaped placeholder"',
    escape: false
}
```

**NOTE:**
The `escape` flag is merely informational. The application code is responsible
for interpreting this flag to properly escape the expression.

### onnestedcontentplaceholder

The `onnestedcontentplaceholder` function will be called each time a placeholder
is encountered within a string that is also within another content placeholder.

If the placeholder starts with the "$!{" sequence then `event.escape`
will be `false`.

If the placeholder starts with the "${" sequence then `event.escape` will be
`true` unless the placeholder is nested within another placeholder that is
already escaped.


The `event.expression` property can be changed which will cause corresponding
change to ancestor content placeholder expression.

Here's an example of modifying the expression based on the `event.escape` flag:

```javascript
onnestedcontentplaceholder: function(event) {
    if (event.escape) {
        event.expression = 'escapeXml(' + event.expression + ')';
    }
}
```

**EXAMPLE:**

INPUT:

```html
${"Hello ${data.name}"}
```

The `${data.name}` sequence will trigger the call to
`onnestedcontentplaceholder`.

OUTPUT EVENTS

```javascript
{
    type: 'nestedcontentplaceholder',
    expression: 'data.name',
    escape: true
}
```

```javascript
{
    type: 'contentplaceholder',
    expression: '"Hello "+(data.name)+"!"',
    escape: true
}
```

**NOTE:**
The `escape` flag is merely informational. The application code is responsible
for interpreting this flag to properly escape the expression.

### onattributeplaceholder

The `oncontentplaceholder` function will be called each time a placeholder
is encountered within an attribute string value. This event will be emitted
before `onopentag` so by changing the `expression` property of the event,
the resultant attribute can be changed.

Here's an example of modifying the expression based on the `event.escape` flag:

```javascript
onattributeplaceholder: function(event) {
    if (event.escape) {
        event.expression = 'escapeAttr(' + event.expression + ')';
    }
}
```

If the placeholder starts with the "$!{" sequence then `event.escape`
will be `false`.

If the placeholder starts with the "${" sequence then `event.escape` will be
`true` unless the placeholder is nested within another placeholder that is
already escaped.

**EXAMPLE:**

INPUT:

```html
<div class="${data.className}"><div>
```

OUTPUT EVENT:

```javascript
{
    type: 'attributeplaceholder',
    expression: 'data.className',
    escape: true
}
```

**NOTE:**
The `escape` flag is merely informational. The application code is responsible
for interpreting this flag to properly escape the expression. The `expression`
property can be altered by the `onattributeplaceholder` function and the
attribute information emitted via `onopentag` will reflect this change.

### ondtd

The `ondtd` function will be called when the document type declaration
is encountered _anywhere_ in the content.

**EXAMPLE:**

INPUT:

```html
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0//EN">
```

OUTPUT EVENT:

```javascript
{
    type: 'dtd',
    dtd: 'DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0//EN"'
}
```

### ondeclaration

The `ondeclaration` function will be called when an XML declaration
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
    declaration: 'xml version="1.0" encoding="UTF-8"'
}
```

### oncomment

The `oncomment` function will be called when text within `<!--` `-->`
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
    text: 'This is a comment'
}
```

### onerror

The `onerror` function will be called when malformed content is detected.
The most common cause for an error is due to reaching the end of the
input while still parsing an open tag, close tag, XML comment, CDATA section,
DTD, XML declaration, or placeholder.

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
    lineNumber: 1,
    startPos: 0,
    endPos: 9
}
```