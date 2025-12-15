import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private client: any;
  public embeddingModel: string;
  public chatModel: string;

  constructor(private config: ConfigService) {
    this.client = new OpenAI({ apiKey: this.config.get("OPENAI_API_KEY") });
    this.embeddingModel =
      this.config.get("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small";
    this.chatModel = this.config.get("OPENAI_CHAT_MODEL") || "gpt-4o-mini";
  }

  /**
   * Internal helper: delay
   */
  private delay(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  /**
   * Internal helper: normalize different possible response shapes into embeddings array
   */
  private normalizeEmbeddingsResponse(resp: any): number[][] | null {
    // common shapes:
    // resp.data: [{ embedding: [...] }, ...]
    // resp.data.data: [{ embedding: [...] }, ...]
    // some wrappers return resp.data as object with data inside
    if (!resp) return null;

    if (
      Array.isArray(resp.data) &&
      resp.data.length > 0 &&
      resp.data[0].embedding
    ) {
      return resp.data.map((d: any) => d.embedding as number[]);
    }

    if (
      resp?.data?.data &&
      Array.isArray(resp.data.data) &&
      resp.data.data.length > 0
    ) {
      return resp.data.data.map((d: any) => d.embedding as number[]);
    }

    // older/wrapper shapes
    if (
      resp?.data?.length &&
      Array.isArray(resp.data) &&
      resp.data[0].embedding
    ) {
      return resp.data.map((d: any) => d.embedding as number[]);
    }

    return null;
  }

  /**
   * Create embedding for a single text (keeps signature for existing callers).
   * Internally uses batch endpoint for efficiency.
   */
  async createEmbedding(text: string, maxAttempts = 3): Promise<number[]> {
    const res = await this.createEmbeddingBatch([text], maxAttempts);
    if (!res || !Array.isArray(res) || res.length === 0) {
      throw new Error("Embedding response empty");
    }
    return res[0];
  }

  /**
   * Create embeddings for multiple texts in a single request.
   * Returns an array of embedding vectors in the same order as `texts`.
   *
   * Retries on transient errors (429/5xx).
   */
  async createEmbeddingBatch(
    texts: string[],
    maxAttempts = 3,
  ): Promise<number[][]> {
    if (!Array.isArray(texts) || texts.length === 0) return [];

    let attempt = 0;
    let lastErr: any = null;

    // Basic exponential backoff retry
    while (attempt < maxAttempts) {
      attempt++;
      try {
        // OpenAI client embeddings.create accepts array input
        const resp = await this.client.embeddings.create({
          model: this.embeddingModel,
          input: texts,
        });

        const normalized = this.normalizeEmbeddingsResponse(resp);
        if (!normalized) {
          this.logger.error("Unknown embedding batch response shape", resp);
          throw new Error("Embedding response shape not recognized");
        }

        // Ensure same length
        if (normalized.length !== texts.length) {
          this.logger.warn(
            `Embedding batch returned ${normalized.length} vectors for ${texts.length} inputs`,
          );
        }

        return normalized;
      } catch (err: any) {
        lastErr = err;
        this.logger.warn(
          `createEmbeddingBatch attempt ${attempt} failed: ${String(err?.message ?? err)}`,
        );

        // If last attempt, break and throw below
        if (attempt >= maxAttempts) break;

        // Backoff: increase wait for subsequent attempts
        const backoffMs = 200 * Math.pow(2, attempt); // 400, 800, 1600...
        this.logger.log(
          `Retrying createEmbeddingBatch in ${backoffMs}ms (attempt ${attempt + 1})`,
        );
        await this.delay(backoffMs);
      }
    }

    this.logger.error("createEmbeddingBatch failed after retries", lastErr);
    throw lastErr ?? new Error("createEmbeddingBatch failed");
  }

  async createChatCompletion(
    messages: { role: string; content: string }[],
    max_tokens = 600,
  ) {
    return this.client.chat.completions.create({
      model: this.chatModel,
      messages,
      max_tokens,
    });
  }
}
