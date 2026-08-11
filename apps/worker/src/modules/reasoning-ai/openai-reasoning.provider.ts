import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  REASONING_AI_FETCH,
  ReasoningAiProviderError,
  type ReasoningAiProvider,
} from './reasoning-ai-provider.interface.js';
import type {
  ReasoningAttachment,
  StructuredReasoningRequest,
  StructuredReasoningResult,
} from './reasoning-ai.types.js';

type FetchTransport = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
  choices?: Array<{
    message?: { content?: string };
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

@Injectable()
export class OpenAiReasoningProvider implements ReasoningAiProvider {
  private readonly fetchTransport: FetchTransport;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(REASONING_AI_FETCH)
    fetchTransport?: FetchTransport,
  ) {
    this.fetchTransport =
      fetchTransport ??
      ((input, init) => globalThis.fetch(input, init));
  }

  async generateStructured(
    request: StructuredReasoningRequest,
  ): Promise<StructuredReasoningResult> {
    const apiKey =
      this.configService.get<string>('REASONING_AI_API_KEY') ??
      this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new ReasoningAiProviderError(
        'REASONING_AI_API_KEY or OPENAI_API_KEY is not configured',
      );
    }

    const model =
      request.model ??
      this.configService.get<string>('REASONING_AI_MODEL') ??
      'gpt-5.6-luna';
    const baseUrl = (
      this.configService.get<string>('REASONING_AI_BASE_URL') ??
      'https://api.openai.com/v1'
    ).replace(/\/+$/, '');
    const effort =
      request.reasoningEffort ??
      this.configService.get<string>('REASONING_AI_REASONING_EFFORT') ??
      'low';
    const timeoutMs =
      request.timeoutMs ??
      Number(
        this.configService.get<string>('REASONING_AI_TIMEOUT_MS') ?? 60_000,
      );
    const apiMode = request.apiMode ?? 'responses';
    const body =
      apiMode === 'chat_completions'
        ? this.buildChatCompletionsRequestBody(request, model)
        : this.buildResponsesRequestBody(request, model, effort);
    const endpointPath =
      apiMode === 'chat_completions' ? '/chat/completions' : '/responses';

    let lastError: unknown;
    const maxAttempts = Math.max(1, Math.min(request.maxAttempts ?? 2, 2));
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await this.send(
          apiKey,
          `${baseUrl}${endpointPath}`,
          body,
          timeoutMs,
        );
        return this.parseResponse(response, model, apiMode);
      } catch (error) {
        lastError = error;
        if (
          attempt === maxAttempts ||
          !(error instanceof ReasoningAiProviderError) ||
          !error.retryable
        ) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  private buildResponsesRequestBody(
    request: StructuredReasoningRequest,
    model: string,
    effort: string,
  ) {
    return {
      model,
      store: false,
      max_output_tokens: request.maxOutputTokens ?? 12_000,
      reasoning: { effort },
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: request.systemPrompt }],
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: request.userPrompt },
            ...request.attachments.map((attachment) =>
              this.toInputAttachment(attachment),
            ),
          ],
        },
      ],
      text: {
        verbosity: 'low',
        format: {
          type: 'json_schema',
          name: this.safeSchemaName(request.taskName),
          strict: true,
          schema: request.jsonSchema,
        },
      },
    };
  }

  private buildChatCompletionsRequestBody(
    request: StructuredReasoningRequest,
    model: string,
  ) {
    if (request.attachments.length > 0) {
      throw new ReasoningAiProviderError(
        'Chat Completions reasoning transport does not support attachments',
      );
    }
    return {
      model,
      max_tokens: request.maxOutputTokens ?? 12_000,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: this.safeSchemaName(request.taskName),
          strict: true,
          schema: request.jsonSchema,
        },
      },
    };
  }

  private toInputAttachment(attachment: ReasoningAttachment) {
    if (!attachment.mimeType.startsWith('image/')) {
      throw new ReasoningAiProviderError(
        `Unsupported reasoning attachment type: ${attachment.mimeType}`,
      );
    }
    return {
      type: 'input_image',
      detail: 'original',
      image_url: `data:${attachment.mimeType};base64,${attachment.bytes.toString('base64')}`,
    };
  }

  private async send(
    apiKey: string,
    endpoint: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<OpenAiResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchTransport(
        endpoint,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const code = await this.readErrorCode(response);
        throw new ReasoningAiProviderError(
          this.httpErrorMessage(response.status, code),
          response.status >= 500 ||
            (response.status === 429 && code !== 'insufficient_quota'),
          response.status,
          code,
        );
      }
      try {
        return (await response.json()) as OpenAiResponse;
      } catch {
        throw new ReasoningAiProviderError(
          'OpenAI returned an invalid response body',
        );
      }
    } catch (error) {
      if (error instanceof ReasoningAiProviderError) throw error;
      const timedOut =
        error instanceof Error && error.name === 'AbortError';
      throw new ReasoningAiProviderError(
        timedOut
          ? 'OpenAI Responses request timed out'
          : 'OpenAI Responses transport failed',
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async readErrorCode(response: Response) {
    try {
      const body = (await response.json()) as {
        error?: { code?: unknown; type?: unknown };
      };
      const code = body?.error?.code ?? body?.error?.type;
      return typeof code === 'string' ? code : undefined;
    } catch {
      return undefined;
    }
  }

  private httpErrorMessage(status: number, code?: string) {
    if (code === 'insufficient_quota') {
      return 'OpenAI API quota is exhausted. Configure API billing or add credits.';
    }
    if (status === 401) return 'OpenAI API key was rejected.';
    if (status === 403) return 'OpenAI API access was denied.';
    if (status === 404) {
      return 'OpenAI model is unavailable for this API project.';
    }
    if (status === 429) return 'OpenAI API rate limit was exceeded.';
    return `OpenAI Responses request failed with status ${status}`;
  }

  private parseResponse(
    response: OpenAiResponse,
    model: string,
    apiMode: 'responses' | 'chat_completions',
  ): StructuredReasoningResult {
    const outputText =
      apiMode === 'chat_completions'
        ? response.choices?.[0]?.message?.content
        : response.output_text ??
          response.output
            ?.flatMap((item) => item.content ?? [])
            .find((content) => content.type === 'output_text')?.text;
    if (!outputText) {
      throw new ReasoningAiProviderError(
        'OpenAI returned no structured output',
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(outputText);
    } catch {
      throw new ReasoningAiProviderError(
        'OpenAI returned invalid structured output',
      );
    }

    return {
      data,
      provider: 'openai',
      model,
      ...(response.usage
        ? {
            usage: {
              inputTokens:
                response.usage.input_tokens ?? response.usage.prompt_tokens,
              outputTokens:
                response.usage.output_tokens ??
                response.usage.completion_tokens,
            },
          }
        : {}),
    };
  }

  private safeSchemaName(taskName: string) {
    return (
      taskName
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 64) || 'structured_response'
    );
  }
}
