var fs = require('fs');
var enabledTest = process.env.TEST;
var path = require('path');
var assert = require('assert');

function autoTest(name, dir, run) {
    var actualPath = path.join(dir, 'actual.json');
    var expectedPath = path.join(dir, 'expected.json');

    var actual = run(dir);
    var actualJSON = JSON.stringify(actual, null, 4);

    fs.writeFileSync(actualPath, actualJSON, {encoding: 'utf8'});

    var expectedJSON;

    try {
        expectedJSON = fs.readFileSync(expectedPath, { encoding: 'utf8' });
    } catch(e) {
        expectedJSON = '"TBD"';
        fs.writeFileSync(expectedPath, expectedJSON, {encoding: 'utf8'});
    }

    var expected = JSON.parse(expectedJSON);

    assert.deepEqual(
        actual,
        expected,
        'Unexpected output for "' + name + '":\nEXPECTED (' + expectedPath + '):\n---------\n' + expectedJSON +
        '\n---------\nACTUAL (' + actualPath + '):\n---------\n' + actualJSON + '\n---------');
}

exports.scanDir = function(autoTestDir, run, options) {
    describe('autotest', function() {
        fs.readdirSync(autoTestDir)
            .forEach(function(name) {
                if (name.charAt(0) === '.') {
                    return;
                }

                var itFunc = it;

                if (enabledTest && name === enabledTest) {
                    itFunc = it.only;
                }

                var dir = path.join(autoTestDir, name);

                itFunc(`[${name}] `, function() {
                    autoTest(name, dir, run, options);
                });

            });
    });
};