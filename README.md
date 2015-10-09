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
<for(a in b)>
<if(a in b)>
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

    onbegincomment: function(event) {
        // Begin comment: <!--
    },

    onendcomment: function(event) {
        // End comment: -->
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



## Parsing Events

- `ontext`
- `oncontentplaceholder`
- `onattributeplaceholder`
- `oncdata`
- `onopentag`
- `onclosetag`
- `ondtd`
- `ondeclaration`
- `onbegincomment`
- `onendcomment`
- `oncomment`
- `onerror`