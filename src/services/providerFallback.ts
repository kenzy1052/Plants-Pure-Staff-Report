/**
 * Provider fallback policy for the report AI (structuring + transcription).
 * Framework-free so it can be unit tested. Server-only callers use it; nothing
 * here reads or returns API keys.
 */

export type ProviderName = 'gemini' | 'groq' | 'deepseek';
export type AiPurpose = 'report' | 'transcription';

/** Default order tried for each purpose (free providers first, DeepSeek as the paid-but-cheap safety net). */
const DEFAULT_ORDER: Record<AiPurpose, ProviderName[]> = {
  report: ['gemini', 'groq', 'deepseek'],
  // DeepSeek has no speech-to-text API, so it is never used for transcription.
  transcription: ['groq', 'gemini'],
};

export class ProviderError extends Error {
  constructor(message: string, readonly provider: ProviderName, readonly status?: number, readonly retryable = false) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class AllProvidersFailedError extends Error {
  constructor(message: string, readonly attempts: { provider: ProviderName; reason: string }[]) {
    super(message);
    this.name = 'AllProvidersFailedError';
  }
}

export function isRecoverableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z_-]{20,}/g, // classic Google API keys
  /\bAQ\.[0-9A-Za-z_-]{20,}/g, // newer Gemini API keys
  /gsk_[0-9A-Za-z]{20,}/g, // Groq
  /\bsk-[0-9A-Za-z]{20,}/g, // DeepSeek / OpenAI-style
  /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /([?&]key=)[^&\s]+/gi,
];

/** Removes anything that looks like an API key (and any explicitly supplied secret) from text. */
export function redactSecrets(text: string, extraSecrets: (string | undefined)[] = []): string {
  let out = text;
  for (const secret of extraSecrets) if (secret && secret.length >= 8) out = out.split(secret).join('[redacted]');
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, (_m, prefix) => (typeof prefix === 'string' ? `${prefix}[redacted]` : '[redacted]'));
  return out;
}

function reasonOf(error: unknown, secrets: (string | undefined)[]): string {
  const raw = error instanceof Error ? error.message : 'Unknown provider failure';
  return redactSecrets(raw, secrets).slice(0, 300);
}

export interface FallbackOutcome<T> {
  value: T;
  /** Provider that produced the result. */
  provider: ProviderName;
  /** True when the first provider in the chain failed and a later one produced the result. */
  fellBack: boolean;
  /** Redacted reason the first provider failed, when it did. */
  primaryFailure?: string;
}

function defaultSecrets(): (string | undefined)[] {
  const env = typeof process !== 'undefined' ? process.env : undefined;
  return [env?.['GEMINI_API_KEY'], env?.['GROQ_API_KEY'], env?.['DEEPSEEK_API_KEY']];
}

type LogFn = (entry: Record<string, unknown>) => void;
const defaultLog: LogFn = (entry) => console.info('[report-ai]', entry);

/**
 * Tries each provider in order and returns the first success. On ANY failure
 * (rate limit, quota, billing, outage, timeout, unavailable model, bad or missing
 * credentials, invalid/incomplete output) it moves on to the next provider. A
 * failure of one provider never blocks the others.
 */
export async function callWithProviderChain<T>(
  purpose: AiPurpose,
  providers: readonly ProviderName[],
  call: (provider: ProviderName) => Promise<T>,
  log: LogFn = defaultLog,
): Promise<FallbackOutcome<T>> {
  const chain = [...new Set(providers)];
  if (chain.length === 0) {
    throw new AllProvidersFailedError('No AI provider is configured. Add GEMINI_API_KEY, GROQ_API_KEY or DEEPSEEK_API_KEY on the server.', []);
  }
  const secrets = defaultSecrets();
  const attempts: { provider: ProviderName; reason: string }[] = [];
  for (const [index, provider] of chain.entries()) {
    const startedAt = Date.now();
    try {
      const value = await call(provider);
      log({ provider, purpose, outcome: 'success', latencyMs: Date.now() - startedAt });
      return { value, provider, fellBack: index > 0, ...(attempts[0] ? { primaryFailure: attempts[0].reason } : {}) };
    } catch (error) {
      const reason = reasonOf(error, secrets);
      attempts.push({ provider, reason });
      const isLast = index === chain.length - 1;
      log({ provider, purpose, outcome: isLast ? 'failure' : 'fallback', latencyMs: Date.now() - startedAt, status: error instanceof ProviderError ? error.status : undefined, reason });
    }
  }
  throw new AllProvidersFailedError('All AI providers were unavailable. Your text is preserved; continue manually or try again later.', attempts);
}

/** Two-provider form kept for existing callers and tests. */
export async function callWithFallbackDetailed<T>(
  purpose: AiPurpose,
  primary: ProviderName,
  fallback: ProviderName,
  call: (provider: ProviderName) => Promise<T>,
  log: LogFn = defaultLog,
): Promise<FallbackOutcome<T>> {
  return callWithProviderChain(purpose, [primary, fallback], call, log);
}

export async function callWithFallback<T>(purpose: AiPurpose, primary: ProviderName, fallback: ProviderName, call: (provider: ProviderName) => Promise<T>): Promise<T> {
  return (await callWithFallbackDetailed(purpose, primary, fallback, call)).value;
}

/**
 * Full provider order for a purpose. `configured` may be one name ("gemini") or a
 * comma-separated list ("gemini,deepseek,groq"). Listed providers come first, in the
 * order given; any remaining providers follow in the default order. Unknown names are
 * ignored, and DeepSeek is never listed for transcription.
 */
export function providerChainFrom(purpose: AiPurpose, configured: string | undefined): ProviderName[] {
  const allowed = DEFAULT_ORDER[purpose];
  const requested = (configured ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part): part is ProviderName => (allowed as string[]).includes(part));
  return [...new Set([...requested, ...allowed])];
}

/** First two providers of the chain (kept for existing callers and tests). */
export function providerOrderFrom(purpose: AiPurpose, configured: string | undefined): [ProviderName, ProviderName] {
  const [first, second] = providerChainFrom(purpose, configured);
  return [first!, second!];
}
