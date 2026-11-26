/**
 * Provider fallback policy for the report AI (structuring + transcription).
 * Framework-free so it can be unit tested. Server-only callers use it; nothing
 * here reads or returns API keys.
 */

export type ProviderName = 'gemini' | 'groq';

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

const SECRET_PATTERNS = [/AIza[0-9A-Za-z_-]{20,}/g, /gsk_[0-9A-Za-z]{20,}/g, /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, /([?&]key=)[^&\s]+/gi];

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
  /** True when the primary provider failed and the fallback produced the result. */
  fellBack: boolean;
  /** Redacted reason the primary provider failed, when it did. */
  primaryFailure?: string;
}

function defaultSecrets(): (string | undefined)[] {
  const env = typeof process !== 'undefined' ? process.env : undefined;
  return [env?.['GEMINI_API_KEY'], env?.['GROQ_API_KEY']];
}

/**
 * Tries `primary`; on ANY failure (rate limit, quota, outage, timeout, unavailable
 * model, bad or missing credentials, invalid/incomplete output) tries `fallback`
 * once. A failure of one provider never blocks the other.
 */
export async function callWithFallbackDetailed<T>(
  purpose: 'report' | 'transcription',
  primary: ProviderName,
  fallback: ProviderName,
  call: (provider: ProviderName) => Promise<T>,
  log: (entry: Record<string, unknown>) => void = (entry) => console.info('[report-ai]', entry),
): Promise<FallbackOutcome<T>> {
  const secrets = defaultSecrets();
  const startedAt = Date.now();
  try {
    const value = await call(primary);
    log({ provider: primary, purpose, outcome: 'success', latencyMs: Date.now() - startedAt });
    return { value, provider: primary, fellBack: false };
  } catch (primaryError) {
    const primaryReason = reasonOf(primaryError, secrets);
    log({ provider: primary, purpose, outcome: 'fallback', latencyMs: Date.now() - startedAt, status: primaryError instanceof ProviderError ? primaryError.status : undefined, reason: primaryReason });
    const fallbackStartedAt = Date.now();
    try {
      const value = await call(fallback);
      log({ provider: fallback, purpose, outcome: 'success', latencyMs: Date.now() - fallbackStartedAt });
      return { value, provider: fallback, fellBack: true, primaryFailure: primaryReason };
    } catch (fallbackError) {
      const fallbackReason = reasonOf(fallbackError, secrets);
      log({ provider: fallback, purpose, outcome: 'failure', latencyMs: Date.now() - fallbackStartedAt, reason: fallbackReason });
      throw new AllProvidersFailedError('Both AI providers were unavailable. Your text is preserved; continue manually or try again later.', [
        { provider: primary, reason: primaryReason },
        { provider: fallback, reason: fallbackReason },
      ]);
    }
  }
}

export async function callWithFallback<T>(purpose: 'report' | 'transcription', primary: ProviderName, fallback: ProviderName, call: (provider: ProviderName) => Promise<T>): Promise<T> {
  return (await callWithFallbackDetailed(purpose, primary, fallback, call)).value;
}

export function providerOrderFrom(purpose: 'report' | 'transcription', configured: string | undefined): [ProviderName, ProviderName] {
  const value = configured?.toLowerCase();
  if (value === 'gemini') return ['gemini', 'groq'];
  if (value === 'groq') return ['groq', 'gemini'];
  return purpose === 'transcription' ? ['groq', 'gemini'] : ['gemini', 'groq'];
}
