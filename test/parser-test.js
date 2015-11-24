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

        onnestedcontentplaceholder: function(event) {
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

    var parser = htmljs.createNonValidatingParser(listeners);

    if (Array.isArray(text)) {
        text = text.join('');
    }

    parser.parse(text);

    expect(actualEvents).to.deep.equal(expectedEvents);
}

describe('htmljs parser', function() {

    it('should follow instructions on how to parse expression of tag', function() {
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

        var parser = htmljs.createNonValidatingParser({
            onopentag: function(event) {
                var tagName = event.tagName;
                actualEvents.push(event);
                var handler = opentagHandlers[tagName];
                if (handler) {
                    handler.call(this, event);
                } else {
                    throw new Error('No opentag handler for tag ' + tagName);
                }
            },

            ontext: function(event) {
                actualEvents.push(event);
            },

            oncontentplaceholder: function(event) {
                actualEvents.push(event);
            },

            onnestedcontentplaceholder: function(event) {
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
                tagName: 'html',
                attributes: []
            },
            {
                type: 'opentag',
                tagName: 'javascript',
                attributes: []
            },
            {
                type: 'text',
                text: '/* This <javascript> is ignored */ // this is javascript <a></a>'
            },
            {
                type: 'closetag',
                tagName: 'javascript'
            },
            {
                type: 'opentag',
                tagName: 'css',
                attributes: []
            },
            {
                type: 'text',
                text: '/* CSS */\n.a {image: url("<a></a>")}'
            },
            {
                type: 'closetag',
                tagName: 'css'
            },
            {
                type: 'opentag',
                tagName: 'text',
                attributes: []
            },
            {
                type: 'text',
                text: 'This is raw ${text} so nothing should be parsed'
            },
            {
                type: 'closetag',
                tagName: 'text'
            },
            {
                type: 'opentag',
                tagName: 'parsedtext',
                attributes: []
            },
            {
                type: 'text',
                text: 'This is parsed '
            },
            {
                type: 'contentplaceholder',
                expression: 'text',
                escape: true
            },
            {
                type: 'text',
                text: '!'
            },
            {
                type: 'closetag',
                tagName: 'parsedtext'
            },
            {
                type: 'closetag',
                tagName: 'html'
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
                    tagName: 'script',
                    attributes: []
                },
                {
                    type: 'text',
                    text: scriptInnerText
                },
                {
                    type: 'closetag',
                    tagName: 'script'
                }
            ]);
        });

        it('should handle closing script tag after single-line comment', function() {
            parse([
                '<script>// this is a comment</script>'
            ], [
                {
                    type: 'opentag',
                    tagName: 'script',
                    attributes: []
                },
                {
                    type: 'text',
                    text: '// this is a comment'
                },
                {
                    type: 'closetag',
                    tagName: 'script'
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
                    tagName: 'style',
                    attributes: []
                },
                {
                    type: 'text',
                    text: styleInnerText
                },
                {
                    type: 'closetag',
                    tagName: 'style'
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
                    tagName: 'a',
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
                    tagName: 'a'
                }
            ]);
        });

        it('should handle parsing element with complex attributes', function() {
            parse([
                '<a a=123+256 b c= d=(a + (1/2) /* comment */)>test</a>'
            ], [
                {
                    type: 'opentag',
                    tagName: 'a',
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
                            expression: '',
                            literalValue: ''
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
                    tagName: 'a'
                }
            ]);
        });

        it('should handle parsing element with attribute with no value', function() {
            parse([
                '<a b>test</a>'
            ], [
                {
                    type: 'opentag',
                    tagName: 'a',
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
                    tagName: 'a'
                }
            ]);
        });

        it('should handle parsing attributes with simple expressions', function() {
            parse([
                '<a a=1/2>test</a>'
            ], [
                {
                    type: 'opentag',
                    tagName: 'a',
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
                    tagName: 'a'
                }
            ]);
        });

        it('should handle parsing attributes with simple expressions that contain ">"', function() {
            parse([
                '<a a=1>2>test</a>'
            ], [
                {
                    type: 'opentag',
                    tagName: 'a',
                    attributes: [
                        {
                            name: 'a',
                            expression: '1',
                            literalValue: 1
                        }
                    ]
                },
                {
                    type: 'text',
                    text: '2>test'
                },
                {
                    type: 'closetag',
                    tagName: 'a'
                }
            ]);
        });

        it('should handle parsing attributes with paranthese delimited expressions and double-quoted strings', function() {
            parse([
                '<a data=((a-b)/2 + ")")></a>'
            ], [
                {
                    type: 'opentag',
                    tagName: 'a',
                    attributes: [
                        {
                            name: 'data',
                            expression: '((a-b)/2 + ")")'
                        }
                    ]
                },
                {
                    type: 'closetag',
                    tagName: 'a'
                }
            ]);


        });

        it('should handle parsing attributes with expressions and single-quoted strings', function() {
            parse([
                '<a data=((a-b)/2 + \')\')></a>'
            ], [
                {
                    type: 'opentag',
                    tagName: 'a',
                    attributes: [
                        {
                            name: 'data',
                            expression: '((a-b)/2 + \')\')'
                        }
                    ]
                },
                {
                    type: 'closetag',
                    tagName: 'a'
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
                    tagName: 'a',
                    attributes: [
                        {
                            name: 'data',
                            expression: '{\n    \"a\": \"{b}\"\n}'
                        }
                    ]
                },
                {
                    type: 'closetag',
                    tagName: 'a'
                }
            ]);
        });

        it('should handle parsing attributes without delimiters', function() {
            parse([
                '<a data=123"abc"></a>'
            ], [
                {
                    type: 'opentag',
                    tagName: 'a',
                    attributes: [
                        {
                            name: 'data',
                            expression: '123"abc"'
                        }
                    ]
                },
                {
                    type: 'closetag',
                    tagName: 'a'
                }
            ]);

            parse([
                '<a data=123 data=abc></a>'
            ], [
                {
                    type: 'opentag',
                    tagName: 'a',
                    attributes: [
                        {
                            name: 'data',
                            expression: '123',
                            literalValue: 123
                        },
                        {
                            name: 'data',
                            expression: 'abc'
                        }
                    ]
                },
                {
                    type: 'closetag',
                    tagName: 'a'
                }
            ]);
        });

        it('should handle multi-line string attributes', function() {
            parse([
                '<div data="\nabc\n124">'
            ], [
                {
                    type: 'opentag',
                    tagName: 'div',
                    attributes: [
                        {
                            name: 'data',
                            expression: '"\nabc\n124"',
                            literalValue: '\nabc\n124'
                        }
                    ]
                }
            ]);
        });

        describe('Attribute Literal Values', function() {
            it('should recognize true literal', function() {
                parse([
                    '<div data=true>'
                ], [
                    {
                        type: 'opentag',
                        tagName: 'div',
                        attributes: [
                            {
                                name: 'data',
                                expression: 'true',
                                literalValue: true
                            }
                        ]
                    }
                ]);
            });

            it('should recognize false literal', function() {
                parse([
                    '<div data=false>'
                ], [
                    {
                        type: 'opentag',
                        tagName: 'div',
                        attributes: [
                            {
                                name: 'data',
                                expression: 'false',
                                literalValue: false
                            }
                        ]
                    }
                ]);
            });

            it('should recognize undefined literal', function() {
                parse([
                    '<div data=undefined>'
                ], [
                    {
                        type: 'opentag',
                        tagName: 'div',
                        attributes: [
                            {
                                name: 'data',
                                expression: 'undefined',
                                literalValue: undefined
                            }
                        ]
                    }
                ]);
            });

            it('should recognize null literal', function() {
                parse([
                    '<div data=null>'
                ], [
                    {
                        type: 'opentag',
                        tagName: 'div',
                        attributes: [
                            {
                                name: 'data',
                                expression: 'null',
                                literalValue: null
                            }
                        ]
                    }
                ]);
            });

            it('should recognize number literal', function() {
                parse([
                    '<div data=1 data=.5 data=1.5 data=1.5e10 data=1.5e+10 data=1.5e-10 data=-1 data=-.5 data=-1.5 data=-1.5e10 data=-1.5e+10 data=-1.5e-10>'
                ], [
                    {
                        type: 'opentag',
                        tagName: 'div',
                        attributes: [
                            {
                                name: 'data',
                                expression: '1',
                                literalValue: 1
                            },
                            {
                                name: 'data',
                                expression: '.5',
                                literalValue: .5
                            },
                            {
                                name: 'data',
                                expression: '1.5',
                                literalValue: 1.5
                            },
                            {
                                name: 'data',
                                expression: '1.5e10',
                                literalValue: 1.5e10
                            },
                            {
                                name: 'data',
                                expression: '1.5e+10',
                                literalValue: 1.5e+10
                            },
                            {
                                name: 'data',
                                expression: '1.5e-10',
                                literalValue: 1.5e-10
                            },
                            {
                                name: 'data',
                                expression: '-1',
                                literalValue: -1
                            },
                            {
                                name: 'data',
                                expression: '-.5',
                                literalValue: -.5
                            },
                            {
                                name: 'data',
                                expression: '-1.5',
                                literalValue: -1.5
                            },
                            {
                                name: 'data',
                                expression: '-1.5e10',
                                literalValue: -1.5e10
                            },
                            {
                                name: 'data',
                                expression: '-1.5e+10',
                                literalValue: -1.5e+10
                            },
                            {
                                name: 'data',
                                expression: '-1.5e-10',
                                literalValue: -1.5e-10
                            }
                        ]
                    }
                ]);
            });
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
                    tagName: 'a',
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
                    tagName: 'a'
                }
            ]);
        });

        it('should handle parsing element with stray /', function() {
            parse([
                '<a / >test</a>'
            ], [
                {
                    type: 'opentag',
                    tagName: 'a',
                    attributes: []
                },
                {
                    type: 'text',
                    text: 'test'
                },
                {
                    type: 'closetag',
                    tagName: 'a'
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
                    tagName: 'a',
                    attributes: []
                },
                {
                    type: 'comment',
                    comment: '<b></b>'
                },
                {
                    type: 'closetag',
                    tagName: 'a'
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
                tagName: 'a',
                attributes: [],
                selfClosed: true
            },
            {
                type: 'closetag',
                tagName: 'a',
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
                    expression: 'xyz',
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
                    tagName: 'script',
                    attributes: []
                },
                {
                    type: 'text',
                    text: 'Hello '
                },
                {
                    type: 'contentplaceholder',
                    expression: 'xyz',
                    escape: true
                },
                {
                    type: 'text',
                    text: '!'
                },
                {
                    type: 'closetag',
                    tagName: 'script'
                }
            ]);
        });

        it('should handle placeholder expressions in strings in scripts with surrounding curly braces', function() {
            parse([
                '<script>alert("Hello ${xyz}!")</script>'
            ], [
                {
                    type: 'opentag',
                    tagName: 'script',
                    attributes: []
                },
                {
                    type: 'text',
                    text: 'alert("Hello '
                },
                {
                    type: 'contentplaceholder',
                    expression: 'xyz',
                    escape: true
                },
                {
                    type: 'text',
                    text: '!")'
                },
                {
                    type: 'closetag',
                    tagName: 'script'
                }
            ]);
        });

        it('should handle placeholder expressions within non-delimited attributes', function() {
            parse([
                '<custom name="Hello ${name}!">TEST</custom>'
            ], [
                {
                    type: 'opentag',
                    tagName: 'custom',
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
                    tagName: 'custom'
                }
            ]);
        });

        it('should handle placeholder expressions within delimited expression attributes', function() {
            parse([
                '<custom name=("Hello ${name}!")>TEST</custom>'
            ], [
                {
                    type: 'opentag',
                    tagName: 'custom',
                    attributes: [
                        {
                            name: 'name',
                            expression: '(("Hello "+(name)+"!"))'
                        }
                    ]
                },
                {
                    type: 'text',
                    text: 'TEST'
                },
                {
                    type: 'closetag',
                    tagName: 'custom'
                }
            ]);
        });

        it('should handle placeholder expressions within string within delimited expression attributes', function() {
            parse([
                '<custom name="${\'some text\'}">TEST</custom>'
            ], [
                {
                    type: 'opentag',
                    tagName: 'custom',
                    attributes: [
                        {
                            name: 'name',
                            expression: '(\'some text\')',
                        }
                    ]
                },
                {
                    type: 'text',
                    text: 'TEST'
                },
                {
                    type: 'closetag',
                    tagName: 'custom'
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
                    tagName: 'script',
                    attributes: []
                },
                {
                    type: 'text',
                    text: '// Copyright '
                },
                {
                    type: 'contentplaceholder',
                    expression: 'date',
                    escape: true
                },
                {
                    type: 'text',
                    text: '\n'
                },
                {
                    type: 'closetag',
                    tagName: 'script'
                }
            ]);
        });

        it('should handle placeholders in JavaScript multi-line comments', function() {
            parse([
                '<script>/* Copyright $!{date} */</script>'
            ], [
                {
                    type: 'opentag',
                    tagName: 'script',
                    attributes: []
                },
                {
                    type: 'text',
                    text: '/* Copyright '
                },
                {
                    type: 'contentplaceholder',
                    expression: 'date',
                    escape: false
                },
                {
                    type: 'text',
                    text: ' */'
                },
                {
                    type: 'closetag',
                    tagName: 'script'
                }
            ]);
        });

        it('should handle placeholders in string attributes', function() {
            parse([
                '<custom data="${\nabc\n}">'
            ], [
                {
                    type: 'opentag',
                    tagName: 'custom',
                    attributes: [
                        {
                            name: 'data',
                            expression: '(\nabc\n)'
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
                    tagName: 'custom',
                    attributes: [
                        {
                            name: 'data',
                            expression: '(("Hello "+(name)+"!") + " This is a test.")'
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
                    tagName: 'custom',
                    attributes: [
                        {
                            name: 'data',
                            expression: '(abc)'
                        }
                    ]
                }
            ]);
        });

        it('should handle placeholder inside attribute placeholder', function() {
            parse([
                '<custom data="${"Hello ${data.firstName + data.lastName}"}">'
            ], [
                {
                    type: 'opentag',
                    tagName: 'custom',
                    attributes: [
                        {
                            name: 'data',
                            expression: '(("Hello "+(data.firstName + data.lastName)))'
                        }
                    ]
                }
            ]);
        });

        it('should handle placeholder inside content placeholder', function() {
            parse([
                '${"Hello ${data.name}!"}'
            ], [
                {
                    type: 'nestedcontentplaceholder',
                    expression: 'data.name',
                    escape: true
                },
                {
                    type: 'contentplaceholder',
                    expression: '("Hello "+(data.name)+"!")',
                    escape: true
                }
            ]);
        });

        it('should handle placeholder inside content placeholder and escaping', function() {
            parse([
                '$!{"Hello ${data.name}!"}'
            ], {
                onnestedcontentplaceholder: function(event) {
                    if (event.escape) {
                        event.expression = 'escapeXml(' + event.expression + ')';
                    }
                }
            }, [
                {
                    type: 'contentplaceholder',
                    expression: '("Hello "+(escapeXml(data.name))+"!")',
                    escape: false
                }
            ]);
        });

        it('should allow attribute placeholder expression to be escaped', function() {
            parse([
                '<custom data="${abc}">'
            ], {
                onattributeplaceholder: function(event) {
                    if (event.escape) {
                        event.expression = 'escapeAttr(' + event.expression + ')';
                    }
                }
            }, [
                {
                    type: 'opentag',
                    tagName: 'custom',
                    attributes: [
                        {
                            name: 'data',
                            expression: '(escapeAttr(abc))'
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
                    tagName: 'div',
                    attributes: [
                        {
                            name: 'class',
                            expression: '"simple"',
                            literalValue: 'simple'
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
                    tagName: 'for',
                    argument: 'x in y',
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
                    tagName: 'for',
                    argument: 'x in y',
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
                    tagName: 'for',
                    argument: 'x in [("Hello "+(name)+"!"), "(World)"]',
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
                    tagName: 'div',
                    attributes: [
                        {
                            name: 'if',
                            argument: 'x > y'
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
                    tagName: 'div',
                    attributes: [
                        {
                            name: 'if',
                            argument: 'x > y'
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
                    tagName: 'for',
                    argument: 'var i = 0; i < 10; i++',
                    attributes: [
                        {
                            name: 'if',
                            argument: 'x > y'
                        }
                    ]
                }
            ]);
        });

        it('should allow only one argument per tag', function() {
            parse([
                '<for(var i = 0; i < 10; i++) (nonsense!)>'
            ], [
                 {
                    code: 'ILLEGAL_ELEMENT_ARGUMENT',
                    endPos: 29,
                    lineNumber: 1,
                    message: 'Element can only have one argument.',
                    startPos: 0,
                    type: 'error'
                },
                {
                    type: 'opentag',
                    tagName: 'for',
                    argument: 'var i = 0; i < 10; i++',
                    attributes: []
                }
            ]);
        });

        it('should allow only one argument per attribute', function() {
            parse([
                '<div for(var i = 0; i < 10; i++) (nonsense!)>'
            ], [
                 {
                    code: 'ILLEGAL_ATTRIBUTE_ARGUMENT',
                    lineNumber: 1,
                    message: 'Attribute can only have one argument.',
                    startPos: 0,
                    endPos: 33,
                    type: 'error'
                },
                {
                    type: 'opentag',
                    tagName: 'div',
                    attributes: [
                        {
                            name: 'for',
                            argument: 'var i = 0; i < 10; i++'
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
                    tagName: 'a',
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
                    tagName: 'a',
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
                    tagName: 'a',
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
                    tagName: 'a',
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
                    tagName: 'script',
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
                    tagName: 'style',
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
                    tagName: 'script',
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
                    tagName: 'script',
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
