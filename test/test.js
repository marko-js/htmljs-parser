var autotest = require("mocha-autotest").default;
var runDirTest = require("./util/runDirTest").default;

describe("parser", () => {
  autotest("autotest", runDirTest({}));
});
