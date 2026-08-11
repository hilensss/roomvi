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
  model?: string;
  reasoningEffort?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  maxAttempts?: number;
  apiMode?: 'responses' | 'chat_completions';
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
