export const enum CODE {
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
  HTML_BLOCK_DELIMITER = 45,
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

export const enum BODY_MODE {
  HTML,
  PARSED_TEXT, // Body of a tag is treated as text, but placeholders will be parsed
}

export interface Position {
  line: number;
  column: number;
}

export interface Location {
  start: Position;
  end: Position;
}

export interface Range {
  start: number;
  end: number;
}

export namespace Ranges {
  export interface Value extends Range {
    value: Range;
  }

  export interface Template extends Range {
    expressions: Value[];
    quasis: Range[];
  }

  export interface Error extends Range {
    code: string;
    message: string;
  }

  export interface Scriptlet extends Value {
    block: boolean;
  }

  export interface Placeholder extends Value {
    escape: boolean;
  }

  export interface TagName extends Template {
    concise: boolean;
  }

  export interface AttrValue extends Value {
    bound: boolean;
  }

  export interface AttrMethod extends Range {
    body: Value;
    params: Value;
  }

  export interface OpenTagEnd extends Range {
    ending: OpenTagEnding;
  }

  export interface CloseTag extends Range {
    value: Range | undefined;
  }
}

export const enum OpenTagEnding {
  tag = 0,
  self = 1 << 0,
  void = 1 << 1,
  code = 1 << 2,
}

export interface Handlers {
  onError?(data: Ranges.Error): void;
  onText?(data: Range): void;
  onComment?(data: Ranges.Value): void;
  onCDATA?(data: Ranges.Value): void;
  onDeclaration?(data: Ranges.Value): void;
  onDoctype?(data: Ranges.Value): void;
  onScriptlet?(data: Ranges.Scriptlet): void;
  onPlaceholder?(data: Ranges.Placeholder): void;
  onTagName?(data: Ranges.TagName): void;
  onTagShorthandId?(data: Ranges.Template): void;
  onTagShorthandClass?(data: Ranges.Template): void;
  onTagVar?(data: Ranges.Value): void;
  onTagArgs?(data: Ranges.Value): void;
  onTagParams?(data: Ranges.Value): void;
  onAttrName?(data: Range): void;
  onAttrArgs?(data: Ranges.Value): void;
  onAttrValue?(data: Ranges.AttrValue): void;
  onAttrMethod?(data: Ranges.AttrMethod): void;
  onAttrSpread?(data: Ranges.Value): void;
  onOpenTagEnd?(data: Ranges.OpenTagEnd): void;
  onCloseTag?(data: Ranges.CloseTag): void;
}
