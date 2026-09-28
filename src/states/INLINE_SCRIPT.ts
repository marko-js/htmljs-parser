import {
  isIndentCode,
  isWordCode,
  matchesCloseCurlyBrace,
  type Meta,
  Parser,
  type Range,
  STATE,
  type StateDefinition,
} from "../internal.ts";
import * as CODE from "../util/codes.ts";
import { binaryKeywords } from "./EXPRESSION.ts";

interface ScriptletMeta extends Meta {
  block: boolean;
  value: Range;
}
export const INLINE_SCRIPT: StateDefinition<ScriptletMeta> = {
  name: "INLINE_SCRIPT",

  enter(parent, start) {
    this.endText();
    return {
      state: INLINE_SCRIPT as StateDefinition,
      parent,
      start,
      end: start,
      block: false,
      value: {
        start,
        end: start,
      },
    };
  },

  exit(inlineScript) {
    this.options.onScriptlet?.({
      start: inlineScript.start,
      end: inlineScript.end,
      block: inlineScript.block,
      value: {
        start: inlineScript.value.start,
        end: inlineScript.value.end,
      },
    });
  },

  parse(data, _maxPos, inlineScript) {
    this.consumeWhitespace();
    if (data.charCodeAt(this.pos) === CODE.OPEN_CURLY_BRACE) {
      inlineScript.block = true;
      this.pos++; // skip {
      this.enterState(STATE.EXPRESSION).shouldTerminate =
        matchesCloseCurlyBrace;
    } else {
      prepareScriptlet(this.enterState(STATE.EXPRESSION), this);
    }
  },

  return(child, inlineScript) {
    if (inlineScript.block) {
      this.pos++; // skip }
      if (
        this.lookAtCharCodeAhead(0) === CODE.SEMICOLON ||
        this.consumeWhitespaceIfBefore(";")
      ) {
        this.pos++;
      }
    }
    inlineScript.value.start = child.start;
    inlineScript.value.end = child.end;
    this.exitState();
  },
};

const typeKeywords = ["declare", "interface", "type"] as const;

// Sets up an unenclosed scriptlet's expression, whose code starts at `pos`.
// `declare`, `interface` or `type` before a name (or `type` before `{`/`*`,
// as in `import type { A }`) starts a type, which ends differently than
// JavaScript: a trailing `void` or `>` does not continue it. `type = 1` and
// `type in x` stay JavaScript.
export function prepareScriptlet(
  expr: STATE.ExpressionMeta,
  parser: Parser,
  pos = parser.pos,
) {
  expr.operators = true;
  expr.terminatedByEOL = true;

  const { data } = parser;
  while (isIndentCode(data.charCodeAt(pos))) pos++;

  for (const keyword of typeKeywords) {
    if (!parser.lookAheadFor(keyword, pos)) continue;

    let namePos = pos + keyword.length;
    if (!isIndentCode(data.charCodeAt(namePos))) return;
    while (isIndentCode(data.charCodeAt(namePos))) namePos++;

    if (startsTypeName(parser, namePos, keyword === "type")) {
      expr.inType = true;
      expr.forceType = true;
      parser.pos = namePos;
    }
    return;
  }
}

function startsTypeName(parser: Parser, pos: number, allowGroup: boolean) {
  const code = parser.data.charCodeAt(pos);
  if (code === CODE.OPEN_CURLY_BRACE || code === CODE.ASTERISK) {
    return allowGroup;
  }

  if (!isWordCode(code) || (code >= CODE.NUMBER_0 && code <= CODE.NUMBER_9)) {
    return false;
  }

  for (const keyword of binaryKeywords) {
    if (
      parser.lookAheadFor(keyword, pos) &&
      !isWordCode(parser.data.charCodeAt(pos + keyword.length))
    ) {
      return false;
    }
  }

  return true;
}
