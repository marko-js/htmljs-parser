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

## Parsing Events

- `opentag`
- `closetag`
- `text`
- `begincdata`
- `cdata`
- `endcdata`
- `begincomment`
- `comment`
- `endcomment`
- `placeholder`