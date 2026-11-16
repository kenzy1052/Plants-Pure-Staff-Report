import { readCloudStore, writeCloudRecord } from './cloud.functions';
import { isDemoSession } from './session';
export interface DBStores { daily_reports: unknown; weekly_reports: unknown; employees: unknown; roles: unknown; settings: unknown; notifications: unknown; audit_logs: unknown; evidence_attachments: unknown; }
type Store=keyof DBStores;
function readDemo(store:Store): Record<string,unknown>[] { return JSON.parse(sessionStorage.getItem('pp_demo_'+store) ?? '[]'); }
function saveDemo(store:Store, rows:unknown[]) { sessionStorage.setItem('pp_demo_'+store,JSON.stringify(rows)); }
export const dbService={
 async getAll<T>(store:Store):Promise<T[]> { return (isDemoSession()?readDemo(store):await readCloudStore({data:{store}})) as T[]; },
 async get<T>(store:Store,id:string):Promise<T|null> { const rows=await this.getAll<Record<string,unknown>>(store); return (rows.find(r=>(r['id']??r['key'])===id) as T) ?? null; },
 async put<T extends {id?:string;key?:string}>(store:Store,item:T):Promise<T> { const id=item.id??item.key; if(!id) throw new Error('Record identifier missing.'); if(isDemoSession()) { const rows=readDemo(store).filter(r=>(r['id']??r['key'])!==id);saveDemo(store,[...rows,item]); } else { await writeCloudRecord({data:{store,id,operation:'put',payload:item as Record<string,unknown>}}); } return item; },
 async delete(store:Store,id:string):Promise<boolean> { if(isDemoSession()) saveDemo(store,readDemo(store).filter(r=>(r['id']??r['key'])!==id)); else await writeCloudRecord({data:{store,id,operation:'delete'}});return true; },
 async clearStore(store:Store) { if(!isDemoSession()) throw new Error('Live records cannot be cleared.');saveDemo(store,[]); },
 async bulkPut<T extends {id?:string;key?:string}>(store:Store,items:T[]) { for(const item of items) await this.put(store,item); }
};
