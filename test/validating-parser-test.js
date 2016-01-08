var chai = require('chai');
chai.config.includeStack = true;
require('chai').should();
var expect = require('chai').expect;
var htmljs = require('../');

function attributesToString(attributes) {
    if (!attributes || attributes.length === 0) {
        return '';
    }

    return ' ' + attributes.map(function(attr) {
        return attr.name + '=' + attr.expression;
    }).join(' ');
}

function openTagToString(event) {
    var tagName = event.tagName;
    var attributes = event.attributes;
    var openTagOnly = event.openTagOnly === true;
    var selfClosed =  event.selfClosed === true;
    return '<' + tagName + attributesToString(attributes) + (openTagOnly ? ' OPEN_ONLY' : '') + (selfClosed ? ' SELF_CLOSED' : '') + '>';
}

function closeTagToString(event) {
    var tagName = event.tagName;
    return '</' + tagName + '>';
}

function testParser(data, expected, expectedError) {
    var events = [];
    var error = null;

    var parser = htmljs.createParser({
        onopentag: function(event) {
            events.push(openTagToString(event));
        },

        onclosetag: function(event) {
            events.push(closeTagToString(event));
        },

        ontext: function(event) {
            events.push('text:' + event.text.trim());
        },

        onerror: function(err) {
            error = err;
        }
    });

    parser.parse(data);

    if (expectedError) {
        if (error) {
            if (typeof expectedError === 'string') {
                expect(error.message).to.equal(expectedError);
            } else if (typeof expectedError === 'function') {
                expectedError(error);
            } else {
                throw new Error('Illegal state');
            }

        } else {
            throw new Error('Expected error did not occur: ' + expectedError);
        }

    } else {
        if (error) {
            throw error;
        }

        expect(events).to.deep.equal(expected);
    }

}

describe('validating parser', function() {
    it('should handle img tags with opening only', function() {
        testParser(
            '<div> A <img src="image1.png"> B <img src="image2.png"> C <img src="image3.png"> D </div>',
            [
                '<div>',
                'text:A',
                '<img src="image1.png" OPEN_ONLY>',
                '</img>',
                'text:B',
                '<img src="image2.png" OPEN_ONLY>',
                '</img>',
                'text:C',
                '<img src="image3.png" OPEN_ONLY>',
                '</img>',
                'text:D',
                '</div>'
            ]);
    });

    it('should allow unrecognized tags to be open tag only', function() {
        testParser(
            '<div> A <foo-img src="image1.png"> B <foo-img src="image2.png"> C <foo-img src="image3.png"> D </div>',
            [
                '<div>',
                'text:A',
                '<foo-img src="image1.png" OPEN_ONLY>',
                '</foo-img>',
                'text:B',
                '<foo-img src="image2.png" OPEN_ONLY>',
                '</foo-img>',
                'text:C',
                '<foo-img src="image3.png" OPEN_ONLY>',
                '</foo-img>',
                'text:D',
                '</div>'
            ]);
    });

    it('should allow <img> tags at end', function() {
        testParser(
            '<div>foo</div><img src="image1.png">',
            [
                '<div>',
                'text:foo',
                '</div>',
                '<img src="image1.png" OPEN_ONLY>',
                '</img>'
            ]);
    });

    it('should allow unrecognized start tag only tags at end', function() {
        testParser(
            '<div>foo</div><foo-img src="image1.png">',
            [
                '<div>',
                'text:foo',
                '</div>',
                '<foo-img src="image1.png">',
                '</foo-img>'
            ]);
    });

    it('should not allow closing tag for <img>', function() {
        testParser(
            '<div><img src="image1.png"></img></div>',
            null,
            'Invalid closing tag: </img>');
    });

    it('should allow self-closing <img/> tag', function() {
        testParser(
            '<div><img src="image1.png"/></div>',
            [
                '<div>',
                '<img src="image1.png" OPEN_ONLY>',
                '</img>',
                '</div>'
            ]);
    });

    it('should not allow invalid closing tag', function() {
        testParser(
            '<div> </span> </div>',
            null,
            'Unmatched closing tag: </span>');
    });

    it('should not allow missing close tag for root node', function() {
        testParser(
            '<div>',
            null,
            'Missing closing tag: </div>');
    });

    it('should not allow unclosed <span> tags', function() {
        testParser(
            '<div> <span> </div>',
            null,
            'Missing closing tag: </span>');
    });

    it('should not allow unmatched </span> tag at end', function() {
        testParser(
            '</span>',
            null,
            'Unmatched closing tag: </span>');
    });


    it('should include event properties in error', function() {
        testParser(
            '<div> <span> </div>',
            null,
            function(err) {
                expect(err.tagName).to.equal('span');
            });
    });

    it('should correct a tag that is not allowed to be self-closing', function() {
        testParser(
            '<div class="foo"/>',
            [
                '<div class="foo">',
                '</div>'
            ]);
    });

    // it('should include line number in error', function() {
    //     testParser(
    //         '<div> <span> </div>',
    //         null,
    //         function(err) {
    //             expect(err.lineNumber).to.equal(1);
    //         });
    // });
});