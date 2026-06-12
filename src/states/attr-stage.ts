export const UNKNOWN = 0;
export const NAME = 1;
export const VALUE = 2;
export const ARGUMENT = 3;
export const TYPE_PARAMS = 4;
export const BLOCK = 5;

export type AttrStage =
  | typeof UNKNOWN
  | typeof NAME
  | typeof VALUE
  | typeof ARGUMENT
  | typeof TYPE_PARAMS
  | typeof BLOCK;
