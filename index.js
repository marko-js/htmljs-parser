var Parser = require('./Parser');

exports.createParser = function(listeners, options) {
    var parser = new Parser(listeners, options || {});
    return parser;
};
