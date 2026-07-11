export type TipTapText = {
  type: 'text';
  text: string;
};

export type TipTapParagraph = {
  type: 'paragraph';
  content?: TipTapText[];
};

export type TipTapDocument = {
  type: 'doc';
  content?: TipTapParagraph[];
};
