var expect = require('chai').expect;

exports.checkOutput = function(output) {
    expect(output).to.contain('SyntaxError: Unexpecte');
};