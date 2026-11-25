// ============================================================
// Minimal client for the Z.AI Open Platform (GLM models).
// Covers exactly what this app needs: text chat, vision chat and
// the platform's web-search function bridge. Everything talks to
// the OpenAI-compatible REST endpoints, so there is no vendor SDK.
//
// Credentials, in resolution order:
//  1. Environment variables - ZAI_BASE_URL + ZAI_API_KEY, with the
//     optional companions ZAI_CHAT_ID / ZAI_USER_ID / ZAI_TOKEN.
//  2. A local credentials file (gitignored) next to package.json,
//     `.ai-credentials.json`. Either the credential object itself
//     or { "credentialsFile": "<path>" } pointing at a mounted
//     secret (Docker/K8s style). ZAI_CONFIG_FILE moves the file.
// ============================================================

import { readFile } from 'fs/promises';
import path from 'path';

export interface GatewayCredentials {
  baseUrl: string;
  apiKey: string;
  chatId?: string;
  userId?: string;
  token?: string;
}

const DEFAULT_CREDENTIALS_FILE = '.ai-credentials.json';

/**
 * Read the local credentials file, following one level of indirection
 * ({"credentialsFile": "<path>"}) so a mounted secret can be referenced
 * without being copied. Re-read from disk on every call - rotated tokens
 * are picked up by the TTL logic in ai.ts without a server restart.
 */
async function readCredentialsFile(filePath: string): Promise<GatewayCredentials> {
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<GatewayCredentials> & { credentialsFile?: string };
  const target = typeof parsed.credentialsFile === 'string' && parsed.credentialsFile.trim()
    ? parsed.credentialsFile.trim()
    : filePath;
  const creds = target !== filePath
    ? (JSON.parse(await readFile(target, 'utf8')) as GatewayCredentials)
    : (parsed as GatewayCredentials);
  if (!creds.baseUrl || !creds.apiKey) {
    throw new Error(`Credentials file ${target} is missing baseUrl / apiKey.`);
  }
  return creds;
}

/** Resolve credentials: environment first, then the local file. */
export async function resolveCredentials(): Promise<GatewayCredentials> {
  const envBaseUrl = process.env.ZAI_BASE_URL;
  const envApiKey = process.env.ZAI_API_KEY;
  if (envBaseUrl && envApiKey) {
    return {
      baseUrl: envBaseUrl,
      apiKey: envApiKey,
      chatId: process.env.ZAI_CHAT_ID || undefined,
      userId: process.env.ZAI_USER_ID || undefined,
      token: process.env.ZAI_TOKEN || undefined,
    };
  }

  const filePath = process.env.ZAI_CONFIG_FILE || path.join(process.cwd(), DEFAULT_CREDENTIALS_FILE);
  const creds = await readCredentialsFile(filePath);
  return {
    baseUrl: creds.baseUrl,
    apiKey: creds.apiKey,
    chatId: creds.chatId || undefined,
    userId: creds.userId || undefined,
    token: creds.token || undefined,
  };
}

// ---------- Request/response types (only what this app consumes) ----------

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface VisionMultimodalContentItem {
  type: 'text' | 'image_url' | 'video_url' | 'file_url';
  text?: string;
  image_url?: { url: string };
  video_url?: { url: string };
  file_url?: { url: string };
}

export interface VisionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | VisionMultimodalContentItem[];
}

export interface ChatCompletionBody {
  model?: string;
  messages: ChatMessage[];
  thinking?: { type: 'enabled' | 'disabled' };
  [key: string]: unknown;
}

export interface VisionCompletionBody {
  model: string;
  messages: VisionMessage[];
  thinking?: { type: 'enabled' | 'disabled' };
}

export interface SearchFunctionResultItem {
  url: string;
  name: string;
  snippet: string;
  host_name: string;
  rank: number;
  date: string;
  favicon: string;
}

export interface SearchFunctionArgs {
  query: string;
  num?: number;
  recency_days?: number;
}

type FunctionMap = {
  web_search: { args: SearchFunctionArgs; result: SearchFunctionResultItem[] };
};
type FunctionName = keyof FunctionMap;

// ---------- Client ----------

export class GatewayClient {
  private creds: GatewayCredentials;

  constructor(creds: GatewayCredentials) {
    this.creds = creds;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.creds.apiKey}`,
      // Routing marker the Z.AI front door expects on every request.
      'X-Z-AI-From': 'Z',
    };
    if (this.creds.chatId) headers['X-Chat-Id'] = this.creds.chatId;
    if (this.creds.userId) headers['X-User-Id'] = this.creds.userId;
    if (this.creds.token) headers['X-Token'] = this.creds.token;
    return headers;
  }

  private endpoint(p: string): string {
    return `${this.creds.baseUrl.replace(/\/+$/, '')}${p}`;
  }

  private async postJson<T>(p: string, body: unknown): Promise<T> {
    const response = await fetch(this.endpoint(p), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
    }
    return (await response.json()) as T;
  }

  readonly chat = {
    completions: {
      /** Text chat completion (OpenAI-compatible payload). */
      create: (body: ChatCompletionBody): Promise<unknown> =>
        this.postJson('/chat/completions', {
          ...body,
          thinking: body.thinking || { type: 'disabled' },
        }),
      /** Vision chat completion (multimodal messages). */
      createVision: (body: VisionCompletionBody): Promise<unknown> =>
        this.postJson('/chat/completions/vision', {
          ...body,
          thinking: body.thinking || { type: 'disabled' },
        }),
    },
  };

  readonly functions = {
    /** Invoke a platform function; currently the web-search bridge. */
    invoke: async <T extends FunctionName>(
      function_name: T,
      args: FunctionMap[T]['args'],
    ): Promise<FunctionMap[T]['result']> => {
      const result = await this.postJson<{ result?: FunctionMap[T]['result'] }>('/functions/invoke', {
        function_name,
        arguments: args,
      });
      return result.result as FunctionMap[T]['result'];
    },
  };
}

export type AIClient = GatewayClient;

/**
 * Build a client. Credentials come from the environment or the local
 * credentials file; `overrides` (used for bring-your-own-key visitors,
 * which always pass both baseUrl and apiKey) win over both.
 */
export async function createAIClient(overrides?: Partial<GatewayCredentials>): Promise<AIClient> {
  let base: GatewayCredentials = { baseUrl: '', apiKey: '' };
  try {
    base = await resolveCredentials();
  } catch {
    // Nothing configured locally - the overrides must carry the credentials.
  }
  const merged = { ...base, ...overrides };
  if (!merged.baseUrl || !merged.apiKey) {
    throw new Error(
      'AI credentials are not configured. Set ZAI_BASE_URL and ZAI_API_KEY (or provide .ai-credentials.json).'
    );
  }
  return new GatewayClient(merged);
}
