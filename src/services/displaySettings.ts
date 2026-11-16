export type ThemePreference = 'light' | 'dark' | 'system';
export interface DisplaySettings {
  theme: ThemePreference;
  fontSize: 'small' | 'normal' | 'large' | 'xlarge' | 'xxlarge' | 'huge';
  displayDensity: 'compact' | 'comfortable' | 'spacious';
  highContrast: boolean;
  reducedMotion: boolean;
}

const STORAGE_KEY = 'plants_pure_display_settings';

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  theme: 'system',
  fontSize: 'normal',
  displayDensity: 'comfortable',
  highContrast: false,
  reducedMotion: false
};

export const DisplaySettingsService = {
  getSettings(): DisplaySettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_DISPLAY_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {
      // fallback
    }
    return DEFAULT_DISPLAY_SETTINGS;
  },

  saveSettings(settings: DisplaySettings): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
    this.applySettings(settings);
  },

  applySettings(settings: DisplaySettings): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const dark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    root.classList.toggle('dark', !!dark);
    root.classList.toggle('light', !dark);
    root.setAttribute('data-theme', settings.theme);
    root.setAttribute('data-font-size', settings.fontSize);
    root.setAttribute('data-density', settings.displayDensity);
    root.setAttribute('data-high-contrast', settings.highContrast ? 'true' : 'false');
    if (settings.reducedMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }
  }
};

let systemWatcher = false;
/** Re-apply when the OS theme changes while "system" is selected. */
export function watchSystemTheme() {
  if (systemWatcher || typeof window === 'undefined' || !window.matchMedia) return;
  systemWatcher = true;
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const s = DisplaySettingsService.getSettings();
    if (s.theme === 'system') DisplaySettingsService.applySettings(s);
  });
}
