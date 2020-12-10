var fs = require('fs');
var chai = require('chai');
var TreeBuilder = require('./TreeBuilder');
var htmljs = require('../../');
chai.config.includeStack = true;
require('chai').should();

module.exports = function runTest(defaultParserOptions) {
    return function ({ test, resolve, snapshot }) {
        test(function() {
            var inputPath = resolve('input.htmljs');
            var testOptionsPath = resolve('test.js');

            var main;
            var inputHtmlJs;
            var parserOptions = defaultParserOptions;

            if (fs.existsSync(testOptionsPath)) {
                main = require(testOptionsPath);
            }

            if (main) {
                parserOptions = Object.assign({}, defaultParserOptions, main);
            }

            if (main && main.getSource) {
                inputHtmlJs = main.getSource();
            } else {
                inputHtmlJs = fs.readFileSync(inputPath, {encoding: 'utf8'});
            }

            if (!main || (main.preserveLineEndings !== true)) {
                inputHtmlJs = inputHtmlJs.replace(/\r\n|\n/g, "\n");
            }

            var error;
            var output;

            try {
                output = parse(inputHtmlJs, inputPath, parserOptions);
            } catch(e) {
                if (main && main.checkThrownError)  {
                    return;
                } else {
                    throw e;
                }
            }

            if (main && main.checkThrownError) {
                throw new Error('Error expected!');
            } else if (main && main.checkOutput) {
                main.checkOutput(output);
            } else {
                snapshot(output, { ext: ".html" });
            }
        });
    }
};

function parse(text, inputPath, parserOptions) {
    var treeBuilder = new TreeBuilder(text, parserOptions);

    var finalParserOptions = Object.assign({
        isOpenTagOnly: function(tagName) {
            if (tagName === 'foo-img') {
                return true;
            }
        }
    }, parserOptions);

    var parser = htmljs.createParser(treeBuilder.listeners, finalParserOptions);

    parser.parse(text, inputPath);

    return treeBuilder.toString();
}