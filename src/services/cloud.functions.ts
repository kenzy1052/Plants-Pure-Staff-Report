import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import type { Json } from '@/integrations/supabase/types';

const storeSchema = z.enum(['daily_reports','weekly_reports','employees','roles','settings','notifications','audit_logs','evidence_attachments']);
export const getCloudUser = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const [{ data: profile, error }, { data: role }] = await Promise.all([
    context.supabase.from('profiles').select('*').eq('id', context.userId).single(),
    context.supabase.from('user_roles').select('role').eq('user_id', context.userId).single(),
  ]);
  if (error || !profile || !profile.active) throw new Error('Your staff account is not active.');
  let supervisorName: string | undefined;
  if (profile.supervisor_id) {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: sup } = await supabaseAdmin.from('profiles').select('name,email').eq('id', profile.supervisor_id).maybeSingle();
    supervisorName = sup ? (sup.name || sup.email) : undefined;
  }
  return { id: profile.id, name: profile.name || profile.email, email: profile.email, role: role?.role ?? 'employee', employeeId: profile.employee_code, department: profile.department, roleTitle: profile.role_title, supervisorId: profile.supervisor_id ?? undefined, supervisorName };
});
export const readCloudStore = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((input: unknown) => z.object({ store: storeSchema }).parse(input)).handler(async ({ data, context }) => {
  const rows: Json[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data: records, error } = await context.supabase.from('reporting_records').select('payload').eq('store', data.store).order('id').range(offset, offset+499);
    if (error) throw new Error(error.message);
    rows.push(...(records ?? []).map(row => row.payload));
    if (!records || records.length < 500) break;
  }
  if (data.store === 'employees') {
    const { data: profiles, error } = await context.supabase.from('profiles').select('*');
    if (error) throw new Error(error.message);
    for (const p of profiles ?? []) if (!rows.some(r => r && typeof r === 'object' && !Array.isArray(r) && r['id'] === p.id)) rows.push({ id:p.id, name:p.name, email:p.email, employeeId:p.employee_code, department:p.department, roleTitle:p.role_title, roleId:'', phone:p.phone, status:p.active?'active':'inactive', dateAdded:'', supervisorId:p.supervisor_id });
  }
  return rows;
});
const mutationSchema = z.object({ store:storeSchema, id:z.string().min(1), operation:z.enum(['put','delete']), payload:z.record(z.string(),z.unknown()).optional() });
export const writeCloudRecord = createServerFn({ method:'POST' }).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>mutationSchema.parse(input)).handler(async ({data,context})=> {
  const {data:roleRow,error:roleError}=await context.supabase.from('user_roles').select('role').eq('user_id',context.userId).single();
  const {data:profile}=await context.supabase.from('profiles').select('active,supervisor_id').eq('id',context.userId).single();
  if(roleError || !profile?.active) throw new Error('Staff access required.');
  const role=roleRow?.role ?? 'employee';
  const {data:old,error:readError}=await context.supabase.from('reporting_records').select('*').eq('store',data.store).eq('id',data.id).maybeSingle();
  if(readError) throw new Error(readError.message);
  const payload=data.payload ?? {};
  let ownerId=context.userId;
  let supervisorId: string | null=profile.supervisor_id;
  const reportStore=['daily_reports','weekly_reports'].includes(data.store);
  if(reportStore) {
    const prior=old?.payload as Record<string,unknown> | undefined;
    ownerId=old?.owner_id ?? String(payload['employeeId'] ?? context.userId);
    if(ownerId!==context.userId) {
      if(role!=='ceo' && !(role==='manager' && old?.supervisor_id===context.userId)) throw new Error('You cannot change this report.');
      if(!old || data.operation==='delete' || prior?.['status']!=='submitted') throw new Error('Only submitted reports can be reviewed.');
      if(!['approved','returned'].includes(String(payload['status']))) throw new Error('Invalid review decision.');
      const oldReviews=Array.isArray(prior['reviews'])?prior['reviews']:[];
      const newReviews=Array.isArray(payload['reviews'])?payload['reviews']:[];
      if(newReviews.length!==oldReviews.length+1) throw new Error('One review is required.');
      const review=newReviews.at(-1) as Record<string,unknown> | undefined;
      if(review?.['reviewerId']!==context.userId || review?.['decision']!==payload['status']) throw new Error('Invalid reviewer.');
      if(payload['status']==='returned' && !String(review?.['comments'] ?? '').trim()) throw new Error('Correction feedback is required.');
      for(const key of Object.keys(prior)) if(!['status','reviews','updatedAt'].includes(key) && JSON.stringify(prior[key])!==JSON.stringify(payload[key])) throw new Error('Reviews cannot alter report contents.');
    } else {
      if(old && !['draft','returned'].includes(String(prior?.['status']))) throw new Error('Submitted reports are locked.');
      if(data.operation==='put' && !['draft','submitted'].includes(String(payload['status']))) throw new Error('Only supervisors can approve reports.');
      if(JSON.stringify(payload['reviews'] ?? [])!==JSON.stringify(prior?.['reviews'] ?? [])) throw new Error('Only supervisors can add reviews.');
    }
    const {data:ownerProfile}=await context.supabase.from('profiles').select('supervisor_id').eq('id',ownerId).maybeSingle();
    supervisorId=old?.supervisor_id ?? ownerProfile?.supervisor_id ?? null;
  } else if(['employees','roles','settings'].includes(data.store)) {
    if(role!=='ceo') throw new Error('CEO access required.');
  } else if(data.store==='notifications') {
    if(old && old.owner_id!==context.userId) throw new Error('Only your notifications can be changed.');
    const recipient=String(payload['recipientId'] ?? context.userId);
    if(recipient!==context.userId) {
      const reportId=String(payload['linkReportId']??'');
      const {data:linked}=await context.supabase.from('reporting_records').select('owner_id,supervisor_id').eq('id',reportId).in('store',['daily_reports','weekly_reports']).maybeSingle();
      if(!linked || ![linked.owner_id,linked.supervisor_id].includes(context.userId) || ![linked.owner_id,linked.supervisor_id].includes(recipient)) throw new Error('Invalid notification recipient.');
    }
    ownerId=recipient;
  } else if(old && old.owner_id!==context.userId) throw new Error('Only your records can be changed.');
  if(data.store==='audit_logs' && (old || data.operation==='delete' || payload['userId']!==context.userId)) throw new Error('Audit entries are immutable.');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  if(data.operation==='delete') {
    const {error}=await supabaseAdmin.from('reporting_records').delete().eq('store',data.store).eq('id',data.id);
    if(error) throw new Error(error.message);
  } else {
    const {error}=await supabaseAdmin.from('reporting_records').upsert({store:data.store,id:data.id,owner_id:ownerId,supervisor_id:supervisorId,payload:payload as Json,updated_at:new Date().toISOString()});
    if(error) throw new Error(error.message);
  }
  if(data.store==='notifications' && data.operation==='put' && !old && ownerId!==context.userId && payload['read']!==true) {
    try { const {sendPushToUser}=await import('@/lib/push.server'); await sendPushToUser(ownerId,{title:String(payload['title']??'Plants & Pure'),body:String(payload['message']??''),url:'/',tag:data.id}); } catch { /* push is best-effort */ }
  }
  return {success:true};
});
const subscriptionSchema = z.object({ endpoint: z.string().url().startsWith('https://'), p256dh: z.string().min(10), auth: z.string().min(5) });
export const savePushSubscription = createServerFn({ method:'POST' }).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>subscriptionSchema.parse(input)).handler(async ({ data, context }) => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { error } = await (supabaseAdmin as any).from('push_subscriptions').upsert({ endpoint:data.endpoint, user_id:context.userId, p256dh:data.p256dh, auth:data.auth });
  if (error) throw new Error(error.message);
  return { success:true };
});
export const removePushSubscription = createServerFn({ method:'POST' }).middleware([requireSupabaseAuth]).inputValidator((input:unknown)=>z.object({ endpoint:z.string().min(10) }).parse(input)).handler(async ({ data, context }) => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  await (supabaseAdmin as any).from('push_subscriptions').delete().eq('endpoint', data.endpoint).eq('user_id', context.userId);
  return { success:true };
});