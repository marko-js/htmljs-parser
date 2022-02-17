export interface Pos {
  pos: number;
  endPos: number;
}

export interface ErrorPos extends Pos {
  code: string;
  message: string;
}

export interface ExpressionPos extends Pos {
  value: Pos;
}

export interface TemplatePos extends Pos {
  expressions: ExpressionPos[];
  quasis: Pos[];
}

export interface PlaceholderPos extends ExpressionPos {
  escape: boolean;
}

export interface AttrNamePos extends Pos {
  default: boolean;
}

export interface AttrValuePos extends Pos {
  bound: boolean;
  method: boolean;
  value: undefined | Pos;
  argument: undefined | ExpressionPos;
}

export interface ScriptletPos extends ExpressionPos {
  block: boolean;
}

export interface TagEndPos extends Pos {
  openTagOnly: boolean;
  selfClosed: boolean;
}

export type Notifications =
  | ["error", ErrorPos]
  | ["text", Pos]
  | ["comment", ExpressionPos]
  | ["cdata", ExpressionPos]
  | ["declaration", ExpressionPos]
  | ["doctype", ExpressionPos]
  | ["placeholder", PlaceholderPos]
  | ["scriptlet", ScriptletPos]
  | ["tagStart", Pos]
  | ["tagName", TemplatePos]
  | ["tagShorthandId", TemplatePos]
  | ["tagShorthandClass", TemplatePos]
  | ["tagVar", ExpressionPos]
  | ["tagArgs", ExpressionPos]
  | ["tagParams", ExpressionPos]
  | ["attrName", AttrNamePos]
  | ["attrValue", AttrValuePos]
  | ["spreadAttr", ExpressionPos]
  | ["tagEnd", TagEndPos]
  | ["closeTag", ExpressionPos | Pos];

export enum CODE {
  NUMBER_0 = 48,
  NUMBER_9 = 57,
  UPPER_A = 65,
  UPPER_Z = 90,
  LOWER_A = 97,
  LOWER_Z = 122,
  BACK_SLASH = 92,
  FORWARD_SLASH = 47,
  OPEN_ANGLE_BRACKET = 60,
  CLOSE_ANGLE_BRACKET = 62,
  EXCLAMATION = 33,
  QUESTION = 63,
  OPEN_SQUARE_BRACKET = 91,
  CLOSE_SQUARE_BRACKET = 93,
  EQUAL = 61,
  SINGLE_QUOTE = 39,
  DOUBLE_QUOTE = 34,
  BACKTICK = 96,
  OPEN_PAREN = 40,
  CLOSE_PAREN = 41,
  OPEN_CURLY_BRACE = 123,
  CLOSE_CURLY_BRACE = 125,
  ASTERISK = 42,
  HYPHEN = 45,
  HTML_BLOCK_DELIMITER = CODE.HYPHEN,
  DOLLAR = 36,
  PERCENT = 37,
  PERIOD = 46,
  COMMA = 44,
  COLON = 58,
  SEMICOLON = 59,
  NUMBER_SIGN = 35,
  PIPE = 124,
  NEWLINE = 10,
  CARRIAGE_RETURN = 13,
  SPACE = 32,
  TAB = 9,
}

export enum MODE {
  HTML = 1,
  CONCISE = 2,
}

export enum BODY_MODE {
  PARSED_TEXT = 1, // Body of a tag is treated as text, but placeholders will be parsed
}
