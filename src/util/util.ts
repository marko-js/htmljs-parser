import { CODE } from "../internal";

export function isWhitespaceCode(code) {
  // For all practical purposes, the space character (32) and all the
  // control characters below it are whitespace. We simplify this
  // condition for performance reasons.
  // NOTE: This might be slightly non-conforming.
  return code <= CODE.SPACE;
}

/**
 * Takes a string expression such as `"foo"` or `'foo "bar"'`
 * and returns the literal String value.
 */
export function evaluateStringExpression(expression, pos, parser) {
  // We could just use eval(expression) to get the literal String value,
  // but there is a small chance we could be introducing a security threat
  // by accidently running malicous code. Instead, we will use
  // JSON.parse(expression). JSON.parse() only allows strings
  // that use double quotes so we have to do extra processing if
  // we detect that the String uses single quotes

  if (expression.charAt(0) === "'") {
    expression = expression.substring(1, expression.length - 1);

    // Make sure there are no unescaped double quotes in the string expression...
    expression = expression.replace(/\\\\|\\[']|\\["]|["]/g, function (match) {
      if (match === "\\'") {
        // Don't escape single quotes since we are using double quotes
        return "'";
      } else if (match === '"') {
        // Return an escaped double quote if we encounter an
        // unescaped double quote
        return '\\"';
      } else {
        // Return the escape sequence
        return match;
      }
    });

    expression = '"' + expression + '"';
  }

  try {
    return JSON.parse(expression);
  } catch (e) {
    parser.notifyError(
      pos,
      "INVALID_STRING",
      "Invalid string (" + expression + "): " + e
    );
  }
}

export function peek(array) {
  var len = array.length;
  if (!len) {
    return undefined;
  }
  return array[len - 1];
}
