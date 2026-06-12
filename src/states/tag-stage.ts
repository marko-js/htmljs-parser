export const UNKNOWN = 0;
export const VAR = 1;
export const ARGUMENT = 2;
export const TYPES = 3;
export const PARAMS = 4;
export const ATTR_GROUP = 5;

export type TagStage =
  | typeof UNKNOWN
  | typeof VAR
  | typeof ARGUMENT
  | typeof TYPES
  | typeof PARAMS
  | typeof ATTR_GROUP;
