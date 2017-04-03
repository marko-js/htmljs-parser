var path = require('path');
var fs = require('fs');
var htmljs = require('../../');
var TreeBuilder = require('./TreeBuilder');
var assert = require('assert');
var updateExpectations = process.env.hasOwnProperty('UPDATE_EXPECTATIONS');

require('colors');

function extend(target, source) { //A simple function to copy properties from one object to another
    if (!target) { //Check if a target was provided, otherwise create a new empty object to return
        target = {};
    }

    if (source) {
        for (var propName in source) {
            if (source.hasOwnProperty(propName)) { //Only look at source properties that are not inherited
                target[propName] = source[propName]; //Copy the property
            }
        }
    }

    return target;
}

module.exports = function(dir, parserOptions) {
    var inputPath = path.join(dir, 'input.htmljs');
    var testOptionsPath = path.join(dir, 'test.js');
    var name = path.basename(dir);

    var main;
    var inputHtmlJs;

    if (fs.existsSync(testOptionsPath)) {
        main = require(testOptionsPath);
    }

    if (main && main.getSource) {
        inputHtmlJs = main.getSource();
    } else {
        inputHtmlJs = fs.readFileSync(inputPath, {encoding: 'utf8'});
    }

    if (!main || (main.preserveLineEndings !== true)) {
        inputHtmlJs = inputHtmlJs.replace(/\r\n|\n/g, "\n");
    }

    function parse(text, inputPath) {
        var treeBuilder = new TreeBuilder(text, main);

        var finalParserOptions = {
            isOpenTagOnly: function(tagName) {
                if (tagName === 'foo-img') {
                    return true;
                }
            }
        };

        extend(finalParserOptions, parserOptions);

        extend(finalParserOptions, main);

        var parser = htmljs.createParser(treeBuilder.listeners, finalParserOptions);

        parser.parse(text, inputPath);

        return treeBuilder.toString();
    }

    function checkOutput(actual) {
        var suffix = '.html';
        var actualPath = path.join(dir, 'actual' + suffix);
        var expectedPath = path.join(dir, 'expected' + suffix);


        fs.writeFileSync(actualPath, suffix === '.json' ? JSON.stringify(actual, null, 4) : actual, {encoding: 'utf8'});

        var expected;

        try {
            expected = fs.readFileSync(expectedPath, { encoding: 'utf8' });
        } catch(e) {
            expected = suffix === '.json' ? '"TBD"' : 'TBD';
            fs.writeFileSync(expectedPath, expected, {encoding: 'utf8'});
        }

        if (suffix === '.json') {
            var expectedObject = JSON.parse(expected);

            try {
                assert.deepEqual(
                    actual,
                    expectedObject);
            } catch(e) {
                // console.error('Unexpected output for "' + name + '":\nEXPECTED (' + expectedPath + '):\n---------\n' + expectedJSON +
                //     '\n---------\nACTUAL (' + actualPath + '):\n---------\n' + actualJSON + '\n---------');
                throw new Error('Unexpected output for "' + name + '"');
            }
        } else {
            if (actual !== expected) {
                if (updateExpectations) {
                    fs.writeFileSync(expectedPath, actual, { encoding: 'utf8' });
                } else {
                    throw new Error('Unexpected output for "' + name + '"');
                }
            }
        }
    }

    if (main && main.checkThrownError) {
        var error;

        try {
            parse(inputHtmlJs, inputPath);
        } catch(e) {
            error = e;
        }

        if (!error) {
            throw new Error('Error expected!');
        } else {

        }
    } else {
        var output = parse(inputHtmlJs, inputPath);

        if (main && main.checkOutput) {
            main.checkOutput(output);
        } else {
            checkOutput(output);
        }
    }
};