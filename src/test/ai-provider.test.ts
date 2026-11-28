import { describe, expect, it } from "vitest";
import { AllProvidersFailedError, callWithFallback, callWithFallbackDetailed, callWithProviderChain, isRecoverableStatus, ProviderError, providerChainFrom, providerOrderFrom, redactSecrets } from "@/services/providerFallback";

const quiet = () => undefined;

describe("AI provider policy", () => {
  it("classifies rate limits and outages as recoverable, but not credentials or bad requests", () => {
    expect(isRecoverableStatus(429)).toBe(true);
    expect(isRecoverableStatus(503)).toBe(true);
    expect(isRecoverableStatus(401)).toBe(false);
    expect(isRecoverableStatus(400)).toBe(false);
  });

  it("uses Gemini then Groq for reports and Groq then Gemini for transcription by default", () => {
    expect(providerOrderFrom("report", undefined)).toEqual(["gemini", "groq"]);
    expect(providerOrderFrom("transcription", undefined)).toEqual(["groq", "gemini"]);
    expect(providerOrderFrom("report", "GEMINI")).toEqual(["gemini", "groq"]);
    expect(providerOrderFrom("transcription", "gemini")).toEqual(["gemini", "groq"]);
  });

  it("tries Gemini first and uses its result when it works (Groq is never called)", async () => {
    const calls: string[] = [];
    const outcome = await callWithFallbackDetailed("report", "gemini", "groq", async (provider) => { calls.push(provider); return "gemini draft"; }, quiet);
    expect(calls).toEqual(["gemini"]);
    expect(outcome).toMatchObject({ value: "gemini draft", provider: "gemini", fellBack: false });
  });

  it.each([
    ["rate limit", new ProviderError("rate limited", "gemini", 429, true)],
    ["quota exhausted", new ProviderError("quota", "gemini", 429, true)],
    ["unavailable model", new ProviderError("model not found", "gemini", 404, false)],
    ["bad credentials", new ProviderError("API key not valid", "gemini", 403, false)],
    ["timeout", new ProviderError("timed out", "gemini", 408, true)],
    ["invalid output", new ProviderError("gemini returned an invalid report draft.", "gemini")],
    ["unexpected exception", new Error("boom")],
  ])("falls back to Groq after a Gemini failure: %s", async (_label, failure) => {
    const calls: string[] = [];
    const outcome = await callWithFallbackDetailed("report", "gemini", "groq", async (provider) => {
      calls.push(provider);
      if (provider === "gemini") throw failure;
      return "groq draft";
    }, quiet);
    expect(calls).toEqual(["gemini", "groq"]);
    expect(outcome).toMatchObject({ value: "groq draft", provider: "groq", fellBack: true });
  });

  it("keeps the simple callWithFallback contract", async () => {
    const calls: string[] = [];
    const result = await callWithFallback("transcription", "groq", "gemini", async (provider) => {
      calls.push(provider);
      if (provider === "groq") throw new ProviderError("down", "groq", 503, true);
      return "text";
    });
    expect(result).toBe("text");
    expect(calls).toEqual(["groq", "gemini"]);
  });

  it("reports both failures (so the app can use the offline parser) without leaking keys", async () => {
    let error: unknown;
    try {
      await callWithFallbackDetailed("report", "gemini", "groq", async (provider) => {
        throw new ProviderError(`${provider} failed: invalid key AIzaSyA1234567890abcdefghijklmnopqrstu and Bearer gsk_abcdefghijklmnopqrstuvwxyz123456`, provider, 401, false);
      }, quiet);
    } catch (caught) { error = caught; }
    expect(error instanceof AllProvidersFailedError).toBe(true);
    const failed = error as AllProvidersFailedError;
    expect(failed.attempts.map((a) => a.provider)).toEqual(["gemini", "groq"]);
    expect(JSON.stringify(failed.attempts)).not.toMatch(/AIza|gsk_/);
    expect(failed.message).not.toMatch(/AIza|gsk_/);
  });

  it("redacts API keys and bearer tokens", () => {
    expect(redactSecrets("url?key=SECRETVALUE123&x=1")).toBe("url?key=[redacted]&x=1");
    expect(redactSecrets("token super-secret-value-123 leaked", ["super-secret-value-123"])).toBe("token [redacted] leaked");
  });
});

describe("Provider chain (Gemini, Groq, DeepSeek)", () => {
  it("lists configured providers first, then the rest in the default order", () => {
    expect(providerChainFrom("report", undefined)).toEqual(["gemini", "groq", "deepseek"]);
    expect(providerChainFrom("report", "deepseek")).toEqual(["deepseek", "gemini", "groq"]);
    expect(providerChainFrom("report", "groq, deepseek ,GEMINI")).toEqual(["groq", "deepseek", "gemini"]);
    expect(providerChainFrom("report", "nonsense,gemini,gemini")).toEqual(["gemini", "groq", "deepseek"]);
  });

  it("never offers DeepSeek for transcription (it has no speech API)", () => {
    expect(providerChainFrom("transcription", undefined)).toEqual(["groq", "gemini"]);
    expect(providerChainFrom("transcription", "deepseek,gemini")).toEqual(["gemini", "groq"]);
  });

  it("falls through Gemini and Groq to DeepSeek and says it fell back", async () => {
    const calls: string[] = [];
    const outcome = await callWithProviderChain("report", ["gemini", "groq", "deepseek"], async (provider) => {
      calls.push(provider);
      if (provider === "gemini") throw new ProviderError("gemini report structuring failed: Your prepayment credits are depleted.", "gemini", 402, false);
      if (provider === "groq") throw new ProviderError("The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.", "groq", 404, false);
      return "deepseek draft";
    }, quiet);
    expect(calls).toEqual(["gemini", "groq", "deepseek"]);
    expect(outcome).toMatchObject({ value: "deepseek draft", provider: "deepseek", fellBack: true });
    expect(outcome.primaryFailure).toMatch(/prepayment credits/);
  });

  it("stops at the first provider that works", async () => {
    const calls: string[] = [];
    const outcome = await callWithProviderChain("report", ["gemini", "groq", "deepseek"], async (provider) => {
      calls.push(provider);
      if (provider === "gemini") throw new Error("down");
      return "groq draft";
    }, quiet);
    expect(calls).toEqual(["gemini", "groq"]);
    expect(outcome.provider).toBe("groq");
  });

  it("reports every attempt when all providers fail, and an empty chain explains what to configure", async () => {
    const failing = await callWithProviderChain("report", ["gemini", "groq", "deepseek"], async (provider) => { throw new ProviderError(`${provider} down`, provider, 503, true); }, quiet).catch((e: unknown) => e);
    expect(failing instanceof AllProvidersFailedError).toBe(true);
    expect((failing as AllProvidersFailedError).attempts.map((a) => a.provider)).toEqual(["gemini", "groq", "deepseek"]);
    const empty = await callWithProviderChain("report", [], async () => "never", quiet).catch((e: unknown) => e);
    expect(empty instanceof AllProvidersFailedError).toBe(true);
    expect((empty as AllProvidersFailedError).message).toMatch(/GEMINI_API_KEY/);
  });

  it("redacts the newer Gemini (AQ.) and DeepSeek (sk-) key shapes", () => {
    const text = redactSecrets("bad key AQ.Ab8RN6KX2kOpB3ZmfPWB4Km6Ub0QoB1BIa9uFo and sk-0123456789abcdef0123456789abcdef");
    expect(text).not.toMatch(/AQ\.Ab8|sk-0123/);
  });
});
