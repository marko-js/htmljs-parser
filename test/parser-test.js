var chai = require('chai');
chai.config.includeStack = true;
require('chai').should();
var expect = require('chai').expect;

var jsxml = require('../');

require('colors');

function parse(text, expectedEvents) {
    var actualEvents = [];
    var parser = jsxml.createParser({
        ontext: function(event) {
            actualEvents.push(event);
        },

        oncontentplaceholder: function(event) {
            actualEvents.push(event);
        },

        onattributeplaceholder: function(event) {
            // ignore this event because it is
            // emitted to give listeners a chance
            // to transform content
        },

        oncdata: function(event) {
            actualEvents.push(event);
        },

        onopentag: function(event) {
            actualEvents.push(event);
        },

        onclosetag: function(event) {
            actualEvents.push(event);
        },

        ondtd: function(event) {
            actualEvents.push(event);
        },

        ondeclaration: function(event) {
            actualEvents.push(event);
        },

        onbegincomment: function(event) {
            actualEvents.push(event);
        },

        onendcomment: function(event) {
            actualEvents.push(event);
        },

        oncomment: function(event) {
            actualEvents.push(event);
        },

        escape: function(expression) {
            return 'escapeXml(' + expression + ')';
        }
    });

    if (Array.isArray(text)) {
        text = text.join('');
    }

    parser.parse(text);

    expect(actualEvents).to.deep.equal(expectedEvents);
}

describe('htmljs parser', function() {

    it('should handle xml declaration <?xml version="1.0" encoding="UTF-8" ?>', function() {
        // <?xml version="1.0" encoding="UTF-8" ?>
        parse([
            '<', '?', 'xml version="1.0" encoding="UTF-8" ?>'
        ], [
            {
                type: 'declaration',
                name: 'xml version="1.0" encoding="UTF-8" '
            }
        ]);
    });

    it('should handle xml declaration <?xml version="1.0" encoding="UTF-8">', function() {
        parse([
            '<', '?', 'xml version="1.0" encoding="UTF-8">'
        ], [
            {
                type: 'declaration',
                name: 'xml version="1.0" encoding="UTF-8"'
            }
        ]);
    });

    it('should handle EOF while parsing xml declaration', function() {
        parse([
            '<', '?', 'xml version="1.0"'
        ], [
            {
                type: 'text',
                text: '<?xml version="1.0"'
            }
        ]);
    });

    it('should handle HTML doctype', function() {
        // <?xml version="1.0" encoding="UTF-8" ?>
        parse([
            '<', '!', 'DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0//EN">'
        ], [
            {
                type: 'dtd',
                name: 'DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0//EN"'
            }
        ]);
    });

    it('should handle EOF while parsing HTML doctype', function() {
        parse([
            '<', '!', 'DOCTYPE html PUBLIC'
        ], [
            {
                type: 'text',
                text: '<!DOCTYPE html PUBLIC'
            }
        ]);
    });

    it('should handle script tag', function() {
        var scriptInnerText = [
            '// line comment within <script>\n',
            '/* block comment within <script> */',
            '"string within \\\"<script>\\\""',
            '\'string within \\\'<script>\\\'\''
        ].join('');

        parse([
            '<script>',
            scriptInnerText,
            '</script>'
        ], [
            {
                type: 'opentag',
                name: 'script',
                attributes: []
            },
            {
                type: 'text',
                text: scriptInnerText
            },
            {
                type: 'closetag',
                name: 'script'
            }
        ]);
    });

    it('should handle closing script tag after single-line comment', function() {
        parse([
            '<script>// this is a comment</script>'
        ], [
            {
                type: 'opentag',
                name: 'script',
                attributes: []
            },
            {
                type: 'text',
                text: '// this is a comment'
            },
            {
                type: 'closetag',
                name: 'script'
            }
        ]);
    });

    it('should handle EOF while parsing script tag', function() {
        var scriptInnerText = [
            '// line comment within <script>\n',
            '/* block comment within <script> */',
            '"string within \\\"<script>\\\""',
            '\'string within \\\'<script>\\\'\''
        ].join('');

        parse([
            '<script a=b>',
            scriptInnerText
        ], [
            {
                type: 'opentag',
                name: 'script',
                attributes: [
                    {
                        name: 'a',
                        expression: 'b'
                    }
                ]
            },
            {
                type: 'text',
                text: scriptInnerText
            }
        ]);
    });

    it('should handle parsing element with attribute that contains multi-line comment', function() {
        parse([
            '<a a=123+456/* test */ b=a+\'123\'>test</a>'
        ], [
            {
                type: 'opentag',
                name: 'a',
                attributes: [
                    {
                        name: 'a',
                        expression: '123+456/* test */'
                    },
                    {
                        name: 'b',
                        expression: 'a+\'123\''
                    }
                ]
            },
            {
                type: 'text',
                text: 'test'
            },
            {
                type: 'closetag',
                name: 'a'
            }
        ]);
    });

    it('should handle parsing element with complex attributes', function() {
        parse([
            '<a a=123+256 b c= d=(a + (1/2) /* comment */)>test</a>'
        ], [
            {
                type: 'opentag',
                name: 'a',
                attributes: [
                    {
                        name: 'a',
                        expression: '123+256'
                    },
                    {
                        name: 'b'
                    },
                    {
                        name: 'c',
                        expression: ''
                    },
                    {
                        name: 'd',
                        expression: '(a + (1/2) /* comment */)'
                    }
                ]
            },
            {
                type: 'text',
                text: 'test'
            },
            {
                type: 'closetag',
                name: 'a'
            }
        ]);
    });

    it('should handle parsing element with attribute with no value', function() {
        parse([
            '<a b>test</a>'
        ], [
            {
                type: 'opentag',
                name: 'a',
                attributes: [
                    {
                        name: 'b'
                    }
                ]
            },
            {
                type: 'text',
                text: 'test'
            },
            {
                type: 'closetag',
                name: 'a'
            }
        ]);
    });

    it('should handle parsing attributes with expressions', function() {
        parse([
            '<a a=1/2>test</a>'
        ], [
            {
                type: 'opentag',
                name: 'a',
                attributes: [
                    {
                        name: 'a',
                        expression: '1/2'
                    }
                ]
            },
            {
                type: 'text',
                text: 'test'
            },
            {
                type: 'closetag',
                name: 'a'
            }
        ]);

        parse([
            '<a a=1>2>test</a>'
        ], [
            {
                type: 'opentag',
                name: 'a',
                attributes: [
                    {
                        name: 'a',
                        expression: '1'
                    }
                ]
            },
            {
                type: 'text',
                text: '2>test'
            },
            {
                type: 'closetag',
                name: 'a'
            }
        ]);

        parse([
            '<a data=((a-b)/2 + ")")></a>'
        ], [
            {
                type: 'opentag',
                name: 'a',
                attributes: [
                    {
                        name: 'data',
                        expression: '((a-b)/2 + ")")'
                    }
                ]
            },
            {
                type: 'closetag',
                name: 'a'
            }
        ]);



        parse([
            '<a data=((a-b)/2 + \')\')></a>'
        ], [
            {
                type: 'opentag',
                name: 'a',
                attributes: [
                    {
                        name: 'data',
                        expression: '((a-b)/2 + \')\')'
                    }
                ]
            },
            {
                type: 'closetag',
                name: 'a'
            }
        ]);

        parse([
            '<a data={\n' +
            '    "a": "{b}"\n',
            '}></a>'
        ], [
            {
                type: 'opentag',
                name: 'a',
                attributes: [
                    {
                        name: 'data',
                        expression: '{\n    \"a\": \"{b}\"\n}'
                    }
                ]
            },
            {
                type: 'closetag',
                name: 'a'
            }
        ]);
    });

    it('should handle parsing attributes without delimiters', function() {
        parse([
            '<a data=123"abc"></a>'
        ], [
            {
                type: 'opentag',
                name: 'a',
                attributes: [
                    {
                        name: 'data',
                        expression: '123"abc"'
                    }
                ]
            },
            {
                type: 'closetag',
                name: 'a'
            }
        ]);

        parse([
            '<a data=123 data=abc></a>'
        ], [
            {
                type: 'opentag',
                name: 'a',
                attributes: [
                    {
                        name: 'data',
                        expression: '123'
                    },
                    {
                        name: 'data',
                        expression: 'abc'
                    }
                ]
            },
            {
                type: 'closetag',
                name: 'a'
            }
        ]);
    });

    it('should handle parsing element with stray /', function() {
        parse([
            '<a / >test</a>'
        ], [
            {
                type: 'opentag',
                name: 'a',
                attributes: []
            },
            {
                type: 'text',
                text: 'test'
            },
            {
                type: 'closetag',
                name: 'a'
            }
        ]);
    });

    it('should handle EOF while parsing element', function() {
        parse([
            '<a><b'
        ], [
            {
                type: 'opentag',
                name: 'a',
                attributes: []
            },
            {
                type: 'text',
                text: '<b'
            }
        ]);

        parse([
            '<a><b selected'
        ], [
            {
                type: 'opentag',
                name: 'a',
                attributes: []
            },
            {
                type: 'text',
                text: '<b selected'
            }
        ]);

        parse([
            '<a><b selected something= test=123'
        ], [
            {
                type: 'opentag',
                name: 'a',
                attributes: []
            },
            {
                type: 'text',
                text: '<b selected something= test=123'
            }
        ]);

        parse([
            '<a><b selected something= test=/*'
        ], [
            {
                type: 'opentag',
                name: 'a',
                attributes: []
            },
            {
                type: 'text',
                text: '<b selected something= test=/*'
            }
        ]);
    });

    it('should handle CDATA', function() {
        parse([
            'BEFORE<![CDATA[<within><!-- just text -->]]>AFTER'
        ], [
            {
                type: 'text',
                text: 'BEFORE'
            },
            {
                type: 'text',
                text: '<within><!-- just text -->',
                cdata: true
            },
            {
                type: 'text',
                text: 'AFTER'
            }
        ]);
    });

    it('should handle stray "<" and ">"', function() {
        parse([
            '<a>1 < > <> </> 2<</a>'
        ], [
            {
                type: 'opentag',
                name: 'a',
                attributes: []
            },
            {
                type: 'text',
                text: '1 '
            },
            {
                type: 'text',
                text: '< '
            },
            {
                type: 'text',
                text: '> '
            },
            {
                type: 'text',
                text: '<>'
            },
            {
                type: 'text',
                text: ' '
            },
            {
                type: 'text',
                text: '</>'
            },
            {
                type: 'text',
                text: ' 2'
            },
            {
                type: 'text',
                text: '<'
            },
            {
                type: 'closetag',
                name: 'a'
            }
        ]);
    });

    it('should handle XML comments', function() {
        parse([
            '<a><!--<b></b>--></a>'
        ], [
            {
                type: 'opentag',
                name: 'a',
                attributes: []
            },
            {
                type: 'begincomment'
            },
            {
                type: 'comment',
                comment: '<b></b>'
            },
            {
                type: 'endcomment'
            },
            {
                type: 'closetag',
                name: 'a'
            }
        ]);
    });

    it('should handle self-closing tags', function() {
        parse([
            '<a />'
        ], [
            {
                type: 'opentag',
                name: 'a',
                attributes: [],
                selfClosed: true
            },
            {
                type: 'closetag',
                name: 'a',
                selfClosed: true
            }
        ]);
    });

    it('should handle style tag', function() {
        var styleInnerText = [
            '/* block comment within <style> */',
            '"string within \\\"<style>\\\""',
            '\'string within \\\'<style>\\\'\''
        ].join('');

        parse([
            '<style>',
            styleInnerText,
            '</style>'
        ], [
            {
                type: 'opentag',
                name: 'style',
                attributes: []
            },
            {
                type: 'text',
                text: styleInnerText
            },
            {
                type: 'closetag',
                name: 'style'
            }
        ]);
    });

    it('should handle EOF while parsing style tag', function() {
        var styleInnerText = [
            '/* block comment within <style> */',
            '"string within \\\"<style>\\\""',
            '\'string within \\\'<style>\\\'\''
        ].join('');

        parse([
            '<style a=b>',
            styleInnerText
        ], [
            {
                type: 'opentag',
                name: 'style',
                attributes: [
                    {
                        name: 'a',
                        expression: 'b'
                    }
                ]
            },
            {
                type: 'text',
                text: styleInnerText
            }
        ]);
    });

    it('should handle placeholder expressions in normal text with surrounding curly braces', function() {
        parse([
            'Hello ${xyz}!'
        ], [
            {
                type: 'text',
                text: 'Hello '
            },
            {
                type: 'contentplaceholder',
                contents: 'xyz',
                escape: true
            },
            {
                type: 'text',
                text: '!'
            }
        ]);
    });

    it('should handle placeholder expressions in scripts with surrounding curly braces', function() {
        parse([
            '<script>Hello ${xyz}!</script>'
        ], [
            {
                type: 'opentag',
                name: 'script',
                attributes: []
            },
            {
                type: 'text',
                text: 'Hello '
            },
            {
                type: 'contentplaceholder',
                contents: 'xyz',
                escape: true
            },
            {
                type: 'text',
                text: '!'
            },
            {
                type: 'closetag',
                name: 'script'
            }
        ]);
    });

    it('should handle placeholder expressions in strings in scripts with surrounding curly braces', function() {
        parse([
            '<script>alert("Hello ${xyz}!")</script>'
        ], [
            {
                type: 'opentag',
                name: 'script',
                attributes: []
            },
            {
                type: 'text',
                text: 'alert("Hello '
            },
            {
                type: 'contentplaceholder',
                contents: 'xyz',
                escape: true
            },
            {
                type: 'text',
                text: '!")'
            },
            {
                type: 'closetag',
                name: 'script'
            }
        ]);
    });

    it('should handle placeholder expressions within non-delimited attributes', function() {
        parse([
            '<custom name="Hello ${name}!">TEST</custom>'
        ], [
            {
                type: 'opentag',
                name: 'custom',
                attributes: [
                    {
                        name: 'name',
                        expression: '"Hello "+(name)+"!"'
                    }
                ]
            },
            {
                type: 'text',
                text: 'TEST'
            },
            {
                type: 'closetag',
                name: 'custom'
            }
        ]);
    });

    it('should handle placeholder expressions within delimited expression attributes', function() {
        parse([
            '<custom name=("Hello ${name}!")>TEST</custom>'
        ], [
            {
                type: 'opentag',
                name: 'custom',
                attributes: [
                    {
                        name: 'name',
                        expression: '("Hello "+(name)+"!")'
                    }
                ]
            },
            {
                type: 'text',
                text: 'TEST'
            },
            {
                type: 'closetag',
                name: 'custom'
            }
        ]);
    });

    it('should handle placeholder expressions within string within delimited expression attributes', function() {
        parse([
            '<custom name="${\'some text\'}">TEST</custom>'
        ], [
            {
                type: 'opentag',
                name: 'custom',
                attributes: [
                    {
                        name: 'name',
                        expression: '""+(\'some text\')+""',
                    }
                ]
            },
            {
                type: 'text',
                text: 'TEST'
            },
            {
                type: 'closetag',
                name: 'custom'
            }
        ]);
    });

    it('should handle multi-line string attributes', function() {
        parse([
            '<div data="\nabc\n124">'
        ], [
            {
                type: 'opentag',
                name: 'div',
                attributes: [
                    {
                        name: 'data',
                        expression: '"\nabc\n124"',
                        staticText: '\nabc\n124'
                    }
                ]
            }
        ]);
    });

    it('should handle placeholders in XML comments', function() {
        parse([
            '<!-- Copyright ${date} -->'
        ], [
            {
                type: 'begincomment'
            },
            {
                type: 'comment',
                comment: ' Copyright '
            },
            {
                type: 'contentplaceholder',
                contents: 'date',
                escape: true
            },
            {
                type: 'comment',
                comment: ' '
            },
            {
                type: 'endcomment'
            }
        ]);
    });

    it('should handle placeholders in JavaScript single-line comments', function() {
        parse([
            '<script>// Copyright ${date}\n</script>'
        ], [
            {
                type: 'opentag',
                name: 'script',
                attributes: []
            },
            {
                type: 'text',
                text: '// Copyright '
            },
            {
                type: 'contentplaceholder',
                contents: 'date',
                escape: true
            },
            {
                type: 'text',
                text: '\n'
            },
            {
                type: 'closetag',
                name: 'script'
            }
        ]);
    });

    it('should handle placeholders in JavaScript multi-line comments', function() {
        parse([
            '<script>/* Copyright $!{date} */</script>'
        ], [
            {
                type: 'opentag',
                name: 'script',
                attributes: []
            },
            {
                type: 'text',
                text: '/* Copyright '
            },
            {
                type: 'contentplaceholder',
                contents: 'date',
                escape: false
            },
            {
                type: 'text',
                text: ' */'
            },
            {
                type: 'closetag',
                name: 'script'
            }
        ]);
    });

    it('should handle placeholders in string attributes', function() {
        parse([
            '<custom data="${\nabc\n}">'
        ], [
            {
                type: 'opentag',
                name: 'custom',
                attributes: [
                    {
                        name: 'data',
                        expression: '""+(\nabc\n)+""'
                    }
                ]
            }
        ]);
    });

    it('should handle placeholders in complex attribute', function() {
        parse([
            '<custom data=("Hello $!{name}!" + " This is a test.")>'
        ], [
            {
                type: 'opentag',
                name: 'custom',
                attributes: [
                    {
                        name: 'data',
                        expression: '("Hello "+(name)+"!" + " This is a test.")'
                    }
                ]
            }
        ]);
    });

    it('should handle simple placeholders in string attributes', function() {
        parse([
            '<custom data="${abc}">'
        ], [
            {
                type: 'opentag',
                name: 'custom',
                attributes: [
                    {
                        name: 'data',
                        expression: '""+(abc)+""'
                    }
                ]
            }
        ]);
    });

    it('should recognize static text attributes', function() {
        parse([
            '<div class="simple">'
        ], [
            {
                type: 'opentag',
                name: 'div',
                attributes: [
                    {
                        name: 'class',
                        expression: '"simple"',
                        staticText: 'simple'
                    }
                ]
            }
        ]);
    });

    it('should not recognize static numeric attributes', function() {
        parse([
            '<div class=123>'
        ], [
            {
                type: 'opentag',
                name: 'div',
                attributes: [
                    {
                        name: 'class',
                        expression: '123'
                    }
                ]
            }
        ]);
    });

    it('should follow instructions on how to parse contents of tag', function() {
        var actualEvents = [];

        var opentagHandlers = {
            html: function(event) {
                this.enterHtmlContentState();
            },

            javascript: function(event) {
                this.enterJsContentState();
            },

            css: function(event) {
                this.enterCssContentState();
            },

            text: function(event) {
                this.enterStaticTextContentState();
            },

            parsedtext: function(event) {
                this.enterParsedTextContentState();
            }
        };

        var parser = jsxml.createParser({
            onopentag: function(event) {
                actualEvents.push(event);
                var handler = opentagHandlers[event.name];
                if (handler) {
                    handler.call(this, event);
                } else {
                    throw new Error('No opentag handler for tag ' + event.name);
                }
            },

            ontext: function(event) {
                actualEvents.push(event);
            },

            oncontentplaceholder: function(event) {
                actualEvents.push(event);
            },

            onattributeplaceholder: function(event) {
                // ignore this one
            },

            oncdata: function(event) {
                actualEvents.push(event);
            },

            onclosetag: function(event) {
                actualEvents.push(event);
            },

            ondtd: function(event) {
                actualEvents.push(event);
            },

            ondeclaration: function(event) {
                actualEvents.push(event);
            },

            onbegincomment: function(event) {
                actualEvents.push(event);
            },

            onendcomment: function(event) {
                actualEvents.push(event);
            },

            oncomment: function(event) {
                actualEvents.push(event);
            }
        });

        parser.parse([
            '<html>',

            // The <javascript> tag will be parsed in JavaScript mode
            '<javascript>/* This <javascript> is ignored */ // this is javascript <a></a></javascript>',

            // The <css> tag will be parsed in CSS mode
            '<css>/* CSS */\n.a {image: url("<a></a>")}</css>',

            // The <text> tag will be parsed as raw text
            '<text>This is raw ${text} so nothing should be parsed</text>',

            // The <parsedtext> tag will be parsed as raw text
            '<parsedtext>This is parsed ${text}!</parsedtext>',

            '</html>'
        ]);

        expect(actualEvents).to.deep.equal([
            {
                type: 'opentag',
                name: 'html',
                attributes: []
            },
            {
                type: 'opentag',
                name: 'javascript',
                attributes: []
            },
            {
                type: 'text',
                text: '/* This <javascript> is ignored */ // this is javascript <a></a>'
            },
            {
                type: 'closetag',
                name: 'javascript'
            },
            {
                type: 'opentag',
                name: 'css',
                attributes: []
            },
            {
                type: 'text',
                text: '/* CSS */\n.a {image: url("<a></a>")}'
            },
            {
                type: 'closetag',
                name: 'css'
            },
            {
                type: 'opentag',
                name: 'text',
                attributes: []
            },
            {
                type: 'text',
                text: 'This is raw ${text} so nothing should be parsed'
            },
            {
                type: 'closetag',
                name: 'text'
            },
            {
                type: 'opentag',
                name: 'parsedtext',
                attributes: []
            },
            {
                type: 'text',
                text: 'This is parsed '
            },
            {
                type: 'contentplaceholder',
                contents: 'text',
                escape: true
            },
            {
                type: 'text',
                text: '!'
            },
            {
                type: 'closetag',
                name: 'parsedtext'
            },
            {
                type: 'closetag',
                name: 'html'
            }
        ]);
    });
});
