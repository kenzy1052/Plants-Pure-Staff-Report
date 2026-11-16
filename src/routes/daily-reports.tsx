import { createFileRoute, ClientOnly } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
const Workspace=lazy(()=>import('@/components/Workspace'));
export const Route=createFileRoute('/daily-reports')({
 head:()=>({meta:[{title:'Daily Reports | Plants & Pure'},{name:'description',content:'Daily Reports for Plants & Pure staff reporting and performance management.'},{property:'og:title',content:'Daily Reports | Plants & Pure'},{property:'og:description',content:'Daily Reports for Plants & Pure staff reporting and performance management.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),
 component:()=> <ClientOnly fallback={<div className="min-h-screen bg-background"/>}><Suspense fallback={<div className="min-h-screen bg-background"/>}><Workspace/></Suspense></ClientOnly>
});
