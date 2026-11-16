import { Button } from "@/components/ui/button";
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Sliders, X, Check, Type, Layout, Eye, Sparkles, Sun, Moon, Monitor } from 'lucide-react';
import { DisplaySettings, DisplaySettingsService } from '../../services/displaySettings';

interface DisplaySettingsModalProps {
  onClose: () => void;
  onUpdated?: () => void;
}

export const DisplaySettingsModal: React.FC<DisplaySettingsModalProps> = ({ onClose, onUpdated }) => {
  const [settings, setSettings] = useState<DisplaySettings>(() => DisplaySettingsService.getSettings());

  const handleUpdate = (updated: Partial<DisplaySettings>) => {
    const next = { ...settings, ...updated };
    setSettings(next);
    DisplaySettingsService.saveSettings(next);
    onUpdated?.();
  };

  const handleReset = () => {
    const defaults: DisplaySettings = {
      theme: 'system',
      fontSize: 'normal',
      displayDensity: 'comfortable',
      highContrast: false,
      reducedMotion: false
    };
    setSettings(defaults);
    DisplaySettingsService.saveSettings(defaults);
    onUpdated?.();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-overlay/60 backdrop-blur-xs flex items-center justify-center p-4 selection:bg-primary selection:text-primary-foreground">
      <div className="bg-card  rounded-lg shadow-2xl border border-border  max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-muted  border-b border-border  flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-xs">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground  leading-tight">
                Display & Accessibility Customization
              </h3>
              <p className="text-[11px] text-muted-foreground ">
                Personalize font sizing, layout density, and interface contrast.
              </p>
            </div>
          </div>
          <Button variant="legacy"
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-muted-foreground  rounded-lg hover:bg-muted/50  transition-colors"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {/* Theme */}
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-foreground mb-2"><Sun className="w-4 h-4 text-primary" /><span>Theme</span></div>
            <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              {([['light', 'Light', Sun], ['dark', 'Dark', Moon], ['system', 'System', Monitor]] as const).map(([id, label, Icon]) => (
                <button key={id} type="button" role="radio" aria-checked={settings.theme === id} onClick={() => handleUpdate({ theme: id })} className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium transition-colors ${settings.theme === id ? 'bg-card text-foreground shadow-[var(--shadow-soft)]' : 'text-muted-foreground hover:text-foreground'}`}><Icon className="size-3.5" />{label}</button>
              ))}
            </div>
          </div>

          {/* Section 1: Font Size */}
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-foreground  mb-2">
              <Type className="w-4 h-4 text-primary" />
              <span>Preferred Font Size</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { id: 'small', label: 'Small', desc: '13px · Compact' },
                { id: 'normal', label: 'Normal', desc: '14px · Standard' },
                { id: 'large', label: 'Large', desc: '16px · Readable' },
                { id: 'xlarge', label: 'Extra large', desc: '18px · Easier reading' },
                { id: 'xxlarge', label: 'Very large', desc: '20px · High comfort' },
                { id: 'huge', label: 'Maximum', desc: '24px · Maximum comfort' }
              ].map(f => (
                <Button variant="legacy"
                  key={f.id}
                  type="button"
                  onClick={() => handleUpdate({ fontSize: f.id as any })}
                  className={`h-auto min-h-24 p-3 rounded-lg border text-left flex-col items-start transition-all ${
                    settings.fontSize === f.id
                      ? 'border-primary bg-brand-wash  text-primary  font-bold shadow-xs'
                      : 'border-border  bg-card  text-foreground  hover:border-border'
                  }`}
                >
                  <div className="text-sm">{f.label}</div>
                  <div className="text-[10px] text-muted-foreground  mt-0.5">{f.desc}</div>
                </Button>
              ))}
            </div>
          </div>

          {/* Section 2: Layout Spacing & Density */}
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-foreground  mb-2">
              <Layout className="w-4 h-4 text-primary" />
              <span>Interface Spacing & Density</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { id: 'compact', label: 'Compact', desc: 'Maximum data density' },
                { id: 'comfortable', label: 'Comfortable', desc: 'Balanced padding' },
                { id: 'spacious', label: 'Spacious', desc: 'Extra breathing room' }
              ].map(d => (
                <Button variant="legacy"
                  key={d.id}
                  type="button"
                  onClick={() => handleUpdate({ displayDensity: d.id as any })}
                  className={`h-auto min-h-24 p-3 rounded-lg border text-left flex-col items-start transition-all ${
                    settings.displayDensity === d.id
                      ? 'border-primary bg-brand-wash  text-primary  font-bold shadow-xs'
                      : 'border-border  bg-card  text-foreground  hover:border-border'
                  }`}
                >
                  <div className="text-sm">{d.label}</div>
                  <div className="text-[10px] text-muted-foreground  mt-0.5">{d.desc}</div>
                </Button>
              ))}
            </div>
          </div>

          {/* Section 3: Visual Enhancements */}
          <div className="space-y-3 pt-2 border-t border-border ">
            <label className="flex items-center justify-between p-3 rounded-lg border border-border  bg-muted/50  cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-success-soft  text-primary  flex items-center justify-center">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground ">
                    High Contrast Mode
                  </div>
                  <div className="text-[11px] text-muted-foreground ">
                    Sharpens borders, cards, and text contrast
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.highContrast}
                onChange={(e) => handleUpdate({ highContrast: e.target.checked })}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg border border-border  bg-muted/50  cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-success-soft  text-primary  flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground ">
                    Reduced Animation
                  </div>
                  <div className="text-[11px] text-muted-foreground ">
                    Minimizes transitions for smoother lower-spec device experience
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.reducedMotion}
                onChange={(e) => handleUpdate({ reducedMotion: e.target.checked })}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-muted  border-t border-border  flex items-center justify-between">
          <Button variant="legacy"
            type="button"
            onClick={handleReset}
            className="text-xs text-muted-foreground hover:text-foreground  underline font-medium"
          >
            Reset to Default
          </Button>
          <Button variant="legacy"
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Apply Settings</span>
          </Button>
        </div>
      </div>
    </div>, document.body
  );
};
