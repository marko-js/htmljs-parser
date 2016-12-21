var chai = require('chai');
chai.config.includeStack = true;
require('chai').should();

var path = require('path');
var fs = require('fs');
var htmljs = require('../');
var TreeBuilder = require('./TreeBuilder');

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

function parse(text, options) {
    var treeBuilder = new TreeBuilder(text, options);

    var parserOptions = {
        isOpenTagOnly: function(tagName) {
            if (tagName === 'foo-img') {
                return true;
            }
        }
    };

    extend(parserOptions, options);

    var parser = htmljs.createParser(treeBuilder.listeners, parserOptions);

    parser.parse(text);

    return treeBuilder.toString();
}

describe('parser', function() {

    require('./autotest').scanDir(
        path.join(__dirname, 'fixtures/autotest'),
        function (dir) {
            var inputPath = path.join(dir, 'input.htmljs');
            var testOptionsPath = path.join(dir, 'test.js');

            var options;
            var inputHtmlJs;

            if (fs.existsSync(testOptionsPath)) {
                options = require(testOptionsPath);
            }

            if (options && options.getSource) {
                inputHtmlJs = options.getSource();
            } else {
                inputHtmlJs = fs.readFileSync(inputPath, {encoding: 'utf8'});
            }

            if (!options || (options.preserveLineEndings !== true)) {
                inputHtmlJs = inputHtmlJs.replace(/\r\n|\n/g, "\n");
            }

            if (options && options.checkThrownError) {
                var error;

                try {
                    parse(inputHtmlJs);
                } catch(e) {
                    error = e;
                }

                if (!error) {
                    throw new Error('Error expected!');
                } else {

                }
            } else {
                return parse(inputHtmlJs, options);
            }


        },
    {
        ext: '.html'
    });
});
