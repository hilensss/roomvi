export type ReasoningAttachment = {
  name: string;
  mimeType: string;
  bytes: Buffer;
};

export type StructuredReasoningRequest = {
  taskName: string;
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: Record<string, unknown>;
  attachments: ReasoningAttachment[];
};

export type StructuredReasoningResult = {
  data: unknown;
  provider: string;
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
};
