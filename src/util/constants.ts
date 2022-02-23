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

export const enum MODE {
  HTML = 1,
  CONCISE = 2,
}

export const enum BODY_MODE {
  PARSED_TEXT = 1, // Body of a tag is treated as text, but placeholders will be parsed
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

export namespace Events {
  export const enum Types {
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
    type: Types.Error;
    code: string;
    message: string;
  }

  export interface Text extends Range {
    type: Types.Text;
  }

  export interface Comment extends ExpressionRange {
    type: Types.Comment;
  }

  export interface CDATA extends ExpressionRange {
    type: Types.CDATA;
  }

  export interface Declaration extends ExpressionRange {
    type: Types.Declaration;
  }

  export interface DocType extends ExpressionRange {
    type: Types.DocType;
  }

  export interface Scriptlet extends ExpressionRange {
    type: Types.Scriptlet;
    block: boolean;
  }

  export interface Placeholder extends ExpressionRange {
    type: Types.Placeholder;
    escape: boolean;
  }

  export interface OpenTagStart extends Range {
    type: Types.OpenTagStart;
  }

  export interface TagName extends TemplateRange {
    type: Types.TagName;
  }

  export interface TagShorthandId extends TemplateRange {
    type: Types.TagShorthandId;
  }

  export interface TagShorthandClass extends TemplateRange {
    type: Types.TagShorthandClass;
  }

  export interface TagVar extends ExpressionRange {
    type: Types.TagVar;
  }

  export interface TagArgs extends ExpressionRange {
    type: Types.TagArgs;
  }

  export interface TagParams extends ExpressionRange {
    type: Types.TagParams;
  }

  export interface AttrName extends Range {
    type: Types.AttrName;
    default: boolean;
  }

  export interface AttrArgs extends ExpressionRange {
    type: Types.AttrArgs;
  }

  export interface AttrValue extends ExpressionRange {
    type: Types.AttrValue;
    bound: boolean;
  }

  export interface AttrMethod extends Range {
    type: Types.AttrMethod;
    body: ExpressionRange;
    params: ExpressionRange;
  }

  export interface AttrSpread extends ExpressionRange {
    type: Types.AttrSpread;
  }

  export interface OpenTagEnd extends Range {
    type: Types.OpenTagEnd;
    openTagOnly: boolean;
    selfClosed: boolean;
  }

  export interface CloseTag extends Range {
    type: Types.CloseTag;
    value: Range | undefined;
  }
}
