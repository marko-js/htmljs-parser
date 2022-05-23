import {
  CODE,
  Parser,
  STATE,
  StateDefinition,
  Meta,
  ErrorCode,
} from "../internal";

interface PlaceholderMeta extends Meta {
  escape: boolean;
}
export const PLACEHOLDER: StateDefinition<PlaceholderMeta> = {
  name: "PLACEHOLDER",

  enter(parent, start) {
    return {
      state: PLACEHOLDER as StateDefinition,
      parent,
      start,
      end: start,
      escape: false,
    };
  },

  exit(placeholder) {
    this.options.onPlaceholder?.({
      start: placeholder.start,
      end: placeholder.end,
      escape: placeholder.escape,
      value: {
        start: placeholder.start + (placeholder.escape ? 2 : 3), // ignore ${ or $!{
        end: placeholder.end - 1, // ignore }
      },
    });
  },

  char() {},

  eol() {},

  eof() {},

  return(child) {
    if (child.start === child.end) {
      this.emitError(
        child,
        ErrorCode.MALFORMED_PLACEHOLDER,
        "Invalid placeholder, the expression cannot be missing"
      );
    }
    this.pos++; // skip }
    this.exitState();
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
          parser.pos += extra;
          parser.startText();
          parser.pos += escape ? 2 : 3; // skip the ${ or $!{
          return true;
        } else {
          parser.startText();
          parser.pos += extra; // include half of the backslashes.
          parser.endText();
          parser.pos += extra;
        }
      }

      parser.endText();
      parser.enterState(PLACEHOLDER).escape = escape;
      parser.pos += escape ? 2 : 3; // skip ${ or $!{
      parser.forward = 0;
      parser.enterState(STATE.EXPRESSION).terminator = CODE.CLOSE_CURLY_BRACE;
      return true;
    }
  }

  return false;
}
