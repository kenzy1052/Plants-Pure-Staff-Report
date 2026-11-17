import { createFileRoute, ClientOnly } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
const Workspace=lazy(()=>import('@/components/Workspace'));
export const Route=createFileRoute('/auth')({
 head:()=>({meta:[{title:'Create your staff account | Plants & Pure'},{name:'description',content:'Create a Plants & Pure staff account for reporting and performance management.'},{property:'og:title',content:'Create your staff account | Plants & Pure'},{property:'og:description',content:'Create a Plants & Pure staff account for reporting and performance management.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),
 component:()=> <ClientOnly fallback={<div className="min-h-screen bg-background"/>}><Suspense fallback={<div className="min-h-screen bg-background"/>}><Workspace/></Suspense></ClientOnly>
});
