var jsxml = require('../');
var Parser = require('../Parser');

require('colors');

[
    function() {
        return;

        var parser = new Parser();

        ['A', 'B', 'C', 'D'].forEach(function(chunk) {
            parser.addChunk(chunk);
        });


        parser.nextChunk();

        parser.pos = 0;

        parser.lookAheadFor('ABC', function(str) {
            if (str) {
                console.log('ABC Found!');
            } else {
                console.log('ABC Not found');
            }
        });

        parser.lookAheadFor('ABCD', function(str) {
            if (str) {
                console.log('ABCD Found!');
            } else {
                console.log('ABCD Not found');
            }
        });

        parser.lookAheadFor('ABCDE', function(str) {
            if (str) {
                console.log('ABCDE Found!');
            } else {
                console.log('ABCDE Not found');
            }
        });

        parser.addChunk('E');

        parser.lookAheadFor('ABCDE!', function(str) {
            if (str) {
                console.log('ABCDE! Found!');
            } else {
                console.log('ABCDE! Not found');
            }
        });

        parser.addChunk('F');

        parser.end();
    },

    function() {
        var parser = jsxml.createParser({
            ontext: function(text) {
                console.log(text.cyan);
            },

            onopentag: function(name, attributes) {
                var str = '<' + name;
                for (var i = 0; i < attributes.length; i++) {
                    var attr = attributes[i];
                    str += ' ' + attr.name + '=' + attr.value;
                }

                str += '>';
                console.log(str.yellow);
            },

            onclosetag: function(name) {
                var str = '</' + name + '>';
                console.log(str.yellow);
            },

            ondtd: function(name) {
                var str = '<!' + name + '>';
                console.log(str.blue);
            },

            ondeclaration: function(name) {
                var str = '<?' + name + '?>';
                console.log(str.red);
            },

            oncomment: function(comment) {
                console.log('<!--' + comment + '-->'.gray);
            }
        });

        parser.parse([
            '<script>',
            '// This is a demonstration of <script></script>',
            'if (x < 1) {\n',
            '   document.write("</script>")\n',
            '}\n',
            '</script>'
        ]);


        // parser.parse('<div a=123 b={{}} } c=123+135>abc</div>');
        //
        // parser.parse([
        //     '<', '?', 'xml version="1.0" encoding="UTF-8">',
        //     '<', '!', 'DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0//EN">',
        //     'THIS ', 'IS', ' TEXT',
        //     '<d', 'iv', '>DIV CONTENT', '<', '/', 'div>',
        //     '<!', '-', '-',
        //     '<d', 'iv', '>COMMENT', '<', '/', 'div>',
        //     '-->',
        //     '<custom x', '=', '(2 + 2) y=a z="abc">',
        //     'CUSTOM CONTENT',
        //     '</custom>',
        //
        //     // Just a normal CDATA block...
        //     '<![CDATA[this is cdata]]>',
        //
        //     // When parsing expressions delimited by paranthese,
        //     // make sure we ignore any paranthese within string
        //     // quotes
        //     '<a data=((a-b)/2 + ")")',
        //
        //     // Make sure we properly parse script blocks
        //     // which might have JavaScript expressions with
        //     // special characters within them
        //     '<script>',
        //     'if (x < 1) {\n',
        //     '   document.write("</script>")',
        //     '}\n',
        //     '</script>',
        //
        //     //"<>" and "</>" should be treated as text
        //     '<></>',
        //
        //     // The misplaced "/" should be ignored
        //     '<abc / >',
        //
        //     // test attribute should have value: 1/2
        //     // Make sure that we aren't confused by the "/"
        //     // within the expression.
        //     '<abc test=1/2/>'
        // ]);
        //
        // parser.parse('<');
        //
        // parser.parse('<abc');
        //
        // parser.parse('</');
        //
        // parser.parse('</abc');
        //
        // parser.parse('<abc a=123');
        //
        // parser.parse('<script>a + b');
        //
        // parser.parse('<script>a + b + "abc');
        //
        // parser.parse('<script src="xyz">a + b + "abc"');
    }
].forEach(function(func) {
    func();
});
