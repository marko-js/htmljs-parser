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
        ontext: function(event) {
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
                        value: '1/2'
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
                        value: '1'
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
                        value: '((a-b)/2 + ")")'
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
                        value: '((a-b)/2 + \')\')'
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
                text: '<within><!-- just text -->'
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
                type: 'comment',
                comment: '<b></b>'
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
            '// line comment within <style></style>\n',
            '/* block comment within <style></style> */',
            '"string within \\\"<style></style>\\\""',
            '\'string within \\\'<style></style>\\\'\''
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
            '// line comment within <style></style>\n',
            '/* block comment within <style></style> */',
            '"string within \\\"<style></style>\\\""',
            '\'string within \\\'<style></style>\\\'\''
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
                        value: 'b'
                    }
                ]
            },
            {
                type: 'text',
                text: styleInnerText
            }
        ]);
    });
});
