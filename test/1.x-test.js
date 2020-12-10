var autotest = require('mocha-autotest').default;
var runDirTest = require('./util/runDirTest');

describe('parser', () => {
  autotest('autotest-1.x', runDirTest({ legacyCompatibility: true }));
});
