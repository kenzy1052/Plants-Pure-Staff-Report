// Autosave helpers: keep unsent form progress on the device so nothing is lost
// when data drops, the phone switches off or the browser is closed.
export function readLocalDraft<T>(key: string): (T & { savedAt: string }) | null {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T & { savedAt: string }) : null; } catch { return null; }
}
export function writeLocalDraft(key: string, value: Record<string, unknown>): boolean {
  const body = { ...value, savedAt: new Date().toISOString() };
  try { localStorage.setItem(key, JSON.stringify(body)); return true; } catch {
    // storage full (large photos): keep the text, drop the attachments
    try { const { attachments: _a, ...rest } = body as Record<string, unknown>; localStorage.setItem(key, JSON.stringify(rest)); return true; } catch { return false; }
  }
}
export function clearLocalDraft(key: string) { try { localStorage.removeItem(key); } catch { /* ignore */ } }
