import type { DailyReport, WeeklyReport, OrganisationSettings } from '@/types';
import { getISOWeek, getISOWeekYear, startOfISOWeek, format, addDays, parseISO } from 'date-fns';
import { reportingWeekNumber } from './reportingWeek';

type Report = DailyReport | WeeklyReport;
type Section = { heading: string; lines: string[] };
export function reportSections(report: Report): Section[] {
 const weekly='weekNumber' in report;
 const sections:Section[]=[{heading:weekly?'Weekly report':'Daily report',lines:[`Report: ${report.reportCode}`,`Employee: ${report.employeeName} (${report.employeeCode})`,`Designation: ${report.roleTitle}`,`Department: ${report.department}`,`Period: ${weekly?`${report.startDate} to ${report.endDate}`:report.date}`,`Status: ${report.status}`,`Submitted to: ${report.submittedToName || 'Not assigned'}`]}];
 if(weekly) {
  sections.push(...Object.entries(report.summaryOfWeek).map(([key,value])=>({heading:({overview:'Weekly overview',achievements:'Achievements',shortfalls:'Shortfalls',keyFigures:'Key figures',majorActivities:'Major activities'} as Record<string,string>)[key]??key,lines:[value]})));
  for(const day of report.dailyObjectivesReview) sections.push({heading:`${day.dayName} — ${day.date}`,lines:day.items.flatMap(o=>[`${o.objective} — ${o.status}`,`Results: ${o.results}`,o.reason?`Outstanding reason: ${o.reason}`:'']).filter(Boolean)});
  sections.push({heading:'Results and figures',lines:report.keyResultsFigures.flatMap(r=>[r.itemActivity,`Target: ${r.target}; Actual: ${r.actual}; Variance: ${r.variance}`,r.comments])});
  sections.push({heading:'Challenges and actions',lines:report.challengesGrouped.flatMap(c=>[c.problem,`Action: ${c.actionTaken}`,`Status: ${c.resolved?'Resolved':'Outstanding'}`])});
  sections.push({heading:'Next week',lines:report.recommendationsNextWeek.flatMap(p=>[p.plannedActivity,`Recommendation: ${p.recommendation}`,`Resources: ${p.resourcesNeeded}`])});
  if(report.additionalRecommendations) sections.push({heading:'Additional recommendations',lines:[report.additionalRecommendations]});
  sections.push({heading:'Confirmation',lines:[report.employeeConfirmation?`I, ${report.employeeName}, confirm this report accurately represents my weekly activities.`:'Not yet confirmed.']});
 } else {
  sections.push({heading:'Working hours',lines:[`${report.startTime} to ${report.endTime}`]});
  sections.push({heading:'Objectives and achievements',lines:report.objectives.flatMap(o=>[`${o.objective} — ${o.status}`,`Results: ${o.resultsFigures || 'Not recorded'}`,o.reasonIfNotCompleted?`Outstanding reason: ${o.reasonIfNotCompleted}`:'']).filter(Boolean)});
  sections.push({heading:'Activities',lines:report.activities.flatMap(a=>[`${a.time} — ${a.activityTask}`,`Location: ${a.placePersonPlatform || 'Not recorded'}`,`Quantity: ${a.quantityFigures || 'Not recorded'}`,`Outcome: ${a.outcome || 'Not recorded'}`])});
  sections.push({heading:'Challenges and actions',lines:report.challenges.flatMap(c=>[`${c.whenHappened} — ${c.problemEncountered}`,`Action: ${c.actionTaken}`,`Status: ${c.resolved?'Resolved':'Outstanding'}`])});
  sections.push({heading:'Tomorrow’s planned tasks',lines:report.tomorrowPlans.flatMap(p=>[p.plannedTask,`Resources: ${p.resourcesNeeded || 'Not recorded'}`,`Approvals: ${p.approvalsRequired || 'None'}`])});
  sections.push({heading:'Evidence attachments',lines:report.attachments.map(a=>a.name)});
 }
 sections.push({heading:'Review history',lines:report.reviews.flatMap(r=>[`${r.reviewerName} — ${r.decision}${r.rating?` (${r.rating}/5)`:''}`,r.comments,`Reviewed: ${r.reviewedAt}`])});
 return sections;
}
export function downloadBlob(blob:Blob,filename:string) {const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export async function deliverFile(blob:Blob,filename:string) {const file=new File([blob],filename,{type:blob.type});if(matchMedia('(pointer: coarse)').matches&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:filename});return;}catch(e){if(e instanceof DOMException&&e.name==='AbortError')return;}}downloadBlob(blob,filename);}
export async function makeWord(report:Report):Promise<Blob> {
 const {Document,Paragraph,TextRun,HeadingLevel,Packer,Footer,PageNumber,AlignmentType}=await import('docx');
 const doc=new Document({creator:'Plants & Pure',title:report.reportCode,styles:{default:{document:{run:{font:'Calibri',size:22},paragraph:{spacing:{after:120,line:300}}}}},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1000,bottom:1000,left:1000,right:1000}}},footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun('Plants & Pure · Confidential · Page '),new TextRun({children:[PageNumber.CURRENT]})]})]})},children:[new Paragraph({text:'PLANTS & PURE NATURAL PRODUCTS LTD.',heading:HeadingLevel.TITLE}),...reportSections(report).flatMap(section=>[new Paragraph({text:section.heading,heading:HeadingLevel.HEADING_1,spacing:{before:240,after:120},keepNext:true}),...(section.lines.length?section.lines:['None recorded.']).map(text=>new Paragraph({text}))])]}]});
 return Packer.toBlob(doc);
}
export async function makePdf(report:Report):Promise<Blob> {
 const {PDFDocument,StandardFonts,rgb}=await import('pdf-lib'); const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);const bold=await doc.embedFont(StandardFonts.HelveticaBold);let page=doc.addPage([595.28,841.89]);let y=780;
 const clean=(value:string)=>value.normalize('NFKD').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[—–]/g,'-').replace(/[^\x20-\x7E\n]/g,'');
 const newPage=()=>{page=doc.addPage([595.28,841.89]);y=780;};
 const draw=(text:string,heading=false)=>{const f=heading?bold:font;const size=heading?13:10.5;const max=493;let line='';const output:string[]=[];for(const word of clean(text).split(/\s+/)){if(f.widthOfTextAtSize(line+' '+word,size)>max&&line){output.push(line);line=word;}else line+=(line?' ':'')+word;while(f.widthOfTextAtSize(line,size)>max){let cut=line.length;while(cut>1&&f.widthOfTextAtSize(line.slice(0,cut),size)>max)cut--;output.push(line.slice(0,cut));line=line.slice(cut);}}if(line)output.push(line);if(heading&&y<105)newPage();for(const row of output){if(y<65)newPage();page.drawText(row,{x:51,y,size,font:f,color:heading?rgb(.12,.32,.23):rgb(.15,.17,.16)});y-=heading?21:16;}y-=heading?4:5;};
 draw('PLANTS & PURE NATURAL PRODUCTS LTD.',true);draw('Staff reporting & performance management');y-=12;
 for(const section of reportSections(report)){draw(section.heading,true);for(const line of section.lines.length?section.lines:['None recorded.'])draw(line);y-=10;}
 doc.getPages().forEach((p,i)=>{p.drawText(`Plants & Pure | Confidential | Page ${i+1} of ${doc.getPageCount()}`,{x:51,y:32,size:8,font,color:rgb(.4,.43,.41)});});
 return new Blob([new Uint8Array(await doc.save())],{type:'application/pdf'});
}
export async function exportReportWord(report:Report){await deliverFile(await makeWord(report),`${report.reportCode}.docx`);}
export async function exportReportPdf(report:Report){await deliverFile(await makePdf(report),`${report.reportCode}.pdf`);}
export function downloadCSV(filename:string,rows:(string|number)[][]){const safe=(v:string|number)=>{let t=String(v??'');if(/^[=+@-]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"';};downloadBlob(new Blob(['\uFEFF'+rows.map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),filename);}
export function exportDailyReportsToCSV(reports:DailyReport[]){downloadCSV('Daily-reports.csv',[['Report','Employee','Date','Status','Objectives','Activities'],...reports.map(r=>[r.reportCode,r.employeeName,r.date,r.status,r.objectives.length,r.activities.length])]);}
export function exportWeeklyReportsToCSV(reports:WeeklyReport[]){downloadCSV('Weekly-reports.csv',[['Report','Employee','Week','Year','Status','Completion'],...reports.map(r=>[r.reportCode,r.employeeName,r.weekNumber,r.year,r.status,r.completionRate])]);}
export async function makeWorkbook(daily:DailyReport[],weekly:WeeklyReport[],settings?:OrganisationSettings){
 const {Workbook}=await import('exceljs');const workbook=new Workbook();workbook.creator='Plants & Pure';
 const groups=new Map<string,{monday:Date;daily:DailyReport[];weekly:WeeklyReport[]}>();
 const group=(date:string)=>{const d=parseISO(date);const key=`${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2,'0')}`;let value=groups.get(key);if(!value){value={monday:startOfISOWeek(d),daily:[],weekly:[]};groups.set(key,value);}return {key,value};};
 daily.forEach(r=>group(r.date).value.daily.push(r));weekly.forEach(r=>group(r.startDate).value.weekly.push(r));
 for(const [key,g]of [...groups.entries()].sort((a,b)=>b[0].localeCompare(a[0]))){
  const sheet=workbook.addWorksheet(`Week ${reportingWeekNumber(g.monday)}`,{views:[{state:'frozen',ySplit:3}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
  sheet.columns=[{width:24},{width:38},{width:25},{width:35},{width:32}];
  const heading=(text:string,main=false)=>{const row=sheet.addRow([text]);sheet.mergeCells(row.number,1,row.number,5);row.height=main?30:25;row.font={name:'Calibri',size:main?16:12,bold:true,color:{argb:'FFFFFFFF'}};row.fill={type:'pattern',pattern:'solid',fgColor:{argb:main?'FF174D35':'FF39745B'}};row.alignment={vertical:'middle',wrapText:true};};
  heading(settings?.organisationName??'Plants and Pure',true);heading(`Week ${reportingWeekNumber(g.monday)}  ·  ${format(g.monday,'d MMM')} – ${format(addDays(g.monday,6),'d MMM yyyy')}`);sheet.addRow(['Employee / Time','Activity / Planned task','Status / Quantity','Results / Achievements','Outstanding tasks / Resources']);
  for(const r of g.weekly){heading(`Weekly summary — ${r.employeeName}`);for(const section of reportSections(r).slice(1)) {sheet.addRow([section.heading,section.lines.join('\n')]);}}
  for(let i=0;i<7;i++){const date=format(addDays(g.monday,i),'yyyy-MM-dd');heading(`${format(addDays(g.monday,i),'EEEE')} — ${date}`);const reports=g.daily.filter(r=>r.date===date);if(!reports.length)sheet.addRow(['No report recorded.']);for(const r of reports){heading(`${r.employeeName} · ${r.reportCode} · ${r.status}`);for(const o of r.objectives)sheet.addRow(['Objective',o.objective,o.status,o.resultsFigures,o.reasonIfNotCompleted??'']);for(const a of r.activities)sheet.addRow([a.time,a.activityTask,a.quantityFigures,a.outcome,a.placePersonPlatform]);for(const c of r.challenges)sheet.addRow([c.whenHappened,c.problemEncountered,c.resolved?'Resolved':'Outstanding',c.actionTaken,'']);for(const p of r.tomorrowPlans)sheet.addRow(['Planned task',p.plannedTask,'Planned',p.approvalsRequired,p.resourcesNeeded]);}}
  sheet.eachRow(row=>{if(!row.font?.bold){row.font={name:'Calibri',size:11};row.alignment={vertical:'top',wrapText:true};let lines=1;row.eachCell((cell,index)=>{const width=sheet.getColumn(index).width??24;lines=Math.max(lines,...String(cell.value??'').split('\n').map(text=>Math.ceil(text.length/Math.max(10,width-3))));});row.height=Math.max(32,lines*16+12);}row.eachCell(cell=>{cell.border={bottom:{style:'hair',color:{argb:'FFDCE6DF'}}};});});
  sheet.autoFilter={from:'A3',to:'E3'};
 }
 if(!groups.size){const s=workbook.addWorksheet('Overview');s.addRow(['Plants & Pure']);s.addRow(['No reports recorded.']);}
 return workbook;
}
export async function exportReportsToExcel(daily:DailyReport[],weekly:WeeklyReport[],settings?:OrganisationSettings,filename='Plants-and-Pure-Reports.xlsx'){const workbook=await makeWorkbook(daily,weekly,settings);const bytes=await workbook.xlsx.writeBuffer();await deliverFile(new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),filename);}
