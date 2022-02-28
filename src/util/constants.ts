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

export interface Range {
  start: number;
  end: number;
}

export interface ExpressionRange extends Range {
  value: Range;
}

export interface TemplateRange extends Range {
  expressions: ExpressionRange[];
  quasis: Range[];
}

export const enum EventTypes {
  Error,
  Text,
  Comment,
  CDATA,
  Declaration,
  DocType,
  Scriptlet,
  Placeholder,
  OpenTagStart,
  TagName,
  TagShorthandId,
  TagShorthandClass,
  TagVar,
  TagArgs,
  TagParams,
  AttrName,
  AttrArgs,
  AttrValue,
  AttrMethod,
  AttrSpread,
  OpenTagEnd,
  CloseTag,
}

export namespace Events {
  export type Any =
    | Error
    | Text
    | Comment
    | CDATA
    | Declaration
    | DocType
    | Placeholder
    | Scriptlet
    | OpenTagStart
    | TagName
    | TagShorthandId
    | TagShorthandClass
    | TagVar
    | TagArgs
    | TagParams
    | AttrName
    | AttrArgs
    | AttrValue
    | AttrMethod
    | AttrSpread
    | OpenTagEnd
    | CloseTag;

  export interface Error extends Range {
    type: EventTypes.Error;
    code: string;
    message: string;
  }

  export interface Text extends Range {
    type: EventTypes.Text;
  }

  export interface Comment extends ExpressionRange {
    type: EventTypes.Comment;
  }

  export interface CDATA extends ExpressionRange {
    type: EventTypes.CDATA;
  }

  export interface Declaration extends ExpressionRange {
    type: EventTypes.Declaration;
  }

  export interface DocType extends ExpressionRange {
    type: EventTypes.DocType;
  }

  export interface Scriptlet extends ExpressionRange {
    type: EventTypes.Scriptlet;
    block: boolean;
  }

  export interface Placeholder extends ExpressionRange {
    type: EventTypes.Placeholder;
    escape: boolean;
  }

  export interface OpenTagStart extends Range {
    type: EventTypes.OpenTagStart;
  }

  export interface TagName extends TemplateRange {
    type: EventTypes.TagName;
  }

  export interface TagShorthandId extends TemplateRange {
    type: EventTypes.TagShorthandId;
  }

  export interface TagShorthandClass extends TemplateRange {
    type: EventTypes.TagShorthandClass;
  }

  export interface TagVar extends ExpressionRange {
    type: EventTypes.TagVar;
  }

  export interface TagArgs extends ExpressionRange {
    type: EventTypes.TagArgs;
  }

  export interface TagParams extends ExpressionRange {
    type: EventTypes.TagParams;
  }

  export interface AttrName extends Range {
    type: EventTypes.AttrName;
    default: boolean;
  }

  export interface AttrArgs extends ExpressionRange {
    type: EventTypes.AttrArgs;
  }

  export interface AttrValue extends ExpressionRange {
    type: EventTypes.AttrValue;
    bound: boolean;
  }

  export interface AttrMethod extends Range {
    type: EventTypes.AttrMethod;
    body: ExpressionRange;
    params: ExpressionRange;
  }

  export interface AttrSpread extends ExpressionRange {
    type: EventTypes.AttrSpread;
  }

  export interface OpenTagEnd extends Range {
    type: EventTypes.OpenTagEnd;
    openTagOnly: boolean;
    selfClosed: boolean;
    statement: boolean;
  }

  export interface CloseTag extends Range {
    type: EventTypes.CloseTag;
    value: Range | undefined;
  }
}
