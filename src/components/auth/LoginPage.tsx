import { InstallAppButton } from '@/components/common/InstallAppButton';
import { useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, Info, Mail, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase, setRememberMe } from '@/integrations/supabase/client';
import { AuthService } from '@/services/storageService';
import { cn } from '@/lib/utils';
import heroImage from '@/assets/login-hero.jpg';
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
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One number', test: (p: string) => /\d/.test(p) },
  { label: 'One letter', test: (p: string) => /[a-z]/i.test(p) },
];

export function LoginPage({ onLoginSuccess }: { onLoginSuccess: (user: User) => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const [mode, setMode] = useState<Mode>('login'); const [show, setShow] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null); const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [remember, setRemember] = useState(true);
  const [sentTo, setSentTo] = useState<string | null>(null); // set after sign-up: shows the "Confirm your email" screen
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (cooldown <= 0) return; const t = setTimeout(() => setCooldown(c => c - 1), 1000); return () => clearTimeout(t); }, [cooldown]);
  const [fullName, setFullName] = useState(''); const [phone, setPhone] = useState(''); const [department, setDepartment] = useState(''); const [designation, setDesignation] = useState(''); const [supervisorId, setSupervisorId] = useState('');
  const [options, setOptions] = useState<SignupOptions | null>(null);
  useEffect(() => {
    if (mode !== 'signup' || options) return;
    void (async () => { const { data } = await supabase.rpc('signup_options'); if (data) setOptions(data as unknown as SignupOptions); })();
  }, [mode, options]);

  useEffect(() => { if (new URLSearchParams(window.location.search).has('recovery')) setMode('password'); }, []);
  const switchMode = (m: Mode) => { setMode(m); setFeedback(null); setTouched(false); setConfirm(''); };
  const needsStrong = mode === 'signup' || mode === 'password';
  const strongOk = rules.every(r => r.test(password));
  const confirmOk = !needsStrong || password === confirm;
  const emailInvalid = touched && mode !== 'password' && !/^\S+@\S+\.\S+$/.test(email);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setTouched(true); setFeedback(null);
    if (emailInvalid) return setFeedback({ tone: 'error', title: 'Enter a valid email' });
    if (mode === 'signup') {
      if (!fullName.trim()) return setFeedback({ tone: 'error', title: 'Enter your full name' });
      if (phone.replace(/\D/g, '').length < 9) return setFeedback({ tone: 'error', title: 'Enter a valid phone number' });
      if (!department) return setFeedback({ tone: 'error', title: 'Choose your department' });
      if (!designation) return setFeedback({ tone: 'error', title: 'Choose your designation' });
      if (options?.supervisors.length && !supervisorId) return setFeedback({ tone: 'error', title: 'Choose who you report to' });
    }
    if (needsStrong && !strongOk) return setFeedback({ tone: 'error', title: 'Password doesn’t meet the requirements' });
    if (!confirmOk) return setFeedback({ tone: 'error', title: 'Passwords don’t match' });
    setBusy(true);
    try {
      if (mode === 'signup') { const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + '/auth', data: { name: fullName.trim(), phone: phone.trim(), department, role_title: designation, supervisor_id: supervisorId || null } } }); if (error) throw error;
        if (data.user && data.user.identities?.length === 0) { setFeedback({ tone: 'info', title: 'Account already exists', text: 'Sign in instead, or reset your password.' }); }
        else if (data.session) { setRememberMe(remember); const r = await AuthService.login(email, password); if (!r.success || !r.user) throw new Error(r.error); onLoginSuccess(r.user); } // email confirmation switched off
        else { setPassword(''); setConfirm(''); setCooldown(60); setSentTo(email); } }
      else if (mode === 'reset') { const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/auth?recovery=1' }); if (error) throw error; setFeedback({ tone: 'success', title: 'Check your inbox', text: 'We sent a secure link to set a new password.' }); }
      else if (mode === 'password') { const { error } = await supabase.auth.updateUser({ password }); if (error) throw error; switchMode('login'); setFeedback({ tone: 'success', title: 'Password saved', text: 'You can now sign in with your new password.' }); }
      else { setRememberMe(remember); const r = await AuthService.login(email, password); if (!r.success || !r.user) throw new Error(r.error); onLoginSuccess(r.user); }
    } catch (err) { setFeedback(friendly(err instanceof Error ? err.message : 'Sign-in failed.')); }
    finally { setBusy(false); }
  }

  const goToSignIn = () => { setSentTo(null); setPassword(''); switchMode('login'); };
  const resend = async () => {
    if (!sentTo || cooldown > 0) return;
    const { error } = await supabase.auth.resend({ type: 'signup', email: sentTo, options: { emailRedirectTo: window.location.origin + '/auth' } });
    if (error) setFeedback(friendly(error.message)); else setFeedback({ tone: 'success', title: 'Email sent again' });
    setCooldown(60);
  };
  const heading = { login: ['Welcome back', 'Sign in to continue to your reporting workspace.'], signup: ['Create your staff account', 'Fill in your details to start submitting your reports.'], reset: ['Reset your password', 'We’ll email you a secure link.'], password: ['Choose a new password', 'Set a strong password for your account.'] }[mode];
  const FIcon = feedback?.tone === 'success' ? CheckCircle2 : feedback?.tone === 'info' ? Info : AlertCircle;

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="grain-photo relative hidden lg:flex flex-col justify-between p-12 text-primary-foreground">
        <img src={heroImage} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="relative z-10 flex items-center gap-3"><img src={logo} alt="Plants & Pure" className="size-10 object-contain" /><span className="text-lg font-semibold">Plants & Pure</span></div>
        <div className="relative z-10 max-w-md">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] opacity-80">Staff reporting & performance</p>
          <h1 className="text-[2.6rem] font-semibold leading-[1.08] tracking-tight">Every day’s work, clearly recorded.</h1>
          <p className="mt-5 text-[15px] leading-relaxed opacity-85">Submit daily reports, generate weekly summaries and keep reviews moving — all in one place.</p>
          <div className="mt-10 flex gap-8 border-t border-primary-foreground/25 pt-6 text-sm"><div><p className="font-semibold">Daily</p><p className="opacity-75">Activity reports</p></div><div><p className="font-semibold">Weekly</p><p className="opacity-75">Smart summaries</p></div><div><p className="font-semibold">Reviews</p><p className="opacity-75">Manager approvals</p></div></div>
        </div>
      </aside>

      <main className="flex min-h-screen flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[400px] fade-up">
          <div className="mb-10 flex items-center gap-3 lg:hidden"><img src={logo} alt="Plants & Pure" className="size-10 object-contain" /><div><p className="font-semibold">Plants & Pure</p><p className="text-xs text-muted-foreground">Staff reporting & performance</p></div></div>
          {sentTo ? (
            <div className="text-center">
              <div className="mx-auto mb-6 grid size-16 place-items-center rounded-full bg-primary/10 text-primary"><Mail className="size-8" /></div>
              <h2 className="text-[1.75rem] font-semibold tracking-tight">Confirm your email</h2>
              <p className="mt-2 text-sm text-muted-foreground">We sent a confirmation link to</p>
              <p className="mt-1 break-all font-semibold">{sentTo}</p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">Open the email and tap the link to activate your account. Then come back here and sign in.</p>
              <Button type="button" className="mt-8 h-11 w-full text-[14px]" onClick={goToSignIn}>Sign in<ArrowRight className="size-4" /></Button>
              {feedback && <p role="status" className={cn('mt-5 text-[13px] font-medium', feedback.tone === 'error' ? 'text-destructive' : 'text-success')}>{feedback.title}{feedback.tone === 'error' && feedback.text ? ` — ${feedback.text}` : ''}</p>}
              <p className="mt-6 text-[13px] text-muted-foreground">Didn’t get it? Check your spam folder, or <button type="button" disabled={cooldown > 0} onClick={() => void resend()} className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50">{cooldown > 0 ? `resend in ${cooldown}s` : 'resend the email'}</button>.</p>
              <button type="button" onClick={() => { setSentTo(null); switchMode('signup'); }} className="mt-3 text-[13px] text-muted-foreground hover:text-foreground hover:underline">Use a different email</button>
            </div>
          ) : (<>
          <h2 className="text-[1.75rem] font-semibold tracking-tight">{heading[0]}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{heading[1]}</p>

          {feedback && (
            <div role="status" className={cn('mt-6 flex gap-3 rounded-lg border p-3.5 text-sm', feedback.tone === 'error' ? 'border-destructive/30 bg-destructive-soft text-destructive' : feedback.tone === 'success' ? 'border-success/30 bg-success-soft text-success' : 'border-info/30 bg-info-soft text-info')}>
              <FIcon className="mt-0.5 size-4 shrink-0" /><div><p className="font-semibold">{feedback.title}</p>{feedback.text && <p className="mt-0.5 text-[13px] opacity-90">{feedback.text}</p>}</div>
            </div>
          )}

          <form onSubmit={submit} noValidate className="mt-7 space-y-5">
            {mode === 'signup' && (
              <>
                <div><label htmlFor="fullname" className="mb-1.5 block text-[13px] font-medium">Full name</label>
                  <input id="fullname" autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full" /></div>
                <div><label htmlFor="phone" className="mb-1.5 block text-[13px] font-medium">Phone number</label>
                  <input id="phone" type="tel" autoComplete="tel" placeholder="+233 …" value={phone} onChange={e => setPhone(e.target.value)} className="w-full" /></div>
                <div><label htmlFor="designation" className="mb-1.5 block text-[13px] font-medium">Designation</label>
                  <select id="designation" value={designation} onChange={e => { setDesignation(e.target.value); const d = options?.designations.find(x => x.title === e.target.value)?.department; if (d && options?.departments.includes(d)) setDepartment(d); }} className="w-full">
                    <option value="">Select your designation</option>
                    {options?.designations.map(d => <option key={d.title} value={d.title}>{d.title}</option>)}
                  </select></div>
                <div><label htmlFor="department" className="mb-1.5 block text-[13px] font-medium">Department</label>
                  <select id="department" value={department} onChange={e => setDepartment(e.target.value)} className="w-full">
                    <option value="">Select your department</option>
                    {options?.departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select></div>
                {!!options?.supervisors.length && (
                  <div><label htmlFor="supervisor" className="mb-1.5 block text-[13px] font-medium">Who do you report to?</label>
                    <select id="supervisor" value={supervisorId} onChange={e => setSupervisorId(e.target.value)} className="w-full">
                      <option value="">Select your supervisor</option>
                      {options.supervisors.map(s => <option key={s.id} value={s.id}>{s.name}{s.title ? ` — ${s.title}` : ''}</option>)}
                    </select></div>
                )}
              </>
            )}
            {mode !== 'password' && (
              <div><label htmlFor="email" className="mb-1.5 block text-[13px] font-medium">Email</label>
                <div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input id="email" aria-label="Email" type="email" autoComplete="email" placeholder="example@gmail.com" required value={email} aria-invalid={emailInvalid} onChange={e => setEmail(e.target.value)} className="w-full !pl-10" /></div>
                {emailInvalid && <p className="mt-1.5 text-xs text-destructive">Enter a valid email address.</p>}
              </div>
            )}
            {mode !== 'reset' && (
              <div>
                <div className="mb-1.5 flex items-center justify-between"><label htmlFor="password" className="text-[13px] font-medium">{mode === 'password' ? 'New password' : 'Password'}</label>{mode === 'login' && <button type="button" onClick={() => switchMode('reset')} className="text-xs font-medium text-primary hover:underline">Forgot password?</button>}</div>
                <div className="relative"><input id="password" aria-label="Password" type={show ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={password} onChange={e => setPassword(e.target.value)} className="w-full !pr-12" />
                  <button type="button" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:text-foreground" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>
                {mode === 'login' && <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="size-4 !w-4" />Keep me signed in on this device</label>}
                {needsStrong && <ul className="mt-2.5 grid grid-cols-3 gap-2">{rules.map(r => { const ok = r.test(password); return <li key={r.label} className={cn('flex items-center gap-1 text-[11.5px]', ok ? 'text-success' : 'text-muted-foreground')}>{ok ? <Check className="size-3" /> : <X className="size-3 opacity-50" />}{r.label}</li>; })}</ul>}
              </div>
            )}
            {needsStrong && (
              <div><label htmlFor="confirm" className="mb-1.5 block text-[13px] font-medium">Confirm password</label>
                <input id="confirm" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} aria-invalid={!!confirm && !confirmOk} onChange={e => setConfirm(e.target.value)} className="w-full" />
                {!!confirm && !confirmOk && <p className="mt-1.5 text-xs text-destructive">Passwords don’t match.</p>}
              </div>
            )}
            <Button disabled={busy} className="h-11 w-full text-[14px]" type="submit">
              {busy ? <><Loader2 className="size-4 animate-spin" />Please wait…</> : <>{{ login: 'Sign in', signup: 'Create account', reset: 'Send reset link', password: 'Save password' }[mode]}<ArrowRight className="size-4" /></>}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === 'login' ? <>New to Plants & Pure? <button onClick={() => switchMode('signup')} className="font-medium text-primary hover:underline">Create an account</button></> : <>Already have an account? <button onClick={() => switchMode('login')} className="font-medium text-primary hover:underline">Sign in</button></>}
          </p>

          <InstallAppButton />
          </>)}
        </div>
      </main>
    </div>
  );
}
