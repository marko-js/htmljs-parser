export const operators = [
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
  ">",
  ">=",

  // Readable Operators
  // NOTE: These become reserved words and cannot be used as attribute names
  "instanceof",
  "in",
  // 'from', -- as in <import x from './file'/>
  // 'typeof', -- would need to look behind, not ahead

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

  // Member
  "[",
].sort((a, b) => b.length - a.length); // Look for longest operators first

const unary = ["typeof", "new", "void"];

export const longest =
  operators.sort((a, b) => b.length - a.length)[0].length + 1;
export const patternNext = new RegExp(
  "^\\s*(" + operators.map(escapeOperator).join("|") + ")\\s*(?!-)"
);
export const patternPrev = new RegExp(
  "[^-+](?:" +
    operators.concat(unary).map(escapeOperator).join("|") +
    ")(\\s*)$"
);

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
