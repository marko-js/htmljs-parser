var chai = require('chai');
chai.config.includeStack = true;
require('chai').should();
var expect = require('chai').expect;

var jsxml = require('../');
var Parser = require('../Parser');

require('colors');

function parse(text, expectedEvents) {
    var actualEvents = [];
    var parser = jsxml.createParser({
        ontext: function(text) {
            actualEvents.push({
                type: 'text',
                text: text
            });
        },

        onopentag: function(name, attributes) {
            actualEvents.push({
                type: 'opentag',
                name: name,
                attributes: attributes
            });
        },

        onclosetag: function(name) {
            actualEvents.push({
                type: 'closetag',
                name: name
            });
        },

        ondtd: function(name) {
            actualEvents.push({
                type: 'dtd',
                name: name
            });
        },

        ondeclaration: function(name) {
            actualEvents.push({
                type: 'declaration',
                name: name
            });
        },

        oncomment: function(comment) {
            actualEvents.push({
                type: 'comment',
                comment: comment
            });
        }
    });

    parser.parse(text);

    expect(actualEvents).to.deep.equal(expectedEvents);
}

describe('Parser', function() {
    var parser;

    beforeEach(function() {
        parser = new Parser();
    });

    it('should handle looking ahead for strings', function() {
        ['A', 'B', 'C', 'D'].forEach(function(chunk) {
            parser.addChunk(chunk);
        });

        // move to first chunk
        parser.nextChunk();

        // move to first character
        parser.pos = 0;

        var lookAheads = [
            'A',
            'AB',
            'ABC',
            'ABCD',

            // this substring is not immediately available
            // until we push another chunk later
            'ABCDE'
        ];

        var testCount = 0;

        lookAheads.forEach(function(lookAhead) {
            parser.lookAheadFor(lookAhead, function(match) {
                testCount++;

                // all of the look aheads that we are testing should exist
                expect(match).to.equal(lookAhead);
            });
        });

        // all but the last test should have been completed
        expect(testCount).to.equal(lookAheads.length - 1);

        parser.addChunk('E');

        // final test should have completed
        expect(testCount).to.equal(lookAheads.length);

        // now look for a string that doesn't exist
        parser.lookAheadFor('X', function(match) {
            testCount++;
            expect(match).to.equal(undefined);
        });

        expect(testCount).to.equal(lookAheads.length + 1);

        // now look ahead for a string that won't be available.
        // When parser.end() is called the parser will be able
        // to resolve the look ahead and see that the string we
        // are looking for does not exist
        parser.lookAheadFor('ABCDE!', function(match) {
            testCount++;
            expect(match).to.equal(undefined);
        });

        expect(parser.waitFor).to.not.equal(null);

        expect(function() {
            // look ahead for something that is not currently available...
            // Since we already blocked looking for "ABCDE!" we expect
            // the parser to throw an error because it can only be waiting
            // for a single look ahead (this is by design)
            parser.lookAheadFor('XXXXXXXXXXXXXXX', function(match) {
                testCount++;
                expect(match).to.equal(undefined);
            });
        }).to.throw(Error);

        parser.end();

        expect(testCount).to.equal(lookAheads.length + 2);
    });

    it('should handle looking ahead for single character', function() {
        ['A', 'B'].forEach(function(chunk) {
            parser.addChunk(chunk);
        });

        expect(parser.curChunkIndex).to.equal(-1);

        // move to first chunk
        parser.nextChunk();

        expect(parser.curChunkIndex).to.equal(0);

        // move to first character
        parser.pos = 0;

        var testCount = 0;

        parser.lookAtCharAhead(1, function(ch) {
            testCount++;
            expect(ch).to.equal('A');
        });

        expect(testCount).to.equal(1);

        parser.lookAtCharAhead(2, function(ch) {
            testCount++;
            expect(ch).to.equal('B');
        });

        expect(testCount).to.equal(2);

        parser.lookAtCharAhead(3, function(ch) {
            testCount++;
            expect(ch).to.equal('C');
        });

        // last lookAtCharAhead won't complete right away so the
        // test count should not have changed
        expect(testCount).to.equal(2);

        parser.addChunk('C');

        expect(testCount).to.equal(3);

        parser.lookAtCharAhead(5, function(ch) {
            testCount++;
            expect(ch).to.equal('E');
        });

        parser.addChunk('DEF');

        expect(testCount).to.equal(4);
    });

});

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
            '// line comment within <script></script>\n',
            '/* block comment within <script></script> */',
            '"string within \\\"<script></script>\\\""',
            '\'string within \\\'<script></script>\\\'\''
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

    it('should handle EOF while parsing script tag', function() {
        var scriptInnerText = [
            '// line comment within <script></script>\n',
            '/* block comment within <script></script> */',
            '"string within \\\"<script></script>\\\""',
            '\'string within \\\'<script></script>\\\'\''
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
                        value: 'b'
                    }
                ]
            },
            {
                type: 'text',
                text: scriptInnerText
            }
        ]);
    });

    it('should handle parsing element', function() {
        parse([
            '<a a=123+256 b c= d=(a + (1/2) /* comment */)>test</a>'
        ], [
            {
                type: 'opentag',
                name: 'a',
                attributes: [
                    {
                        name: 'a',
                        value: '123+256'
                    },
                    {
                        name: 'b'
                    },
                    {
                        name: 'c',
                        value: ''
                    },
                    {
                        name: 'd',
                        value: '(a + (1/2) /* comment */)'
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
});

// [
//
//     function() {
//         var parser = jsxml.createParser({
//             ontext: function(text) {
//                 console.log('TEXT');
//                 console.log(text.cyan);
//             },
//
//             onopentag: function(name, attributes) {
//                 console.log('OPEN TAG');
//
//                 var str = '<' + name;
//                 for (var i = 0; i < attributes.length; i++) {
//                     var attr = attributes[i];
//                     str += ' ' + attr.name + '=' + attr.value;
//                 }
//
//                 str += '>';
//                 console.log(str.yellow);
//             },
//
//             onclosetag: function(name) {
//                 console.log('CLOSE TAG');
//                 var str = '</' + name + '>';
//                 console.log(str.yellow);
//             },
//
//             ondtd: function(name) {
//                 console.log('DTD');
//                 var str = '<!' + name + '>';
//                 console.log(str.blue);
//             },
//
//             ondeclaration: function(name) {
//                 console.log('DECLARATION');
//                 var str = '<?' + name + '?>';
//                 console.log(str.red);
//             },
//
//             oncomment: function(comment) {
//                 console.log('COMMENT');
//                 console.log('<!--' + comment + '-->'.gray);
//             }
//         });
//
//         parser.parse([
//             '<script>',
//             '// Comment: <script></script>\n',
//             'if (x < 1) {\n',
//             '   document.write("</script>")\n',
//             '}\n',
//             '</script>'
//         ]);
//
//
//         // parser.parse('<div a=123 b={{}} } c=123+135>abc</div>');
//         //
//         // parser.parse([
//         //     '<', '?', 'xml version="1.0" encoding="UTF-8">',
//         //     '<', '!', 'DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0//EN">',
//         //     'THIS ', 'IS', ' TEXT',
//         //     '<d', 'iv', '>DIV CONTENT', '<', '/', 'div>',
//         //     '<!', '-', '-',
//         //     '<d', 'iv', '>COMMENT', '<', '/', 'div>',
//         //     '-->',
//         //     '<custom x', '=', '(2 + 2) y=a z="abc">',
//         //     'CUSTOM CONTENT',
//         //     '</custom>',
//         //
//         //     // Just a normal CDATA block...
//         //     '<![CDATA[this is cdata]]>',
//         //
//         //     // When parsing expressions delimited by paranthese,
//         //     // make sure we ignore any paranthese within string
//         //     // quotes
//         //     '<a data=((a-b)/2 + ")")',
//         //
//         //     // Make sure we properly parse script blocks
//         //     // which might have JavaScript expressions with
//         //     // special characters within them
//         //     '<script>',
//         //     'if (x < 1) {\n',
//         //     '   document.write("</script>")',
//         //     '}\n',
//         //     '</script>',
//         //
//         //     //"<>" and "</>" should be treated as text
//         //     '<></>',
//         //
//         //     // The misplaced "/" should be ignored
//         //     '<abc / >',
//         //
//         //     // test attribute should have value: 1/2
//         //     // Make sure that we aren't confused by the "/"
//         //     // within the expression.
//         //     '<abc test=1/2/>'
//         // ]);
//         //
//         // parser.parse('<');
//         //
//         // parser.parse('<abc');
//         //
//         // parser.parse('</');
//         //
//         // parser.parse('</abc');
//         //
//         // parser.parse('<abc a=123');
//         //
//         // parser.parse('<script>a + b');
//         //
//         // parser.parse('<script>a + b + "abc');
//         //
//         // parser.parse('<script src="xyz">a + b + "abc"');
//     }
// ].forEach(function(func) {
//     func();
// });
