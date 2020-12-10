var autotest = require('mocha-autotest').default;
var runDirTest = require('./util/runDirTest');

describe('parser', () => {
  autotest('autotest', runDirTest({}));
});
