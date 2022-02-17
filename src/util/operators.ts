export const conciseOperatorPattern = buildOperatorPattern(true);
export const htmlOperatorPattern = buildOperatorPattern(false);

function buildOperatorPattern(isConcise: boolean) {
  const unary = ["typeof", "new", "void"];
  const operators = [
    //Multiplicative Operators
    "*",
    "/",
    "%",

    //Additive Operators
    "+",
    "-",

    //Bitwise Shift Operators
    "<<",
    ">>",
    ">>>",

    //Relational Operators
    "<",
    "<=",
    ">=",

    // Readable Operators
    // NOTE: These become reserved words and cannot be used as attribute names
    "instanceof",
    "in",

    // Equality Operators
    "==",
    "!=",
    "===",
    "!==",

    // Binary Bitwise Operators
    "&",
    "^",
    "|",

    // Binary Logical Operators
    "&&",
    "||",

    // Ternary Operator
    "?",
    ":",

    // Special
    // In concise mode we can support >, and in html mode we can support [
    isConcise ? ">" : "[",
  ];
  const lookAheadPattern = `\\s*(${operators
    .sort(byLength)
    .map(escapeOperator)
    .join("|")})\\s*(?!-)`;
  const lookBehindPattern = `(?<=[^-+](?:${operators
    .concat(unary)
    .sort(byLength)
    .map(escapeOperator)
    .join("|")}))`;

  return new RegExp(`${lookAheadPattern}|${lookBehindPattern}`, "y");
}

function escapeOperator(str: string) {
  if (/^[A-Z]+$/i.test(str)) {
    return "\\b" + escapeNonAlphaNumeric(str) + "\\b";
  }
  if (str === "/") {
    return "\\/(?:\\b|\\s)"; //make sure this isn't a comment
  }
  return escapeNonAlphaNumeric(str);
}

function escapeNonAlphaNumeric(str: string) {
  return str.replace(/([^\w\d])/g, "\\$1");
}

function byLength(a: string, b: string) {
  return b.length - a.length;
}
