import {
  CODE,
  STATE,
  Parser,
  type StateDefinition,
  type Meta,
} from "../internal";
import {
  shouldTerminateConciseAttrValue,
  shouldTerminateHtmlAttrValue,
} from "../states";

const ROOT_STATE: StateDefinition = {
  name: "ROOT",
  enter() {
    return ROOT_RANGE;
  },
  exit() {},
  char() {},
  eol() {},
  eof() {},
  return() {},
};
const ROOT_RANGE = {
  state: ROOT_STATE,
  parent: undefined as unknown as Meta,
  start: 0,
  end: 0,
};

export function isValidStatement(code: string): boolean {
  return isValid(code, true, prepareStatement);
}

function prepareStatement(expr: STATE.ExpressionMeta) {
  expr.operators = true;
  expr.terminatedByEOL = true;
  expr.consumeIndentedContent = true;
}

export function isValidAttrValue(code: string, concise: boolean): boolean {
  return isValid(code, concise, prepareAttrValue);
}

function prepareAttrValue(expr: STATE.ExpressionMeta, concise: boolean) {
  expr.operators = true;
  expr.terminatedByWhitespace = true;
  expr.shouldTerminate = concise
    ? shouldTerminateConciseAttrValue
    : shouldTerminateHtmlAttrValue;
}

function isValid(
  data: string,
  concise: boolean,
  prepare: (expr: STATE.ExpressionMeta, concise: boolean) => void,
) {
  const parser = new Parser({});
  const maxPos = (parser.maxPos = data.length);
  parser.pos = 0;
  parser.data = data;
  parser.indent = "";
  parser.forward = 1;
  parser.textPos = -1;
  parser.isConcise = concise;
  parser.beginMixedMode = parser.endingMixedModeAtEOL = false;
  parser.lines = parser.activeTag = parser.activeAttr = undefined;
  parser.activeState = ROOT_STATE;
  parser.activeRange = ROOT_RANGE;
  const expr = parser.enterState(STATE.EXPRESSION);
  prepare(expr, concise);

  while (parser.pos < maxPos) {
    const code = data.charCodeAt(parser.pos);

    if (code === CODE.NEWLINE) {
      parser.forward = 1;
      parser.activeState.eol.call(parser, 1, parser.activeRange);
    } else if (
      code === CODE.CARRIAGE_RETURN &&
      data.charCodeAt(parser.pos + 1) === CODE.NEWLINE
    ) {
      parser.forward = 2;
      parser.activeState.eol.call(parser, 2, parser.activeRange);
    } else {
      parser.forward = 1;
      parser.activeState.char.call(parser, code, parser.activeRange);
    }

    if (parser.activeRange === ROOT_RANGE) {
      return false;
    }

    parser.pos += parser.forward;
  }

  return (
    parser.pos === maxPos &&
    parser.activeRange === expr &&
    !expr.groupStack.length
  );
}
