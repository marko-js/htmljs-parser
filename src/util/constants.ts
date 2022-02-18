export interface Range {
  pos: number;
  endPos: number;
}

export interface ErrorRange extends Range {
  code: string;
  message: string;
}

export interface ExpressionRange extends Range {
  value: Range;
}

export interface TemplateRange extends Range {
  expressions: ExpressionRange[];
  quasis: Range[];
}

export interface PlaceholderRange extends ExpressionRange {
  escape: boolean;
}

export interface AttrNameRange extends Range {
  default: boolean;
}

export interface AttrValueRange extends Range {
  bound: boolean;
  method: boolean;
  value: undefined | Range;
  argument: undefined | ExpressionRange;
}

export interface ScriptletRange extends ExpressionRange {
  block: boolean;
}

export interface TagEndRange extends Range {
  openTagOnly: boolean;
  selfClosed: boolean;
}

export type Notifications =
  | ["error", ErrorRange]
  | ["text", Range]
  | ["comment", ExpressionRange]
  | ["cdata", ExpressionRange]
  | ["declaration", ExpressionRange]
  | ["doctype", ExpressionRange]
  | ["placeholder", PlaceholderRange]
  | ["scriptlet", ScriptletRange]
  | ["tagStart", Range]
  | ["tagName", TemplateRange]
  | ["tagShorthandId", TemplateRange]
  | ["tagShorthandClass", TemplateRange]
  | ["tagVar", ExpressionRange]
  | ["tagArgs", ExpressionRange]
  | ["tagParams", ExpressionRange]
  | ["attrName", AttrNameRange]
  | ["attrValue", AttrValueRange]
  | ["spreadAttr", ExpressionRange]
  | ["tagEnd", TagEndRange]
  | ["closeTag", ExpressionRange | Range];

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
