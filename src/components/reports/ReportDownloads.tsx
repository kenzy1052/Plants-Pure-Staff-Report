import { useEffect, useState } from 'react';
import { Download, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DailyReport, WeeklyReport } from '@/types';
import { makeWord, makePdf, makeWorkbook, deliverFile } from '@/utils/exportUtils';
const EMPTY_DAILY:DailyReport[]=[];
export function ReportDownloads({report,dailyReports=EMPTY_DAILY}:{report:DailyReport|WeeklyReport;dailyReports?:DailyReport[]}) {
 const [files,setFiles]=useState<{word:Blob;pdf:Blob;excel:Blob}|null>(null);const [error,setError]=useState('');
 useEffect(()=>{let active=true;setFiles(null);void(async()=>{try{const [word,pdf,workbook]=await Promise.all([makeWord(report),makePdf(report),makeWorkbook('weekNumber' in report?dailyReports:[report],'weekNumber' in report?[report]:[])]);const excel=new Blob([new Uint8Array(await workbook.xlsx.writeBuffer())],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});if(active)setFiles({word,pdf,excel});}catch(e){if(active)setError(e instanceof Error?e.message:'Documents could not be prepared.');}})();return()=>{active=false}},[report,dailyReports]);
 return <div className="flex flex-wrap gap-2 items-center">{([['pdf','Download PDF',Download,'pdf'],['word','Word (.docx)',FileText,'docx'],['excel','Excel (.xlsx)',FileSpreadsheet,'xlsx']] as const).map(([key,label,Icon,extension])=><Button key={key} variant="outline" size="sm" disabled={!files} onClick={()=>{if(files)void deliverFile(files[key],`${report.reportCode}.${extension}`)}}>{files?<Icon/>:<Loader2 className="animate-spin"/>}{label}</Button>)}{error&&<span role="alert" className="text-xs text-destructive">{error}</span>}</div>;
}