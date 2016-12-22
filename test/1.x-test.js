var chai = require('chai');
chai.config.includeStack = true;
require('chai').should();

var path = require('path');
var runDirTest = require('./util/runDirTest');

describe('parser', function() {
    require('./util/autotest').scanDir(
        path.join(__dirname, 'fixtures/autotest-1.x'),
        function (dir) {
            runDirTest(dir, { legacyCompatibility: true });
        });
});
