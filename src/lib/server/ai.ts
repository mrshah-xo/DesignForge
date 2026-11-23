// ============================================================
// AI pipeline helpers (server only).
// Wraps gateway-client with JSON-extraction + retry logic and
// provides normalizeTokens(), the bulletproof DesignTokens
// normalizer that guarantees the frontend never crashes.
// ============================================================

import ZAI, {
  type SearchFunctionResultItem,
  type VisionMultimodalContentItem,
} from 'gateway-client';
import type {
  ColorRole,
  ColorToken,
  DesignTokens,
  PaletteStep,
  PreviewCopy,
  PreviewFeatureIcon,
} from '@/lib/types';
import { DEFAULT_PREVIEW_COPY, FONT_OPTIONS, ZAI_KEY_URL } from '@/lib/types';
import {
  bestTextColor,
  colorNameFromHex,
  contrastRatio,
  darkenHex,
  lightenHex,
  mixHex,
} from '@/lib/server/logo-image';

// ---------- SDK singleton ----------

let zaiPromise: Promise<ZAI> | null = null;
let zaiCreatedAt = 0;

/**
 * Re-read credentials (e.g. refreshed token in /etc/ai-gateway.json) after this
 * much time, so a long-running dev server never gets stuck on stale config.
 */
const ZAI_TTL_MS = 10 * 60 * 1000;

/**
 * Raised when a request needs an AI key but none was provided and the site
 * owner's key is not allowed to serve public traffic. The UI catches the
 * `requiresUserKey` flag and opens the API-keys panel.
 */
export class MissingUserKeyError extends Error {
  readonly requiresUserKey = true as const;
  constructor() {
    super(
      'This site runs on bring-your-own keys. Click "API keys" in the header and paste your own Z.AI key - generate one free at ' +
        ZAI_KEY_URL +
        '. Your key is stored only in your browser and is used just for your own generations.',
    );
    this.name = 'MissingUserKeyError';
  }
}

/** True when the error is the BYOK gate (as opposed to a provider failure). */
export function isMissingUserKey(err: unknown): boolean {
  return err instanceof MissingUserKeyError;
}

/**
 * Extract the visitor's BYOK key from the x-user-key request header.
 * Returns null when absent/invalid. The value is used per-request only -
 * it is never persisted, logged, or echoed back.
 */
export function userKeyFromRequest(req: Request): string | null {
  const raw = req.headers.get('x-user-key');
  if (!raw) return null;
  const key = raw.trim();
  if (key.length < 8 || key.length > 256 || /\s/.test(key)) return null;
  return key;
}

/**
 * Fail fast at POST time when the request would hit the BYOK gate, so the
 * client gets a structured 401 + requiresUserKey instead of a job that dies
 * mid-pipeline. Cheap: getZAI caches the client it builds.
 */
export async function assertAiUsable(userKey?: string | null): Promise<void> {
  await getZAI(userKey);
}

/** Detect credential/auth failures returned by the remote API. */
export function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('401') || msg.includes('X-Token');
}

/** Drop the cached SDK instance so the next call re-reads the config file. */
export function resetZAI(): void {
  zaiPromise = null;
  zaiCreatedAt = 0;
}

/**
 * Whether the site owner's own credentials may serve AI requests.
 * Local dev: always. Production (Vercel): opt-in via ZAI_ALLOW_OWNER_KEY=1 -
 * by default public visitors must bring their own key so the owner's
 * credits are never spent by strangers.
 */
function ownerKeyAllowed(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  const flag = (process.env.ZAI_ALLOW_OWNER_KEY ?? '').toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

/**
 * Build the SDK client. On normal dev environments the credentials come from the
 * provisioned /etc/ai-gateway.json (ZAI.create() file lookup). On deployments
 * like Vercel there is no writable config location, so the same JSON shape
 * is supplied through environment variables instead:
 *
 *   ZAI_BASE_URL   (required with ZAI_API_KEY)
 *   ZAI_API_KEY    (required with ZAI_BASE_URL)
 *   ZAI_CHAT_ID    (optional)
 *   ZAI_USER_ID    (optional)
 *   ZAI_TOKEN      (optional)
 */
function createZAI(): Promise<ZAI> {
  const baseUrl = process.env.ZAI_BASE_URL;
  const apiKey = process.env.ZAI_API_KEY;
  if (baseUrl && apiKey) {
    return Promise.resolve(
      // @ts-expect-error - SDK types the constructor private; the runtime
      // accepts the options object and this branch is how Vercel gets credentials.
      new ZAI({
        baseUrl,
        apiKey,
        chatId: process.env.ZAI_CHAT_ID || undefined,
        userId: process.env.ZAI_USER_ID || undefined,
        token: process.env.ZAI_TOKEN || undefined,
      })
    );
  }
  return ZAI.create().catch((err) => {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      'AI service is not configured on this deployment (missing ZAI_BASE_URL / ZAI_API_KEY). ' +
        'The site owner must add these environment variables. Meanwhile, everything still works ' +
        'for free through the "Want a prompt?" flow - copy the prompt, let your agent fill it in, ' +
        'and paste the result back. Original error: ' + detail
    );
  });
}

// ---------- Per-visitor clients (bring-your-own-key) ----------

interface UserClientEntry {
  promise: Promise<ZAI>;
  createdAt: number;
}

/** Cached per visitor key (in-memory only, TTL'd, never logged). */
const userClients = new Map<string, UserClientEntry>();
const MAX_USER_CLIENTS = 100;

function pruneUserClients(): void {
  const now = Date.now();
  for (const [key, entry] of userClients) {
    if (now - entry.createdAt > ZAI_TTL_MS) userClients.delete(key);
  }
  while (userClients.size > MAX_USER_CLIENTS) {
    const oldest = [...userClients.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
    if (!oldest) break;
    userClients.delete(oldest[0]);
  }
}

/** Drop one visitor's cached client (used when their key is rejected). */
function evictUserClient(userKey: string): void {
  userClients.delete(userKey);
}

/** Build a client for a visitor's own key against the public Z.AI endpoint. */
function createUserClient(userKey: string): Promise<ZAI> {
  const baseUrl = process.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4';
  return Promise.resolve(
    // @ts-expect-error - SDK types the constructor private (see createZAI).
    new ZAI({ baseUrl, apiKey: userKey })
  );
}

/**
 * Create (once) and return the ZAI SDK instance for this request.
 * - A visitor key (BYOK) gets its own cached client - the owner's
 *   credentials are never touched for those calls.
 * - Without a key, the owner's credentials are used only where allowed
 *   (local dev, or production with ZAI_ALLOW_OWNER_KEY=1); otherwise the
 *   BYOK gate raises MissingUserKeyError.
 * - Failed creations are never cached: the next call retries automatically.
 * - Instances older than ZAI_TTL_MS are recreated to pick up refreshed tokens.
 */
export async function getZAI(userKey?: string | null): Promise<ZAI> {
  const key = typeof userKey === 'string' && userKey.trim() ? userKey.trim() : null;
  if (key) {
    const cached = userClients.get(key);
    if (cached && Date.now() - cached.createdAt <= ZAI_TTL_MS) return cached.promise;
    const entry: UserClientEntry = {
      promise: createUserClient(key).catch((err) => {
        userClients.delete(key);
        throw err;
      }),
      createdAt: Date.now(),
    };
    userClients.set(key, entry);
    pruneUserClients();
    return entry.promise;
  }

  // Owner-credential path (local dev or explicit opt-in on production).
  if (!ownerKeyAllowed()) {
    // Production without opt-in: never spend the owner's credits on
    // anonymous traffic - visitors must bring their own key.
    throw new MissingUserKeyError();
  }
  if (!zaiPromise || Date.now() - zaiCreatedAt > ZAI_TTL_MS) {
    zaiCreatedAt = Date.now();
    zaiPromise = createZAI().catch((err) => {
      // Do not cache failures - allow the next call to create a fresh instance.
      zaiPromise = null;
      throw err;
    });
  }
  return zaiPromise;
}

// ---------- JSON extraction ----------

/** Remove surrounding ```json / ``` fences and trim. */
export function stripFences(text: string): string {
  let out = (text ?? '').trim();
  if (out.startsWith('```')) {
    out = out.replace(/^```[a-zA-Z0-9_-]*[ \t]*\r?\n?/, '');
  }
  if (out.endsWith('```')) {
    out = out.replace(/\r?\n?[ \t]*```$/, '');
  }
  return out.trim();
}

/**
 * Scan for the first balanced {...} / [...] block (string-aware).
 * Returns the candidate substring, or null when the scan never closes.
 */
function balancedSlice(cleaned: string, start: number): string | null {
  const open = cleaned[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  return null;
}

/** Drop illegal trailing commas before a closing bracket (a common LLM slip). */
function stripTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, '$1');
}

/**
 * Salvage near-JSON model output. Strategies, tried in order:
 *  1. strip trailing commas (e.g. `[1,2,3,]`) and parse;
 *  2. prose glued after the JSON block - cut at the last balanced close;
 *  3. truncated output (finish_reason=length) - repeatedly cut back to the
 *     last complete element, close the open strings/brackets and parse.
 * Returns null when nothing parses. The themes/design pipelines always
 * re-normalize the result, so a partially-repaired payload is still safe.
 */
export function repairJson(cleaned: string, start: number): unknown | null {
  // Strategy 1: trailing commas.
  const strict = balancedSlice(cleaned, start);
  if (strict) {
    try {
      return JSON.parse(stripTrailingCommas(strict));
    } catch {
      // fall through to the other strategies
    }
  }

  // Strategy 2 + 3: work on a shrinking window that always ends just after
  // a complete structural element, appending the missing closers.
  let work = cleaned.slice(start);
  for (let round = 0; round < 12; round++) {
    // Close an unterminated string, then every open bracket, innermost first.
    let inString = false;
    let escaped = false;
    const stack: string[] = [];
    for (let i = 0; i < work.length; i++) {
      const ch = work[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' || ch === ']') stack.pop();
    }
    let candidate = work;
    if (inString) candidate += '"';
    candidate += stack
      .reverse()
      .map((ch) => (ch === '{' ? '}' : ']'))
      .join('');
    try {
      return JSON.parse(stripTrailingCommas(candidate));
    } catch {
      // Cut back: drop the last incomplete member. Find the last structural
      // close (} or ]) outside strings and slice just after it, then strip
      // any dangling `,` / `:` fragments.
      let cut = -1;
      inString = false;
      escaped = false;
      for (let i = 0; i < work.length; i++) {
        const ch = work[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === '\\') escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') inString = true;
        else if (ch === '}' || ch === ']') cut = i;
      }
      if (cut <= 0) return null;
      work = work.slice(0, cut + 1).replace(/,\s*$/, '').replace(/:\s*$/, '');
      if (!work) return null;
    }
  }
  return null;
}

/**
 * Extract the first balanced {...} or [...] block (string-aware) and
 * JSON.parse it. Falls back to lenient repair (truncation, trailing
 * commas, glued prose) before throwing a descriptive error.
 */
export function extractJson<T = unknown>(text: string): T {
  const cleaned = stripFences(text ?? '');
  const start = cleaned.search(/[{[]/);
  if (start === -1) {
    throw new Error('No JSON object or array found in model response.');
  }

  const balanced = balancedSlice(cleaned, start);
  if (balanced) {
    try {
      return JSON.parse(balanced) as T;
    } catch {
      // Not valid as-is - let the repair pass take over below.
    }
  }

  const repaired = repairJson(cleaned, start);
  if (repaired !== null) return repaired as T;

  if (balanced) {
    try {
      JSON.parse(balanced);
    } catch (err) {
      throw new Error(
        `Failed to parse JSON from model response: ${err instanceof Error ? err.message : String(err)}. Snippet: ${balanced.slice(0, 200)}`,
      );
    }
  }
  throw new Error('Unbalanced JSON block in model response.');
}

// ---------- Model response helpers ----------

interface RawChatResponse {
  choices?: Array<{
    finish_reason?: unknown;
    message?: { content?: unknown; reasoning_content?: unknown };
  }>;
  model?: unknown;
}

/** Some gateways return content as an array of typed parts; join the text ones. */
function joinContentParts(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part === 'object' && part !== null && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text: string }).text;
        }
        return '';
      })
      .join('');
  }
  return '';
}

/**
 * Read the text out of a chat-completion response, tolerating the response
 * shapes different gateways/models produce:
 *  - string content (standard);
 *  - array-of-parts content;
 *  - reasoning models that leave `content` empty and put the answer in
 *    `reasoning_content`.
 * Empty text signals a provider-side problem (content filter, exhausted
 * quota, model unavailable) - callers treat it as a retryable failure.
 */
export function messageText(res: unknown): { text: string; finishReason: string; model: string } {
  const r = (res ?? {}) as RawChatResponse;
  const choice = Array.isArray(r.choices) ? r.choices[0] : undefined;
  const message = choice?.message ?? {};
  let text = joinContentParts(message.content);
  if (!text.trim()) text = joinContentParts(message.reasoning_content);
  return {
    text: typeof text === 'string' ? text : '',
    finishReason: typeof choice?.finish_reason === 'string' ? choice.finish_reason : 'unknown',
    model: typeof r.model === 'string' ? r.model : '',
  };
}

/**
 * Some gateways deliver provider-side problems (rate limits, overload, quota,
 * content filters) as HTTP 200 with an empty/error payload instead of an HTTP
 * error the SDK would throw. Dig a human-readable hint out of that payload so
 * the "empty response" error says WHY, not just that it happened.
 */
export function providerErrorHint(res: unknown): string {
  if (typeof res !== 'object' || res === null) return '';
  const r = res as { error?: unknown; message?: unknown };
  if (typeof r.error === 'string' && r.error.trim()) return r.error.trim();
  if (typeof r.message === 'string' && r.message.trim()) return r.message.trim();
  if (typeof r.error === 'object' && r.error !== null) {
    const inner = (r.error as { message?: unknown }).message;
    if (typeof inner === 'string' && inner.trim()) return inner.trim();
  }
  return '';
}

/**
 * Raised when the gateway answers 200 but the model content is empty.
 * Retryable - retryDelayMs() gives it a longer, rate-limit-aware schedule
 * because these failures usually come in bursts (a bad window, not one blip).
 */
export class EmptyResponseError extends Error {
  readonly finishReason: string;
  readonly modelName: string;
  constructor(finishReason: string, modelName: string, hint: string) {
    super(
      `Model returned an empty response (finish_reason=${finishReason}${modelName ? `, model=${modelName}` : ''})` +
        (hint ? `. Provider said: "${hint}"` : '') +
        '. This usually means the provider rate-limited the request, the model is temporarily unavailable, or the quota is exhausted.',
    );
    this.name = 'EmptyResponseError';
    this.finishReason = finishReason;
    this.modelName = modelName;
  }
}

const RETRY_NOTE_BASE =
  'Your previous response was not valid JSON. Respond AGAIN with ONLY the raw JSON object - start with { and end with }. No prose, no explanations, no markdown fences, no code block.';

/** Retry note that tells the model WHY its last output failed, so it can self-correct. */
function retryNote(lastReason: string): string {
  const reason = lastReason.trim().slice(0, 300);
  return reason ? `${RETRY_NOTE_BASE} Previous failure: "${reason}".` : RETRY_NOTE_BASE;
}

function backoffMs(attempt: number): number {
  return 1000 * 2 ** attempt; // 1s, 2s, 4s...
}

/**
 * Hard wall-clock cap for a single LLM/search attempt. Without it a hung
 * gateway socket would eat the whole pipeline budget; with it the retry
 * loop (and the job heartbeat) keeps moving. The losing promise is left
 * to settle unobserved - harmless - while the caller proceeds.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The dev environment periodically rotates the token in /etc/ai-gateway.json; calls made
 * during the swap fail with 401 / "missing X-Token header" for a few seconds.
 * Wait generously on auth errors (and re-read the config via resetZAI) so a
 * rotation is ridden out inside the retry loop instead of failing the job.
 */
const AUTH_BACKOFF_MS = 6000;

/** Wall-clock cap for one chat-completion attempt (text JSON + markdown). */
const CHAT_TIMEOUT_MS = 75 * 1000;
/** Wall-clock cap for one vision (logo analysis) attempt - image upload is slower. */
const VISION_TIMEOUT_MS = 90 * 1000;
/** Wall-clock cap for one web-search attempt. */
const SEARCH_TIMEOUT_MS = 30 * 1000;

function retryDelayMs(err: unknown, attempt: number): number {
  if (isAuthError(err)) return AUTH_BACKOFF_MS * (attempt + 1);
  // Empty/filtered responses arrive in bursts (rate-limit windows, provider
  // hiccups) - wait long enough to land outside the same bad window without
  // stalling the pipeline for minutes (the old 3s/8s/13s schedule made a
  // single call with retries take 25s+ of pure waiting).
  if (err instanceof EmptyResponseError) return 1500 + 2500 * attempt; // 1.5s, 4s, 6.5s
  return backoffMs(attempt);
}

async function waitOut(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exhausted-retries error: distinguishes the visitor's own key from owner credentials. */
function finalError(label: string, attempts: number, err: unknown, lastRaw = '', userKey?: string | null): Error {
  if (isAuthError(err)) {
    if (userKey) {
      return new Error(
        'Your Z.AI API key was rejected (auth error). Open the "API keys" panel and check the key - generate a fresh one at ' +
          ZAI_KEY_URL + '. Make sure the key has available credit/quota.',
      );
    }
    return new Error(
      'AI credentials were just rotated and the request was rejected. '
      + 'Please try again in a few seconds - retries now wait out credential rotations automatically.',
    );
  }
  const reason = err instanceof Error ? err.message : String(err);
  const suffix = lastRaw ? `. Last raw output: ${lastRaw.slice(0, 500)}` : '';
  return new Error(`${label} failed after ${attempts} attempts: ${reason}${suffix}`);
}

// ---------- LLM calls ----------

/**
 * Model overrides via env, so deployments can pick free-tier models:
 *   ZAI_TEXT_MODEL         (e.g. glm-4.5-flash - free on the Z.AI Open Platform)
 *   ZAI_TEXT_MODEL_FALLBACK (optional - second model for late retry attempts)
 *   ZAI_VISION_MODEL       (e.g. glm-4.6v - used for logo analysis)
 * Unset ZAI_TEXT_MODEL keeps the gateway's default text model.
 */
const TEXT_MODEL = process.env.ZAI_TEXT_MODEL || undefined;
const VISION_MODEL = process.env.ZAI_VISION_MODEL || 'glm-4.6v';

/**
 * Retry attempts 2+ rotate to a second model, so a temporarily unavailable
 * or rate-limited primary model cannot sink every attempt in a row (the
 * "LLM JSON generation failed after 4 attempts: empty response" failure
 * mode). Default: glm-4.5-flash (free) unless the primary already is that
 * model - then the gateway default is used instead.
 */
function fallbackTextModel(): string | undefined {
  const explicit = process.env.ZAI_TEXT_MODEL_FALLBACK?.trim();
  if (explicit) return explicit;
  const primary = TEXT_MODEL?.trim().toLowerCase() ?? '';
  return primary === 'glm-4.5-flash' ? undefined : 'glm-4.5-flash';
}

/** Which model a given attempt uses: late attempts rotate to the fallback. */
function modelForAttempt(attempt: number): string | undefined {
  const fallback = fallbackTextModel();
  if (attempt >= 2 && fallback && fallback !== TEXT_MODEL) return fallback;
  return TEXT_MODEL;
}

/**
 * One chat-completion attempt, shared by llmJson and llmText. Throws
 * EmptyResponseError (retryable, rate-limit-aware) when the model returns
 * no usable text - provider rate limits, overload, or quota events that
 * some gateways deliver as HTTP 200 with an empty/error payload.
 * Every attempt is wall-clock capped (CHAT_TIMEOUT_MS) so a hung socket
 * cannot stall the pipeline.
 */
async function chatTextOnce(
  zai: ZAI,
  messages: Array<{ role: 'assistant' | 'user'; content: string }>,
  modelOverride: string | undefined,
  maxTokens: number,
): Promise<string> {
  const res = await withTimeout(
    zai.chat.completions.create({
      ...(modelOverride ? { model: modelOverride } : {}),
      messages,
      thinking: { type: 'disabled' },
      max_tokens: maxTokens,
    }),
    CHAT_TIMEOUT_MS,
    'Chat completion',
  );
  const { text, finishReason, model } = messageText(res);
  if (!text.trim()) {
    console.error(
      `chatTextOnce: empty response (finish_reason=${finishReason}, model=${model || modelOverride || 'default'}):`,
      JSON.stringify(res ?? {}).slice(0, 300),
    );
    throw new EmptyResponseError(finishReason, model || modelOverride || 'default', providerErrorHint(res));
  }
  return text;
}

/** Fired before every attempt so callers can surface live progress + heartbeats. */
export type AttemptHook = (attempt: number, attempts: number) => void;

/**
 * Text LLM call parsed as JSON, with retries + exponential backoff.
 * maxTokens defaults high (16k) because model-side defaults truncate around
 * 4k tokens - long JSON payloads (research reports, design tokens) get cut
 * mid-structure and parse as "unbalanced JSON" on every retry.
 */
export async function llmJson<T>(
  system: string,
  user: string,
  attempts = 4,
  maxTokens = 16000,
  userKey?: string | null,
  onAttempt?: AttemptHook,
): Promise<T> {
  const zai = await getZAI(userKey);
  let lastRaw = '';
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      onAttempt?.(attempt + 1, attempts);
      const messages: Array<{ role: 'assistant' | 'user'; content: string }> = [
        { role: 'assistant', content: system },
        { role: 'user', content: user },
      ];
      if (attempt > 0) {
        const reason = lastError instanceof Error ? lastError.message : '';
        messages.push({ role: 'user', content: retryNote(reason) });
      }
      const text = await chatTextOnce(zai, messages, modelForAttempt(attempt), maxTokens);
      lastRaw = text;
      try {
        return extractJson<T>(text);
      } catch (parseErr) {
        // Keep the raw output for server-side debugging before rethrowing.
        console.error(
          `llmJson: unparseable output (attempt ${attempt + 1}/${attempts}, first 400 chars):`,
          text.slice(0, 400).replace(/\s+/g, ' '),
        );
        throw parseErr;
      }
    } catch (err) {
      lastError = err;
      console.error(`llmJson attempt ${attempt + 1}/${attempts} failed:`, err instanceof Error ? err.message : err);
      // Stale credentials? Drop the cached SDK so the next attempt re-reads config.
      if (isAuthError(err)) {
        if (userKey) evictUserClient(userKey);
        else resetZAI();
      }
      if (attempt < attempts - 1) await waitOut(retryDelayMs(err, attempt));
    }
  }
  throw finalError('LLM JSON generation', attempts, lastError, lastRaw, userKey);
}

/** Vision LLM call (logo analysis) parsed as JSON, with retries. */
export async function visionJson<T>(prompt: string, base64Png: string, attempts = 3, userKey?: string | null): Promise<T> {
  const zai = await getZAI(userKey);
  let lastRaw = '';
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const content: VisionMultimodalContentItem[] = [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Png}` } },
      ];
      if (attempt > 0) {
        const reason = lastError instanceof Error ? lastError.message : '';
        content.push({ type: 'text', text: retryNote(reason) });
      }
      const res = await withTimeout(
        zai.chat.completions.createVision({
          model: VISION_MODEL,
          messages: [{ role: 'user', content }],
          thinking: { type: 'disabled' },
        }),
        VISION_TIMEOUT_MS,
        'Vision analysis',
      );
      const { text, finishReason, model } = messageText(res);
      lastRaw = text;
      if (!text.trim()) {
        throw new EmptyResponseError(finishReason, model || VISION_MODEL, providerErrorHint(res));
      }
      return extractJson<T>(text);
    } catch (err) {
      lastError = err;
      console.error(`visionJson attempt ${attempt + 1}/${attempts} failed:`, err instanceof Error ? err.message : err);
      if (isAuthError(err)) {
        if (userKey) evictUserClient(userKey);
        else resetZAI();
      }
      if (attempt < attempts - 1) await waitOut(retryDelayMs(err, attempt));
    }
  }
  throw finalError('Vision JSON generation', attempts, lastError, lastRaw, userKey);
}

/**
 * Plain-text LLM call (used for DESIGN.md markdown), with retries.
 * maxTokens defaults high (16k) because the corpus-trained DESIGN.md runs
 * 300-450 lines; model-side defaults truncate around 4k tokens and cut
 * the document before its final sections.
 */
export async function llmText(
  system: string,
  user: string,
  attempts = 3,
  maxTokens = 16000,
  userKey?: string | null,
  onAttempt?: AttemptHook,
): Promise<string> {
  const zai = await getZAI(userKey);
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      onAttempt?.(attempt + 1, attempts);
      return await chatTextOnce(
        zai,
        [
          { role: 'assistant', content: system },
          { role: 'user', content: user },
        ],
        modelForAttempt(attempt),
        maxTokens,
      );
    } catch (err) {
      lastError = err;
      console.error(`llmText attempt ${attempt + 1}/${attempts} failed:`, err instanceof Error ? err.message : err);
      if (isAuthError(err)) {
        if (userKey) evictUserClient(userKey);
        else resetZAI();
      }
      if (attempt < attempts - 1) await waitOut(retryDelayMs(err, attempt));
    }
  }
  throw finalError('LLM text generation', attempts, lastError, '', userKey);
}

/** Real internet web search via the SDK function-calling bridge (with retry). */
export async function webSearch(query: string, num = 5, userKey?: string | null): Promise<SearchFunctionResultItem[]> {
  let lastError: unknown = null;
  const attempts = 3;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const zai = await getZAI(userKey);
      const results = await withTimeout(
        zai.functions.invoke('web_search', { query, num }),
        SEARCH_TIMEOUT_MS,
        'Web search',
      );
      return Array.isArray(results) ? results : [];
    } catch (err) {
      lastError = err;
      console.error(`webSearch attempt ${attempt + 1}/${attempts} failed:`, err instanceof Error ? err.message : err);
      if (isAuthError(err)) {
        if (userKey) evictUserClient(userKey);
        else resetZAI();
      }
      if (attempt < attempts - 1) await waitOut(retryDelayMs(err, attempt));
    }
  }
  if (isAuthError(lastError)) return Promise.reject(finalError('Web search', attempts, lastError, '', userKey));
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ---------- DesignTokens normalization ----------

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const CSS_LENGTH_RE = /^-?\d*\.?\d+(rem|em|px|pt|%|vh|vw|vmin|vmax|ch|ex|cm|mm|in)$/i;

function isHex(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Non-empty string → trimmed, else null. */
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function cssLength(v: unknown, fallback: string): string {
  return typeof v === 'string' && CSS_LENGTH_RE.test(v.trim()) ? v.trim() : fallback;
}

function cssShadow(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() && /(px|rgb)/.test(v) ? v.trim() : fallback;
}

/** Keep string array entries, trim, drop empties, cap. */
function stringList(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .map((s) => s.trim())
    .slice(0, cap);
}

// ---------- PreviewCopy normalization ----------

const FEATURE_ICONS: readonly PreviewFeatureIcon[] = ['sparkles', 'shield', 'zap', 'check'];

/** Trim + cap copy strings so a runaway LLM cannot break the preview layout. */
function copyText(v: unknown, fallback: string, max: number): string {
  const s = str(v);
  return s ? (s.length > max ? s.slice(0, max).trimEnd() : s) : fallback;
}

function copyAlert(v: unknown, fallback: { title: string; text: string }): { title: string; text: string } {
  const r = isPlainObject(v) ? v : {};
  return {
    title: copyText(r.title, fallback.title, 40),
    text: copyText(r.text, fallback.text, 120),
  };
}

/**
 * Domain-aware preview copy with neutral fallbacks. Guarantees a complete
 * PreviewCopy object; caps lengths so the preview layout never overflows.
 */
function normalizePreviewCopy(raw: unknown): PreviewCopy {
  const root = isPlainObject(raw) ? raw : {};
  const navLinks = stringList(root.navLinks, 6)
    .map((s) => copyText(s, '', 16))
    .filter((s) => s.length > 0)
    .slice(0, 4);
  const featureCards = (Array.isArray(root.featureCards) ? root.featureCards : [])
    .slice(0, 3)
    .map((c, i) => {
      const r = isPlainObject(c) ? c : {};
      const icon = FEATURE_ICONS.includes(r.icon as PreviewFeatureIcon)
        ? (r.icon as PreviewFeatureIcon)
        : FEATURE_ICONS[i % FEATURE_ICONS.length];
      return {
        icon,
        title: copyText(r.title, DEFAULT_PREVIEW_COPY.featureCards[i % 3].title, 32),
        text: copyText(r.text, DEFAULT_PREVIEW_COPY.featureCards[i % 3].text, 110),
      };
    });
  const alertsRoot = isPlainObject(root.alerts) ? root.alerts : {};
  // Accept both shapes: pricing: { features: [...] } and pricing: [...].
  const pricingRoot = isPlainObject(root.pricing) ? root.pricing : {};
  const pricingFeatures = stringList(
    Array.isArray(root.pricing) ? root.pricing : pricingRoot.features,
    6,
  );
  const testimonialRoot = isPlainObject(root.testimonial) ? root.testimonial : {};
  return {
    navLinks: navLinks.length >= 2 ? navLinks : DEFAULT_PREVIEW_COPY.navLinks,
    navCta: copyText(root.navCta, DEFAULT_PREVIEW_COPY.navCta, 24),
    heroHeadline: copyText(root.heroHeadline, DEFAULT_PREVIEW_COPY.heroHeadline, 70),
    heroSubhead: copyText(root.heroSubhead, DEFAULT_PREVIEW_COPY.heroSubhead, 180),
    primaryCta: copyText(root.primaryCta, DEFAULT_PREVIEW_COPY.primaryCta, 28),
    secondaryCta: copyText(root.secondaryCta, DEFAULT_PREVIEW_COPY.secondaryCta, 28),
    featureCards: featureCards.length ? featureCards : DEFAULT_PREVIEW_COPY.featureCards,
    pricing: {
      features:
        pricingFeatures.length >= 3 ? pricingFeatures.slice(0, 5) : DEFAULT_PREVIEW_COPY.pricing.features,
    },
    testimonial: {
      quote: copyText(testimonialRoot.quote, DEFAULT_PREVIEW_COPY.testimonial.quote, 220),
      author: copyText(testimonialRoot.author, DEFAULT_PREVIEW_COPY.testimonial.author, 40),
      role: copyText(testimonialRoot.role, DEFAULT_PREVIEW_COPY.testimonial.role, 60),
    },
    alerts: {
      success: copyAlert(alertsRoot.success, DEFAULT_PREVIEW_COPY.alerts.success),
      warning: copyAlert(alertsRoot.warning, DEFAULT_PREVIEW_COPY.alerts.warning),
      danger: copyAlert(alertsRoot.danger, DEFAULT_PREVIEW_COPY.alerts.danger),
    },
  };
}

const ROLE_DEFAULT_USAGE: Record<ColorRole, string> = {
  primary: 'Primary actions, links, active states and key brand moments',
  primaryForeground: 'Text and icons rendered on top of the primary color',
  secondary: 'Secondary surfaces, soft highlights and hover fills',
  accent: 'Accents, badges and emphasized interactive elements',
  background: 'Page and section backgrounds',
  foreground: 'Default body text and headings',
  muted: 'Muted surfaces, subtle fills and skeleton placeholders',
  mutedForeground: 'Secondary text, captions and placeholders',
  border: 'Borders, dividers and outlined control edges',
  success: 'Success states, confirmations and positive metrics',
  warning: 'Warning states and cautionary banners',
  danger: 'Destructive actions, errors and critical alerts',
};

function normalizeColorToken(raw: unknown, role: ColorRole, defaultHex: string): ColorToken {
  const r = isPlainObject(raw) ? raw : {};
  const hex = isHex(r.hex) ? r.hex : defaultHex;
  const name = str(r.name) ?? colorNameFromHex(hex);
  const usage = str(r.usage) ?? ROLE_DEFAULT_USAGE[role];
  return { hex, name, usage };
}

const PALETTE_STEP_NAMES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];

function normalizePaletteScale(raw: unknown, primaryHex: string): PaletteStep[] {
  const entries = (Array.isArray(raw) ? raw : []).filter(
    (s) => isPlainObject(s) && isHex((s as Record<string, unknown>).hex),
  );
  if (entries.length >= 5 && entries.length <= 12) {
    return entries.slice(0, 12).map((s, i) => {
      const e = s as Record<string, unknown>;
      const hex = e.hex as string;
      return {
        step: PALETTE_STEP_NAMES[i] ?? String(950 + (i - 10) * 50),
        hex,
        name: str(e.name) ?? colorNameFromHex(hex),
      };
    });
  }
  // Generate a deterministic 10-step scale from the primary color.
  const plan: Array<['#FFFFFF' | '#000000' | null, number]> = [
    ['#FFFFFF', 0.92],
    ['#FFFFFF', 0.84],
    ['#FFFFFF', 0.68],
    ['#FFFFFF', 0.5],
    ['#FFFFFF', 0.3],
    [null, 0], // primary itself
    ['#000000', 0.12],
    ['#000000', 0.24],
    ['#000000', 0.38],
    ['#000000', 0.52],
  ];
  return PALETTE_STEP_NAMES.map((step, i) => {
    const [target, t] = plan[i];
    const hex = target ? mixHex(primaryHex, target, t) : primaryHex;
    return { step, hex, name: colorNameFromHex(hex) };
  });
}

const FONT_LIST: readonly string[] = FONT_OPTIONS;

function fontFamily(v: unknown): string {
  return typeof v === 'string' && FONT_LIST.includes(v) ? v : 'Inter';
}

function fontWeights(v: unknown, fallback: number[]): number[] {
  if (!Array.isArray(v)) return fallback;
  const snapped = [
    ...new Set(
      v
        .map((w) => Math.round((Number(w) || 0) / 100) * 100)
        .filter((w) => Number.isFinite(w) && w >= 100 && w <= 900),
    ),
  ].sort((a, b) => a - b);
  return snapped.length ? snapped : fallback;
}

/**
 * Deep-merge a (possibly partial/garbage) tokens object over safe defaults.
 * Guarantees a complete, valid DesignTokens object - the frontend never
 * crashes on LLM output. Also enforces the WCAG AA primary/primaryForeground
 * contrast invariant (re-picks bestTextColor when contrast < 4.5).
 */
export const normalizeTokens = (raw: unknown, fallbackPrimary?: string, fallbackSecondary?: string): DesignTokens => {
  let rawObj: unknown = raw;
  if (typeof rawObj === 'string') {
    try {
      rawObj = JSON.parse(rawObj);
    } catch {
      rawObj = {};
    }
  }
  const root = isPlainObject(rawObj) ? rawObj : {};
  const rawColors = isPlainObject(root.colors) ? root.colors : {};

  // Resolve primary: raw → fallbackPrimary → default.
  const primaryHex = isHex(rawColors.primary?.['hex'])
    ? (rawColors.primary?.['hex'] as string)
    : isHex(fallbackPrimary)
      ? (fallbackPrimary as string)
      : '#0F766E';

  const colors = {
    primary: normalizeColorToken(rawColors.primary, 'primary', primaryHex),
    primaryForeground: normalizeColorToken(
      rawColors.primaryForeground,
      'primaryForeground',
      bestTextColor(primaryHex),
    ),
    secondary: normalizeColorToken(
      rawColors.secondary,
      'secondary',
      isHex(fallbackSecondary) ? (fallbackSecondary as string) : lightenHex(primaryHex, 0.82),
    ),
    accent: normalizeColorToken(rawColors.accent, 'accent', darkenHex(primaryHex, 0.18)),
    background: normalizeColorToken(rawColors.background, 'background', '#FFFFFF'),
    foreground: normalizeColorToken(rawColors.foreground, 'foreground', '#18181B'),
    muted: normalizeColorToken(rawColors.muted, 'muted', '#F4F4F5'),
    mutedForeground: normalizeColorToken(rawColors.mutedForeground, 'mutedForeground', '#71717A'),
    border: normalizeColorToken(rawColors.border, 'border', '#E4E4E7'),
    success: normalizeColorToken(rawColors.success, 'success', '#16A34A'),
    warning: normalizeColorToken(rawColors.warning, 'warning', '#D97706'),
    danger: normalizeColorToken(rawColors.danger, 'danger', '#DC2626'),
  } as DesignTokens['colors'];

  // WCAG AA invariant: primary text on primary must reach 4.5:1.
  if (contrastRatio(colors.primary.hex, colors.primaryForeground.hex) < 4.5) {
    const fg = bestTextColor(colors.primary.hex);
    colors.primaryForeground = {
      hex: fg,
      name: colorNameFromHex(fg),
      usage: ROLE_DEFAULT_USAGE.primaryForeground,
    };
  }

  const rawBrand = isPlainObject(root.brand) ? root.brand : {};
  const rawTypography = isPlainObject(root.typography) ? root.typography : {};
  const rawHeading = isPlainObject(rawTypography.heading) ? rawTypography.heading : {};
  const rawBody = isPlainObject(rawTypography.body) ? rawTypography.body : {};
  const rawScale = isPlainObject(rawTypography.scale) ? rawTypography.scale : {};
  const rawRadius = isPlainObject(root.radius) ? root.radius : {};
  const rawShadows = isPlainObject(root.shadows) ? root.shadows : {};
  const rawButtons = isPlainObject(root.buttons) ? root.buttons : {};
  const rawStyle = isPlainObject(root.style) ? root.style : {};

  const tokens: DesignTokens = {
    brand: {
      name: str(rawBrand.name) ?? '',
      personality: stringList(rawBrand.personality, 6),
      voice: str(rawBrand.voice) ?? '',
    },
    colors,
    paletteScale: normalizePaletteScale(root.paletteScale, colors.primary.hex),
    typography: {
      heading: {
        family: fontFamily(rawHeading.family),
        weights: fontWeights(rawHeading.weights, [700]),
        letterSpacing: cssLength(rawHeading.letterSpacing, '-0.01em'),
      },
      body: {
        family: fontFamily(rawBody.family),
        weights: fontWeights(rawBody.weights, [400, 500]),
        lineHeight: cssLength(rawBody.lineHeight, '1.6'),
      },
      scale: {
        h1: cssLength(rawScale.h1, '2.5rem'),
        h2: cssLength(rawScale.h2, '2rem'),
        h3: cssLength(rawScale.h3, '1.5rem'),
        h4: cssLength(rawScale.h4, '1.25rem'),
        body: cssLength(rawScale.body, '1rem'),
        small: cssLength(rawScale.small, '0.875rem'),
        caption: cssLength(rawScale.caption, '0.75rem'),
      },
    },
    radius: {
      sm: cssLength(rawRadius.sm, '0.375rem'),
      md: cssLength(rawRadius.md, '0.5rem'),
      lg: cssLength(rawRadius.lg, '1rem'),
      full: cssLength(rawRadius.full, '9999px'),
    },
    shadows: {
      sm: cssShadow(rawShadows.sm, '0 1px 2px 0 rgb(0 0 0 / 0.05)'),
      md: cssShadow(
        rawShadows.md,
        '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      ),
      lg: cssShadow(
        rawShadows.lg,
        '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
      ),
    },
    buttons: {
      primary: str(rawButtons.primary) ?? 'filled',
      secondary: str(rawButtons.secondary) ?? 'soft',
      shape: str(rawButtons.shape) ?? 'rounded',
    },
    trustPatterns: stringList(root.trustPatterns, 8),
    previewCopy: normalizePreviewCopy(root.previewCopy),
    style: {
      glass: rawStyle.glass === true,
      glow: rawStyle.glow === true,
      gradientHero: rawStyle.gradientHero === true,
      softAmbient: rawStyle.softAmbient === true,
      buttonPreset:
        rawStyle.buttonPreset === 'plastic' || rawStyle.buttonPreset === 'venom'
          ? rawStyle.buttonPreset
          : '',
      cursorPack:
        rawStyle.cursorPack === 'windows' ||
        rawStyle.cursorPack === 'macos' ||
        rawStyle.cursorPack === 'dot' ||
        rawStyle.cursorPack === 'crosshair'
          ? rawStyle.cursorPack
          : '',
    },
  };

  return tokens;
};
