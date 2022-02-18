import {
  CODE,
  Parser,
  STATE,
  StateDefinition,
  PlaceholderRange,
} from "../internal";

export const PLACEHOLDER: StateDefinition<PlaceholderRange> = {
  name: "PLACEHOLDER",

  enter(placeholder) {
    placeholder.escape = placeholder.escape !== false;
    this.endText();
    this.skip(placeholder.escape ? 2 : 3); // skip ${ or $!{
    this.enterState(STATE.EXPRESSION, { terminator: "}" });
    this.rewind(1);
  },

  exit(placeholder) {
    this.notifiers.notifyPlaceholder({
      pos: placeholder.pos,
      endPos: placeholder.endPos,
      escape: placeholder.escape,
      value: {
        pos: placeholder.pos + (placeholder.escape ? 2 : 3), // ignore ${ or $!{
        endPos: placeholder.endPos - 1, // ignore }
      },
    });
  },

  return(_, childPart) {
    if (childPart.pos === childPart.endPos) {
      this.notifyError(
        childPart,
        "PLACEHOLDER_EXPRESSION_REQUIRED",
        "Invalid placeholder, the expression cannot be missing"
      );
    }
    this.exitState("}");
  },
};

export function checkForPlaceholder(parser: Parser, code: number) {
  let ahead = 0;
  let curCode = code;

  while (curCode === CODE.BACK_SLASH) {
    curCode = parser.lookAtCharCodeAhead(++ahead);
  }

  if (curCode === CODE.DOLLAR) {
    let escape = true;
    curCode = parser.lookAtCharCodeAhead(ahead + 1);

    if (curCode === CODE.EXCLAMATION) {
      escape = false;
      curCode = parser.lookAtCharCodeAhead(ahead + 2);
    }

    if (curCode === CODE.OPEN_CURLY_BRACE) {
      if (ahead) {
        const remainder = ahead % 2;
        const extra = (ahead + remainder) / 2; // Number of backslashes to omit from output.

        if (remainder) {
          parser.endText();
          parser.skip(extra);
          parser.startText();
          parser.skip(escape ? 2 : 3); // skip the ${ or $!{
          return true;
        } else {
          parser.startText();
          parser.skip(extra); // include half of the backslashes.
          parser.endText();
          parser.skip(extra);
        }
      }

      parser.enterState(PLACEHOLDER, { escape });
      return true;
    }
  }

  return false;
}
