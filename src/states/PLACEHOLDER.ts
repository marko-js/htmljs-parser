import { CODE, Parser, Part, STATE, StateDefinition } from "../internal";

export interface PlaceholderPart extends Part {
  escape: boolean;
}

export const PLACEHOLDER: StateDefinition<PlaceholderPart> = {
  name: "PLACEHOLDER",

  enter(placeholder) {
    placeholder.escape = placeholder.escape !== false;
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
  if (code === CODE.DOLLAR) {
    let nextCode = parser.lookAtCharCodeAhead(1);
    let escape = true;

    if (nextCode === CODE.EXCLAMATION) {
      escape = false;
      nextCode = parser.lookAtCharCodeAhead(2);
    }

    if (nextCode === CODE.OPEN_CURLY_BRACE) {
      parser.endText();
      parser.enterState(STATE.PLACEHOLDER, { escape });
      return true;
    }
  }

  return false;
}

export function checkForEscapedPlaceholder(parser: Parser, code: number) {
  // Look for \${ and \$!{
  if (code === CODE.BACK_SLASH) {
    if (parser.lookAtCharCodeAhead(1) === CODE.DOLLAR) {
      if (parser.lookAtCharCodeAhead(2) === CODE.OPEN_CURLY_BRACE) {
        return true;
      } else if (parser.lookAtCharCodeAhead(2) === CODE.EXCLAMATION) {
        if (parser.lookAtCharCodeAhead(3) === CODE.OPEN_CURLY_BRACE) {
          return true;
        }
      }
    }
  }

  return false;
}

export function checkForEscapedEscapedPlaceholder(
  parser: Parser,
  code: number
) {
  // Look for \\${ and \\$!{
  if (code === CODE.BACK_SLASH) {
    if (parser.lookAtCharCodeAhead(1) === CODE.BACK_SLASH) {
      if (parser.lookAtCharCodeAhead(2) === CODE.DOLLAR) {
        if (parser.lookAtCharCodeAhead(3) === CODE.OPEN_CURLY_BRACE) {
          return true;
        } else if (parser.lookAtCharCodeAhead(3) === CODE.EXCLAMATION) {
          if (parser.lookAtCharCodeAhead(4) === CODE.OPEN_CURLY_BRACE) {
            return true;
          }
        }
      }
    }
  }

  return false;
}
