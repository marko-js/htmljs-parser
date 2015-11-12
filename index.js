var Parser = require('./Parser');
var ValidatingParser = require('./ValidatingParser');

exports.createNonValidatingParser = function(listeners, options) {
    var parser = new Parser(listeners, options);
    return parser;
};

exports.createParser = function(listeners, options) {
    var parser = new ValidatingParser(listeners, options);
    return parser;
};
