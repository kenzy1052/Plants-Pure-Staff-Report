import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callDeepseekReport, callGeminiReport, callGroqReport, providerChain, shouldRejectEmptyDraft } from "@/services/cloud.functions";
import type { StructuredNarrationDraft } from "@/services/narrationAssistant";

const emptyDraftJson = JSON.stringify({ objectives: [], activities: [{ id: "", task: "Designed three flyers", outcome: "", placePersonPlatform: "", quantityFigures: "3 flyers", time: "", objectiveId: "" }], challenges: [], tomorrowPlans: [], pendingTasks: [], achievements: [], removeIds: [], clarification: "", cleanedNarration: "" });
const input = { narration: "I designed three flyers today.", department: "Marketing", knownActivities: [] };
const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));

describe("AI provider HTTP requests", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key-123456");
    vi.stubEnv("GROQ_API_KEY", "test-groq-key-123456");
    vi.stubEnv("DEEPSEEK_API_KEY", "test-deepseek-key-123456");
    for (const name of ["REPORT_AI_MODEL", "GROQ_REPORT_MODEL", "DEEPSEEK_REPORT_MODEL", "DEEPSEEK_API_URL", "REPORT_AI_PROVIDER"]) vi.stubEnv(name, "");
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("sends DeepSeek the OpenAI-style request with JSON mode, the current model id and no /v1", async () => {
    fetchMock.mockImplementation(() => ok({ choices: [{ message: { content: emptyDraftJson } }] }));
    const result = await callDeepseekReport(input);
    expect(result.activities?.[0]?.task).toBe("Designed three flyers");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-deepseek-key-123456");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("deepseek-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(JSON.stringify(body.messages)).toMatch(/json/i); // DeepSeek JSON mode requires the word "json" in the prompt
  });

  it("treats an empty DeepSeek body as a failed attempt so the chain can move on", async () => {
    fetchMock.mockImplementation(() => ok({ choices: [{ message: { content: "" } }] }));
    await expect(callDeepseekReport(input)).rejects.toThrow(/no report draft/);
  });

  it("surfaces DeepSeek billing errors with their status", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ error: { message: "Insufficient Balance" } }), { status: 402 })));
    await expect(callDeepseekReport(input)).rejects.toMatchObject({ provider: "deepseek", status: 402 });
  });

  it("uses the current Groq model (the old llama-3.3-70b-versatile is retired) and Gemini's free-tier model", async () => {
    fetchMock.mockImplementation((url: string) => url.includes("groq") ? ok({ choices: [{ message: { content: emptyDraftJson } }] }) : ok({ candidates: [{ content: { parts: [{ text: emptyDraftJson }] } }] }));
    await callGroqReport(input);
    await callGeminiReport(input);
    const groqBody = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(groqBody.model).toBe("openai/gpt-oss-120b");
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent");
  });

  it("lets environment variables override every model id", async () => {
    vi.stubEnv("DEEPSEEK_REPORT_MODEL", "deepseek-v4-pro");
    fetchMock.mockImplementation(() => ok({ choices: [{ message: { content: emptyDraftJson } }] }));
    await callDeepseekReport(input);
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).model).toBe("deepseek-v4-pro");
  });

  it("skips providers whose key is not set", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    expect(providerChain("report")).toEqual(["groq"]);
    vi.stubEnv("GROQ_API_KEY", "");
    expect(providerChain("report")).toEqual([]);
  });
});

describe("Empty AI answers", () => {
  const empty = { objectives: [], activities: [], challenges: [], tomorrowPlans: [], pendingTasks: [], achievements: [], removeIds: [], clarification: "", cleanedNarration: "x" } as unknown as StructuredNarrationDraft;
  const narration = "I designed three flyers today.";
  const row = { id: "a1", task: "Designed flyers" };

  it("rejects an empty answer for a real narration when the report is still blank", () => {
    expect(shouldRejectEmptyDraft(empty, { narration })).toBe(true);
    expect(shouldRejectEmptyDraft(empty, { narration, currentReport: { activities: [] } })).toBe(true);
  });

  it("accepts an empty answer when the report already has rows (nothing new to add is a valid answer)", () => {
    expect(shouldRejectEmptyDraft(empty, { narration, currentReport: { activities: [row] } as never })).toBe(false);
  });

  it("never rejects short messages or drafts that contain something", () => {
    expect(shouldRejectEmptyDraft(empty, { narration: "ok" })).toBe(false);
    expect(shouldRejectEmptyDraft({ ...empty, clarification: "Which one?" }, { narration })).toBe(false);
  });
});
