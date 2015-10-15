var chai = require('chai');
chai.config.includeStack = true;
require('chai').should();
var expect = require('chai').expect;

var htmljs = require('../');

require('colors');

function parse(text, options, expectedEvents) {

    if (arguments.length === 2) {
        expectedEvents = arguments[1];
        options = undefined;
    }

    var actualEvents = [];

    var listeners = {
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

        oncomment: function(event) {
            actualEvents.push(event);
        },

        onerror: function(event) {
            actualEvents.push(event);
        }
    };

    if (options) {
        for (var key in options) {
            if (options.hasOwnProperty(key)) {
                listeners[key] = options[key];
            }
        }
    }

    var parser = htmljs.createParser(listeners);

    if (Array.isArray(text)) {
        text = text.join('');
    }

    parser.parse(text);

    expect(actualEvents).to.deep.equal(expectedEvents);
}

describe('htmljs parser', function() {

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

        var parser = htmljs.createParser({
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

    describe('XML declarations', function() {
        it('should handle xml declaration <?xml version="1.0" encoding="UTF-8" ?>', function() {
            // <?xml version="1.0" encoding="UTF-8" ?>
            parse([
                '<', '?', 'xml version="1.0" encoding="UTF-8" ?>'
            ], [
                {
                    type: 'declaration',
                    declaration: 'xml version="1.0" encoding="UTF-8" '
                }
            ]);
        });

        it('should handle xml declaration <?xml version="1.0" encoding="UTF-8">', function() {
            parse([
                '<', '?', 'xml version="1.0" encoding="UTF-8">'
            ], [
                {
                    type: 'declaration',
                    declaration: 'xml version="1.0" encoding="UTF-8"'
                }
            ]);
        });
    });

    describe('DTD', function() {
        it('should handle HTML doctype', function() {
            // <?xml version="1.0" encoding="UTF-8" ?>
            parse([
                '<', '!', 'DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0//EN">'
            ], [
                {
                    type: 'dtd',
                    dtd: 'DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0//EN"'
                }
            ]);
        });
    });

    describe('Parsed text content', function() {
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
    });

    describe('Attribute parsing', function() {
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

        it('should handle parsing attributes with simple expressions', function() {
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
        });

        it('should handle parsing attributes with simple expressions that contain ">"', function() {
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
        });

        it('should handle parsing attributes with paranthese delimited expressions and double-quoted strings', function() {
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


        });

        it('should handle parsing attributes with expressions and single-quoted strings', function() {
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
        });

        it('should handle parsing attributes with object expressions', function() {
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
    });

    describe('CDATA', function() {
        it('should handle CDATA', function() {
            parse([
                'BEFORE<![CDATA[<within><!-- just text -->]]>AFTER'
            ], [
                {
                    type: 'text',
                    text: 'BEFORE'
                },
                {
                    type: 'cdata',
                    text: '<within><!-- just text -->'
                },
                {
                    type: 'text',
                    text: 'AFTER'
                }
            ]);
        });
    });

    describe('Stray special characters', function() {
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
    });

    describe('XML comments', function() {
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
                    type: 'comment',
                    comment: '<b></b>'
                },
                {
                    type: 'closetag',
                    name: 'a'
                }
            ]);
        });
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

    describe('Placeholders', function() {
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

        it('should ignore placeholders in XML comments', function() {
            parse([
                '<!-- Copyright ${date} -->'
            ], [
                {
                    type: 'comment',
                    comment: ' Copyright ${date} '
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

        it('should handle placeholder inside attribute placeholder', function() {
            parse([
                '<custom data="${"Hello ${data.name}"}">'
            ], [
                {
                    type: 'opentag',
                    name: 'custom',
                    attributes: [
                        {
                            name: 'data',
                            expression: '""+("Hello "+(data.name)+"")+""'
                        }
                    ]
                }
            ]);
        });

        it('should handle placeholder inside content placeholder', function() {
            parse([
                '${"Hello ${data.name}"}'
            ], [
                {
                    type: 'contentplaceholder',
                    contents: '"Hello "+(data.name)+""',
                    escape: true
                }
            ]);
        });

        it('should allow attribute placeholder contents to be escaped', function() {
            parse([
                '<custom data="${abc}">'
            ], {
                onattributeplaceholder: function(event) {
                    if (event.escape) {
                        event.contents = 'escapeAttr(' + event.contents + ')';
                    }
                }
            }, [
                {
                    type: 'opentag',
                    name: 'custom',
                    attributes: [
                        {
                            name: 'data',
                            expression: '""+(escapeAttr(abc))+""'
                        }
                    ]
                }
            ]);
        });
    });

    describe('Static text attributes', function() {
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
    });

    describe('Element and element arguments', function() {
        it('should recognize arguments to element with whitespace after tag name', function() {
            parse([
                '<for (x in y)>'
            ], [
                {
                    type: 'opentag',
                    name: 'for',
                    arguments: [
                        '(x in y)'
                    ],
                    attributes: []
                }
            ]);
        });

        it('should recognize arguments to element without whitespace after tag name', function() {
            parse([
                '<for(x in y)>'
            ], [
                {
                    type: 'opentag',
                    name: 'for',
                    arguments: [
                        '(x in y)'
                    ],
                    attributes: []
                }
            ]);
        });

        it('should recognize arguments to element that also contain strings with placeholders', function() {
            parse([
                '<for (x in ["Hello ${name}!", "(World)"])>'
            ], [
                {
                    type: 'opentag',
                    name: 'for',
                    arguments: [
                        '(x in ["Hello "+(name)+"!", "(World)"])'
                    ],
                    attributes: []
                }
            ]);
        });

        it('should recognize arguments for attributes with whitespace', function() {
            parse([
                '<div if (x > y)>'
            ], [
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
            ]);
        });

        it('should recognize arguments for attributes without whitespace', function() {
            parse([
                '<div if(x > y)>'
            ], [
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
            ]);
        });

        it('should recognize arguments for both element and attributes', function() {
            parse([
                '<for(var i = 0; i < 10; i++) if(x > y)>'
            ], [
                {
                    type: 'opentag',
                    name: 'for',
                    arguments: [
                        '(var i = 0; i < 10; i++)'
                    ],
                    attributes: [
                        {
                            name: 'if',
                            arguments: [
                                '(x > y)'
                            ]
                        }
                    ]
                }
            ]);
        });
    });

    describe('EOF handling', function() {
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
                    type: 'error',
                    code: 'MALFORMED_OPEN_TAG',
                    message: 'EOF reached while parsing open tag.',
                    lineNumber: 1,
                    startPos:3,
                    endPos: 5
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
                    type: 'error',
                    code: 'MALFORMED_OPEN_TAG',
                    message: 'EOF reached while parsing open tag.',
                    lineNumber: 1,
                    startPos:3,
                    endPos: 14
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
                    type: 'error',
                    code: 'MALFORMED_OPEN_TAG',
                    message: 'EOF reached while parsing open tag.',
                    lineNumber: 1,
                    startPos:3,
                    endPos: 34
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
                    type: 'error',
                    code: 'MALFORMED_OPEN_TAG',
                    message: 'EOF reached while parsing open tag.',
                    lineNumber: 1,
                    startPos:3,
                    endPos: 33
                }
            ]);

            parse([
                '<a href="'
            ], [
                {
                    type: 'error',
                    code: 'MALFORMED_OPEN_TAG',
                    message: 'EOF reached while parsing open tag.',
                    lineNumber: 1,
                    startPos: 0,
                    endPos: 9
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

        it('should handle EOF while parsing HTML doctype', function() {
            parse([
                '<', '!', 'DOCTYPE html PUBLIC'
            ], [
                {
                    type: 'error',
                    code: 'MALFORMED_DTD',
                    message: 'EOF reached while parsing DTD.',
                    lineNumber: 1,
                    startPos: 0,
                    endPos: 21
                }
            ]);
        });

        it('should handle EOF while parsing xml declaration', function() {
            parse([
                '<', '?', 'xml version="1.0"'
            ], [
                {
                    type: 'error',
                    code: 'MALFORMED_DECLARATION',
                    message: 'EOF reached while parsing declaration.',
                    lineNumber: 1,
                    startPos: 0,
                    endPos: 19
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

        it('should handle EOF while parsing non-escaped content placeholder', function() {
            parse([
                'Hello\n$!{abc'
            ], [
                {
                    type: 'text',
                    text: 'Hello\n'
                },
                {
                    type: 'error',
                    code: 'MALFORMED_PLACEHOLDER',
                    message: 'EOF reached while parsing placeholder.',
                    lineNumber: 2,
                    startPos:6,
                    endPos: 12
                }
            ]);
        });

        it('should handle EOF while parsing escaped content placeholder', function() {
            parse([
                'Hello ${abc'
            ], [
                {
                    type: 'text',
                    text: 'Hello '
                },
                {
                    type: 'error',
                    code: 'MALFORMED_PLACEHOLDER',
                    message: 'EOF reached while parsing placeholder.',
                    lineNumber: 1,
                    startPos:6,
                    endPos: 11
                }
            ]);
        });

        it('should handle EOF while parsing non-escaped <script> content placeholder', function() {
            parse([
                '<script>Hello $!{abc'
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
                    type: 'error',
                    code: 'MALFORMED_PLACEHOLDER',
                    message: 'EOF reached while parsing placeholder.',
                    lineNumber: 1,
                    startPos:14,
                    endPos: 20
                }
            ]);
        });

        it('should handle EOF while parsing escaped <script> content placeholder', function() {
            parse([
                '<script>Hello ${abc'
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
                    type: 'error',
                    code: 'MALFORMED_PLACEHOLDER',
                    message: 'EOF reached while parsing placeholder.',
                    lineNumber: 1,
                    startPos:14,
                    endPos: 19
                }
            ]);
        });

        it('should handle EOF while parsing delimited expression inside placeholder', function() {
            parse([
                'Hello ${('
            ], [
                {
                    type: 'text',
                    text: 'Hello '
                },
                {
                    type: 'error',
                    code: 'MALFORMED_PLACEHOLDER',
                    message: 'EOF reached while parsing placeholder.',
                    lineNumber: 1,
                    startPos: 6,
                    endPos: 9
                }
            ]);
        });

        it('should handle EOF while parsing attributes with arguments', function() {
            parse([
                '<div if(a==b'
            ], [
                {
                    type: 'error',
                    code: 'MALFORMED_OPEN_TAG',
                    message: 'EOF reached while parsing open tag.',
                    lineNumber: 1,
                    startPos:0,
                    endPos: 12
                }
            ]);
        });
    });
});
