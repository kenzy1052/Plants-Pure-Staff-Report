import { InstallAppButton } from '@/components/common/InstallAppButton';
import { useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, Info, Mail, Check, X, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase, setRememberMe } from '@/integrations/supabase/client';
import { AuthService } from '@/services/storageService';
import { cn } from '@/lib/utils';
import heroImage from '@/assets/signup.png';
import logo from '@/assets/logo.png';
import type { User } from '@/types';

type SignupOptions = { departments: string[]; designations: { title: string; department: string }[]; supervisors: { id: string; name: string; title: string }[] };
type Mode = 'login' | 'signup' | 'reset' | 'password';
type Feedback = { tone: 'error' | 'success' | 'info'; title: string; text?: string } | null;

function friendly(message: string): Feedback {
  const m = message.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) return { tone: 'error', title: 'Incorrect email or password', text: 'Check your details and try again, or reset your password.' };
  if (m.includes('email not confirmed')) return { tone: 'info', title: 'Verify your email first', text: 'Open the confirmation link we emailed you, then sign in.' };
  if (m.includes('fetch') || m.includes('network')) return { tone: 'error', title: 'Connection problem', text: 'We couldn’t reach the server. Check your connection and try again.' };
  if (m.includes('inactive') || m.includes('deactivated')) return { tone: 'error', title: 'Account unavailable', text: 'Your staff account is inactive. Contact your administrator.' };
  if (m.includes('already registered')) return { tone: 'info', title: 'Account already exists', text: 'Sign in instead, or reset your password.' };
  return { tone: 'error', title: 'Something went wrong', text: message };
}

const rules = [
  { label: '8+ characters', test: (p: string) => p.length >= 8 },
  { label: 'One number', test: (p: string) => /\d/.test(p) },
  { label: 'One letter', test: (p: string) => /[a-z]/i.test(p) },
];

export function LoginPage({ onLoginSuccess }: { onLoginSuccess: (user: User) => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const [mode, setMode] = useState<Mode>('signup'); const [show, setShow] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null); const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false); const [remember, setRemember] = useState(true);
  const [sentTo, setSentTo] = useState<string | null>(null); const [cooldown, setCooldown] = useState(0);
  const [fullName, setFullName] = useState(''); const [phone, setPhone] = useState(''); const [department, setDepartment] = useState(''); const [designation, setDesignation] = useState('');
  const [options, setOptions] = useState<SignupOptions | null>(null);

  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown(c => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);
  useEffect(() => { if (mode !== 'signup' || options) return; void (async () => { const { data } = await supabase.rpc('signup_options'); if (data) setOptions(data as unknown as SignupOptions); })(); }, [mode, options]);
  useEffect(() => { if (new URLSearchParams(window.location.search).has('recovery')) setMode('password'); }, []);

  const switchMode = (m: Mode) => { setMode(m); setFeedback(null); setTouched(false); setConfirm(''); setSentTo(null); };
  const needsStrong = mode === 'signup' || mode === 'password';
  const ruleCount = rules.filter(r => r.test(password)).length;
  const strongOk = ruleCount === rules.length;
  const confirmOk = !needsStrong || password === confirm;
  const emailInvalid = touched && mode !== 'password' && !/^\S+@\S+\.\S+$/.test(email);
  const strengthLabel = ruleCount === 0 ? 'Start with a secure password' : ruleCount < 3 ? 'Keep going — almost there' : 'Strong password';

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setTouched(true); setFeedback(null);
    if (emailInvalid) return setFeedback({ tone: 'error', title: 'Enter a valid email' });
    if (mode === 'signup') {
      if (!fullName.trim()) return setFeedback({ tone: 'error', title: 'Enter your full name' });
      if (phone.replace(/\D/g, '').length < 9) return setFeedback({ tone: 'error', title: 'Enter a valid phone number' });
      if (!department) return setFeedback({ tone: 'error', title: 'Choose your department' });
      if (!designation) return setFeedback({ tone: 'error', title: 'Choose your designation' });
    }
    if (needsStrong && !strongOk) return setFeedback({ tone: 'error', title: 'Complete the password checklist' });
    if (!confirmOk) return setFeedback({ tone: 'error', title: 'Passwords don’t match' });
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + '/auth', data: { name: fullName.trim(), phone: phone.trim(), department, role_title: designation } } });
        if (error) throw error;
        if (data.user && data.user.identities?.length === 0) setFeedback({ tone: 'info', title: 'Account already exists', text: 'Sign in instead, or reset your password.' });
        else if (data.session) { setRememberMe(remember); const r = await AuthService.login(email, password); if (!r.success || !r.user) throw new Error(r.error); onLoginSuccess(r.user); }
        else { setPassword(''); setConfirm(''); setCooldown(60); setSentTo(email); }
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/auth?recovery=1' }); if (error) throw error;
        setFeedback({ tone: 'success', title: 'Check your inbox', text: 'We sent a secure link to set a new password.' });
      } else if (mode === 'password') {
        const { error } = await supabase.auth.updateUser({ password }); if (error) throw error;
        switchMode('login'); setFeedback({ tone: 'success', title: 'Password saved', text: 'You can now sign in with your new password.' });
      } else {
        setRememberMe(remember); const r = await AuthService.login(email, password); if (!r.success || !r.user) throw new Error(r.error); onLoginSuccess(r.user);
      }
    } catch (err) { setFeedback(friendly(err instanceof Error ? err.message : 'Sign-in failed.')); } finally { setBusy(false); }
  }

  const goToSignIn = () => { setSentTo(null); setPassword(''); switchMode('login'); };
  const resend = async () => { if (!sentTo || cooldown > 0) return; const { error } = await supabase.auth.resend({ type: 'signup', email: sentTo, options: { emailRedirectTo: window.location.origin + '/auth' } }); if (error) setFeedback(friendly(error.message)); else setFeedback({ tone: 'success', title: 'Email sent again' }); setCooldown(60); };
  const heading = { login: ['Welcome back', 'Sign in to continue to your reporting workspace.'], signup: ['Create your staff account', 'Set up your profile once, then make every report count.'], reset: ['Reset your password', 'We’ll email you a secure link.'], password: ['Choose a new password', 'Set a strong password for your account.'] }[mode];
  const FIcon = feedback?.tone === 'success' ? CheckCircle2 : feedback?.tone === 'info' ? Info : AlertCircle;

  return (
    <div className="auth-shell min-h-screen overflow-hidden bg-background lg:grid lg:h-screen lg:grid-cols-[minmax(420px,.92fr)_minmax(520px,1.08fr)]">
      <aside className="auth-art-panel relative hidden min-h-screen overflow-hidden lg:sticky lg:top-0 lg:block lg:h-screen" aria-hidden="true">
        <div className="auth-art-glow auth-art-glow-one" /><div className="auth-art-glow auth-art-glow-two" />
        <img src={heroImage} alt="" className="auth-art-image" />
      </aside>

      <main className="auth-form-pane flex min-h-screen flex-col justify-center overflow-y-auto px-5 py-10 sm:px-10 lg:h-screen lg:justify-start lg:px-16 lg:py-12">
        <div className="mx-auto w-full max-w-[520px] fade-up">
          <div className="mb-9 flex items-center gap-3 lg:hidden"><img src={logo} alt="Plants & Pure" className="size-10 object-contain" /><div><p className="font-semibold">Plants & Pure</p><p className="text-xs text-muted-foreground">Staff reporting & performance</p></div></div>
          {sentTo ? (
            <div className="text-center"><div className="mx-auto mb-6 grid size-16 place-items-center rounded-full bg-primary/10 text-primary"><Mail className="size-8" /></div><h2 className="text-[1.75rem] font-semibold tracking-tight">Confirm your email</h2><p className="mt-2 text-sm text-muted-foreground">We sent a confirmation link to</p><p className="mt-1 break-all font-semibold">{sentTo}</p><p className="mt-4 text-sm leading-relaxed text-muted-foreground">Open the email and tap the link to activate your account. Then come back here and sign in.</p><Button type="button" className="mt-8 h-11 w-full text-[14px]" onClick={goToSignIn}>Sign in<ArrowRight className="size-4" /></Button>{feedback && <p role="status" className="mt-5 text-[13px] font-medium text-success">{feedback.title}</p>}<p className="mt-6 text-[13px] text-muted-foreground">Didn’t get it? Check your spam folder, or <button type="button" disabled={cooldown > 0} onClick={() => void resend()} className="font-medium text-primary hover:underline disabled:opacity-50">{cooldown > 0 ? `resend in ${cooldown}s` : 'resend the email'}</button>.</p><button type="button" onClick={() => { setSentTo(null); switchMode('signup'); }} className="mt-3 text-[13px] text-muted-foreground hover:text-foreground hover:underline">Use a different email</button></div>
          ) : <>
            <div className="mb-8"><div className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-wash px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.13em] text-accent-foreground"><ShieldCheck className="size-3.5" /> Secure staff access</div><h2 className="text-[clamp(1.9rem,3vw,2.35rem)] font-semibold tracking-tight">{heading[0]}</h2><p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{heading[1]}</p></div>
            {feedback && <div role="status" className={cn('mb-6 flex gap-3 rounded-xl border p-3.5 text-sm', feedback.tone === 'error' ? 'border-destructive/30 bg-destructive-soft text-destructive' : feedback.tone === 'success' ? 'border-success/30 bg-success-soft text-success' : 'border-info/30 bg-info-soft text-info')}><FIcon className="mt-0.5 size-4 shrink-0" /><div><p className="font-semibold">{feedback.title}</p>{feedback.text && <p className="mt-0.5 text-[13px] opacity-90">{feedback.text}</p>}</div></div>}
            <form onSubmit={submit} noValidate className="space-y-5">
              {mode === 'signup' && <>
                <div className="auth-section"><div className="auth-section-heading"><span>01</span><div><p className="font-semibold">Your details</p><p>Tell us a little about you.</p></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><label htmlFor="fullname">Full name</label><input id="fullname" autoComplete="name" placeholder="e.g. Ama Mensah" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full" /></div><div><label htmlFor="phone">Phone number</label><input id="phone" type="tel" autoComplete="tel" placeholder="+233 …" value={phone} onChange={e => setPhone(e.target.value)} className="w-full" /></div><div><label htmlFor="email">Email</label><input id="email" aria-label="Email" type="email" autoComplete="email" placeholder="you@company.com" required value={email} aria-invalid={emailInvalid} onChange={e => setEmail(e.target.value)} className="w-full" /></div></div>{emailInvalid && <p className="mt-2 text-xs text-destructive">Enter a valid email address.</p>}</div>
                <div className="auth-section"><div className="auth-section-heading"><span>02</span><div><p className="font-semibold">Your role</p><p>Help route reports to the right team.</p></div></div><div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="designation">Designation</label><select id="designation" value={designation} onChange={e => { setDesignation(e.target.value); const d = options?.designations.find(x => x.title === e.target.value)?.department; if (d && options?.departments.includes(d)) setDepartment(d); }} className="w-full"><option value="">Select designation</option>{options?.designations.map(d => <option key={d.title} value={d.title}>{d.title}</option>)}</select></div><div><label htmlFor="department">Department</label><select id="department" value={department} onChange={e => setDepartment(e.target.value)} className="w-full"><option value="">Select department</option>{options?.departments.map(d => <option key={d} value={d}>{d}</option>)}</select></div></div></div>
              </>}
              {mode !== 'password' && mode !== 'signup' && <div><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" placeholder="you@company.com" required value={email} aria-invalid={emailInvalid} onChange={e => setEmail(e.target.value)} className="w-full" />{emailInvalid && <p className="mt-2 text-xs text-destructive">Enter a valid email address.</p>}</div>}
              {mode !== 'reset' && <div className={cn('auth-section', mode !== 'signup' && 'border-0 bg-transparent p-0')}><div className="mb-3 flex items-center justify-between"><div><label htmlFor="password">{mode === 'login' ? 'Enter Password' : mode === 'password' ? 'New password' : 'Create a password'}</label>{needsStrong && <p className="mt-1 text-xs text-muted-foreground">Use all three checks below to keep your account protected.</p>}</div>{mode === 'login' && <button type="button" onClick={() => switchMode('reset')} className="text-xs font-medium text-primary hover:underline">Forgot password?</button>}</div><div className="relative"><input id="password" aria-label="Password" placeholder={mode === 'login' ? 'Enter your password' : undefined} type={show ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={password} onChange={e => setPassword(e.target.value)} className="w-full !pr-12" /><button type="button" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:text-foreground" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>{mode === 'login' && <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="size-4 !w-4" />Keep me signed in on this device</label>}{needsStrong && <div className="mt-4 rounded-xl border border-border bg-background/60 p-3.5"><div className="mb-3 flex items-center justify-between text-xs"><span className="font-medium text-foreground">{strengthLabel}</span><span className="text-muted-foreground">{ruleCount}/3 complete</span></div><div className="mb-3 flex gap-1.5">{rules.map(r => <span key={r.label} className={cn('h-1.5 flex-1 rounded-full bg-muted transition-colors', r.test(password) && 'bg-success')} />)}</div><ul className="grid gap-2 sm:grid-cols-3">{rules.map(r => { const ok = r.test(password); return <li key={r.label} className={cn('flex items-center gap-1.5 text-xs', ok ? 'text-success' : 'text-muted-foreground')}>{ok ? <Check className="size-3.5" /> : <X className="size-3.5 opacity-50" />}{r.label}</li>; })}</ul></div>}</div>}
              {needsStrong && <div><label htmlFor="confirm">Confirm password</label><input id="confirm" type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="Re-enter your password" value={confirm} aria-invalid={!!confirm && !confirmOk} onChange={e => setConfirm(e.target.value)} className="w-full" />{!!confirm && !confirmOk && <p className="mt-2 text-xs text-destructive">Passwords don’t match.</p>}</div>}
              <Button disabled={busy} className="h-12 w-full text-[14px]" type="submit">{busy ? <><Loader2 className="size-4 animate-spin" />Please wait…</> : <>{{ login: 'Sign in', signup: 'Create account', reset: 'Send reset link', password: 'Save password' }[mode]}<ArrowRight className="size-4" /></>}</Button>
            </form>
            <p className="mt-7 text-center text-sm text-muted-foreground">{mode === 'login' ? <>New to Plants & Pure? <button onClick={() => switchMode('signup')} className="font-medium text-primary hover:underline">Create an account</button></> : <>Already have an account? <button onClick={() => switchMode('login')} className="font-medium text-primary hover:underline">Sign in</button></>}</p>
            <InstallAppButton />
          </>}
        </div>
      </main>
    </div>
  );
}
