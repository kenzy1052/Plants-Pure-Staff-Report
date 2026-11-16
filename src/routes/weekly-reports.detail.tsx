import { createFileRoute, ClientOnly } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
const Workspace=lazy(()=>import('@/components/Workspace'));
export const Route=createFileRoute('/weekly-reports/detail')({
 head:()=>({meta:[{title:'Weekly Reports Detail | Plants & Pure'},{name:'description',content:'Weekly Reports Detail for Plants & Pure staff reporting and performance management.'},{property:'og:title',content:'Weekly Reports Detail | Plants & Pure'},{property:'og:description',content:'Weekly Reports Detail for Plants & Pure staff reporting and performance management.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),
 component:()=> <ClientOnly fallback={<div className="min-h-screen bg-background"/>}><Suspense fallback={<div className="min-h-screen bg-background"/>}><Workspace/></Suspense></ClientOnly>
});
