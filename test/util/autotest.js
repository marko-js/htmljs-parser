var fs = require('fs');
var enabledTest = process.env.TEST;
var path = require('path');
var assert = require('assert');

function autoTest(name, dir, run, options) {
    var ext = options.ext || '.json';
    var actualPath = path.join(dir, 'actual' + ext);
    var expectedPath = path.join(dir, 'expected' + ext);

    var actual = run(dir);


    fs.writeFileSync(actualPath, ext === '.json' ? JSON.stringify(actual, null, 4) : actual, {encoding: 'utf8'});

    var expected;

    try {
        expected = fs.readFileSync(expectedPath, { encoding: 'utf8' });
    } catch(e) {
        expected = ext === '.json' ? '"TBD"' : 'TBD';
        fs.writeFileSync(expectedPath, expected, {encoding: 'utf8'});
    }

    if (ext === '.json') {
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
            throw new Error('Unexpected output for "' + name + '"');
        }
    }
    // assert.deepEqual(
    //     actual,
    //     expected,
    //     'Unexpected output for "' + name + '":\nEXPECTED (' + expectedPath + '):\n---------\n' + expectedJSON +
    //     '\n---------\nACTUAL (' + actualPath + '):\n---------\n' + actualJSON + '\n---------');
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

                if (name.indexOf('.skip') === name.length-5) {
                    itFunc = it.skip;
                }

                var dir = path.join(autoTestDir, name);

                itFunc(`[${name}] `, function() {
                    run(dir);
                });

            });
    });
};