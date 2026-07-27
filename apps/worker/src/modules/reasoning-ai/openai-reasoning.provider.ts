import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  REASONING_AI_FETCH,
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
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

export class ReasoningAiProviderError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'ReasoningAiProviderError';
  }
}
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
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new ReasoningAiProviderError(
        'OPENAI_API_KEY is not configured',
      );
    }

    const model =
      this.configService.get<string>('REASONING_AI_MODEL') ??
      'gpt-5.6-luna';
    const effort =
      this.configService.get<string>('REASONING_AI_REASONING_EFFORT') ??
      'low';
    const timeoutMs = Number(
      this.configService.get<string>('REASONING_AI_TIMEOUT_MS') ?? 60_000,
    );
    const body = this.buildRequestBody(request, model, effort);

    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await this.send(apiKey, body, timeoutMs);
        return this.parseResponse(response, model);
      } catch (error) {
        lastError = error;
        if (
          attempt === 2 ||
          !(error instanceof ReasoningAiProviderError) ||
          !error.retryable
        ) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  private buildRequestBody(
    request: StructuredReasoningRequest,
    model: string,
    effort: string,
  ) {
    return {
      model,
      store: false,
      max_output_tokens: 12_000,
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
    body: unknown,
    timeoutMs: number,
  ): Promise<OpenAiResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchTransport(
        'https://api.openai.com/v1/responses',
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
        throw new ReasoningAiProviderError(
          `OpenAI Responses request failed with status ${response.status}`,
          response.status === 429 || response.status >= 500,
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

  private parseResponse(
    response: OpenAiResponse,
    model: string,
  ): StructuredReasoningResult {
    const outputText =
      response.output_text ??
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
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
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
