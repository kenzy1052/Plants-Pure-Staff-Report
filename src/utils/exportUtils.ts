import type { DailyReport, WeeklyReport, OrganisationSettings } from '@/types';
import type { Worksheet } from 'exceljs';
import { startOfISOWeek, format, addDays, parseISO } from 'date-fns';
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
// =====================================================================
// Professional Excel workbook: a Summary page, then one page (tab) per week.
// =====================================================================
const C = { ink: 'FF231E1C', coral: 'FFD9533B', peach: 'FFFFF3EC', sand: 'FFFBF8F5', line: 'FFEAE2DC', muted: 'FF77716D', white: 'FFFFFFFF', green: 'FF2E7D32', amber: 'FFB26A00', red: 'FFC62828', band: 'FFF4E4DC' };
const COLS = [16, 44, 20, 38, 34];
type WeekGroup = { key: string; week: number; monday: Date; daily: DailyReport[]; weekly: WeeklyReport[] };

function groupByWeek(daily: DailyReport[], weekly: WeeklyReport[]): WeekGroup[] {
  const map = new Map<string, WeekGroup>();
  const add = (date: string) => {
    const monday = startOfISOWeek(parseISO(date)); const key = format(monday, 'yyyy-MM-dd');
    let g = map.get(key);
    if (!g) { g = { key, week: reportingWeekNumber(monday), monday, daily: [], weekly: [] }; map.set(key, g); }
    return g;
  };
  daily.forEach(r => add(r.date).daily.push(r));
  weekly.forEach(r => add(r.startDate).weekly.push(r));
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const statusColor = (s: string) => { const t = s.toLowerCase(); if (/not done|outstanding|returned|rejected/.test(t)) return C.red; if (/partly|pending|submitted|draft/.test(t)) return C.amber; return C.green; };
const solid = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });
const edge = { style: 'thin' as const, color: { argb: C.line } };
const box = () => ({ top: edge, bottom: edge, left: edge, right: edge });
const heightFor = (cells: { text: string; width: number }[], min = 20) => {
  let lines = 1;
  for (const c of cells) { const w = Math.max(8, c.width * 1.15); for (const part of String(c.text ?? '').split('\n')) lines = Math.max(lines, Math.max(1, Math.ceil(part.length / w))); }
  return Math.max(min, lines * 15 + 7);
};

function band(ws: Worksheet, text: string, o: { fill: string; color?: string; size?: number; height?: number; bold?: boolean; italic?: boolean; cols?: number }) {
  const row = ws.addRow([text]);
  ws.mergeCells(row.number, 1, row.number, o.cols ?? 5);
  const cell = row.getCell(1);
  cell.font = { name: 'Calibri', size: o.size ?? 12, bold: o.bold ?? true, italic: o.italic ?? false, color: { argb: o.color ?? C.white } };
  cell.fill = solid(o.fill);
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true };
  row.height = o.height ?? 24;
  return row;
}

function split(ws: Worksheet, left: string, right: string, fill: string, color: string) {
  const row = ws.addRow([left, '', '', right, '']);
  ws.mergeCells(row.number, 1, row.number, 3); ws.mergeCells(row.number, 4, row.number, 5);
  for (const [col, align] of [[1, 'left'], [4, 'right']] as const) {
    const c = row.getCell(col);
    c.font = { name: 'Calibri', size: 11.5, bold: true, color: { argb: color } }; c.fill = solid(fill);
    c.alignment = { vertical: 'middle', horizontal: align, indent: 1, wrapText: true };
  }
  row.height = 24;
}

function table(ws: Worksheet, title: string, headers: string[], rows: string[][], statusCol = -1) {
  if (!rows.length) return;
  const t = ws.addRow([title]); ws.mergeCells(t.number, 1, t.number, 5);
  t.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.coral } };
  t.getCell(1).alignment = { vertical: 'bottom', indent: 1 }; t.height = 22;
  const h = ws.addRow(headers); h.height = 22;
  for (let c = 1; c <= 5; c++) {
    const cell = h.getCell(c);
    cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: C.ink } };
    cell.fill = solid(C.peach); cell.border = box(); cell.alignment = { vertical: 'middle', wrapText: true, indent: 0 };
  }
  rows.forEach((values, i) => {
    const padded = [...values, '', '', '', '', ''].slice(0, 5);
    const row = ws.addRow(padded);
    for (let c = 1; c <= 5; c++) {
      const cell = row.getCell(c);
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = box();
      cell.font = c - 1 === statusCol ? { name: 'Calibri', size: 11, bold: true, color: { argb: statusColor(padded[c - 1]) } } : { name: 'Calibri', size: 11 };
      if (i % 2 === 1) cell.fill = solid(C.sand);
    }
    row.height = heightFor(padded.map((text, k) => ({ text, width: COLS[k] })));
  });
}

function spacer(ws: Worksheet, h = 10) { ws.addRow([]).height = h; }

function dailyBlock(ws: Worksheet, r: DailyReport) {
  split(ws, `${r.employeeName}  ·  ${r.roleTitle}`, `${r.reportCode}  ·  ${cap(r.status)}  ·  ${r.startTime}–${r.endTime}`, C.coral, C.white);
  table(ws, 'Objectives and achievements', ['#', 'Objective', 'Status', 'Results / figures', 'Reason if not completed'], r.objectives.map((o, i) => [String(i + 1), o.objective, o.status, o.resultsFigures || '—', o.reasonIfNotCompleted || '—']), 2);
  table(ws, 'Activities', ['Time', 'Activity / task', 'Quantity', 'Outcome', 'Place / person / platform'], r.activities.map(a => [a.time, a.activityTask, a.quantityFigures || '—', a.outcome || '—', a.placePersonPlatform || '—']));
  table(ws, 'Challenges and actions', ['When', 'Problem encountered', 'Status', 'Action taken', ''], r.challenges.map(c => [c.whenHappened, c.problemEncountered, c.resolved ? 'Resolved' : 'Outstanding', c.actionTaken || '—', '']), 2);
  table(ws, 'Planned for tomorrow', ['#', 'Planned task', 'Approvals', 'Resources needed', ''], r.tomorrowPlans.map((p, i) => [String(i + 1), p.plannedTask, p.approvalsRequired || 'None', p.resourcesNeeded || '—', '']));
  for (const rv of r.reviews ?? []) band(ws, `Review — ${rv.reviewerName}: ${cap(String(rv.decision))}${rv.rating ? ` (${rv.rating}/5)` : ''}${rv.comments ? ` — ${rv.comments}` : ''}`, { fill: C.band, color: C.ink, size: 10.5, bold: false, italic: true, height: 22 });
  spacer(ws);
}

function weeklyBlock(ws: Worksheet, r: WeeklyReport) {
  split(ws, `Weekly summary  ·  ${r.employeeName}`, `${r.reportCode}  ·  ${cap(r.status)}`, C.ink, C.white);
  const labels: Record<string, string> = { overview: 'Overview', achievements: 'Achievements', shortfalls: 'Shortfalls', keyFigures: 'Key figures', majorActivities: 'Major activities' };
  for (const [key, value] of Object.entries(r.summaryOfWeek)) {
    const row = ws.addRow([labels[key] ?? key, String(value ?? '') || '—']);
    ws.mergeCells(row.number, 2, row.number, 5);
    row.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.ink } }; row.getCell(1).fill = solid(C.peach);
    row.getCell(1).alignment = { vertical: 'top', wrapText: true, indent: 1 };
    row.getCell(2).font = { name: 'Calibri', size: 11 }; row.getCell(2).alignment = { vertical: 'top', wrapText: true };
    for (let c = 1; c <= 5; c++) row.getCell(c).border = box();
    row.height = heightFor([{ text: String(value ?? ''), width: COLS[1] + COLS[2] + COLS[3] + COLS[4] }], 24);
  }
  table(ws, 'Key results and figures', ['#', 'Item / activity', 'Target', 'Actual', 'Variance / comments'], r.keyResultsFigures.map((k, i) => [String(i + 1), k.itemActivity, String(k.target), String(k.actual), `${k.variance}${k.comments ? ` — ${k.comments}` : ''}`]));
  table(ws, 'Challenges and actions', ['#', 'Problem', 'Status', 'Action taken', ''], r.challengesGrouped.map((c, i) => [String(i + 1), c.problem, c.resolved ? 'Resolved' : 'Outstanding', c.actionTaken || '—', '']), 2);
  table(ws, 'Plan for next week', ['#', 'Planned activity', '', 'Recommendation', 'Resources needed'], r.recommendationsNextWeek.map((p, i) => [String(i + 1), p.plannedActivity, '', p.recommendation || '—', p.resourcesNeeded || '—']));
  if (r.additionalRecommendations) band(ws, `Additional recommendations — ${r.additionalRecommendations}`, { fill: C.band, color: C.ink, size: 10.5, bold: false, italic: true, height: 30 });
  spacer(ws);
}

function printSetup(ws: Worksheet, titleRows: string) {
  ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: titleRows, margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } };
  ws.headerFooter.oddFooter = '&L&"Calibri,Italic"&9Plants && Pure — Confidential&R&"Calibri,Italic"&9Page &P of &N';
}

export async function makeWorkbook(daily: DailyReport[], weekly: WeeklyReport[], settings?: OrganisationSettings) {
  const { Workbook } = await import('exceljs');
  const wb = new Workbook(); wb.creator = 'Plants & Pure'; wb.created = new Date();
  const org = (settings?.organisationName ?? 'Plants & Pure Limited').toUpperCase();
  const groups = groupByWeek(daily, weekly);

  // ---- Summary page ----
  const sm = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] });
  sm.columns = [{ width: 10 }, { width: 28 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 40 }];
  band(sm, org, { fill: C.ink, size: 18, height: 34, cols: 8 });
  band(sm, 'Staff reporting summary', { fill: C.coral, size: 12, height: 24, cols: 8 });
  band(sm, `Generated ${format(new Date(), 'd MMM yyyy')}  ·  ${groups.length} reporting week${groups.length === 1 ? '' : 's'}`, { fill: C.band, color: C.ink, size: 10.5, bold: false, italic: true, height: 22, cols: 8 });
  spacer(sm);
  const head = sm.addRow(['Week', 'Period', 'Daily reports', 'Weekly reports', 'Approved', 'Awaiting review', 'Returned / draft', 'Staff reporting']);
  head.height = 24;
  head.eachCell(cell => { cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: C.white } }; cell.fill = solid(C.ink); cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; cell.border = box(); });
  groups.forEach((g, i) => {
    const all = [...g.daily, ...g.weekly];
    const staff = [...new Set(all.map(r => r.employeeName))].join(', ');
    const row = sm.addRow([`Week ${g.week}`, `${format(g.monday, 'd MMM')} – ${format(addDays(g.monday, 6), 'd MMM yyyy')}`, g.daily.length, g.weekly.length, all.filter(r => r.status === 'approved').length, all.filter(r => r.status === 'submitted').length, all.filter(r => r.status !== 'approved' && r.status !== 'submitted').length, staff]);
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      cell.font = { name: 'Calibri', size: 11, bold: c === 1 }; cell.border = box();
      cell.alignment = { vertical: 'middle', horizontal: c === 2 || c === 8 ? 'left' : 'center', wrapText: true };
      if (i % 2 === 1) cell.fill = solid(C.sand);
    });
    row.height = heightFor([{ text: staff, width: 40 }], 22);
  });
  if (!groups.length) { const r = sm.addRow(['No reports recorded.']); sm.mergeCells(r.number, 1, r.number, 8); r.getCell(1).font = { italic: true, color: { argb: C.muted } }; }
  printSetup(sm, '1:3');

  // ---- One page per week ----
  for (const g of groups) {
    const ws = wb.addWorksheet(`Week ${g.week}`, { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] });
    ws.columns = COLS.map(width => ({ width }));
    band(ws, org, { fill: C.ink, size: 18, height: 34 });
    band(ws, `Week ${g.week}   ·   ${format(g.monday, 'd MMM')} – ${format(addDays(g.monday, 6), 'd MMM yyyy')}`, { fill: C.coral, size: 13, height: 26 });
    const all = [...g.daily, ...g.weekly];
    band(ws, `Daily reports: ${g.daily.length}   ·   Weekly reports: ${g.weekly.length}   ·   Approved: ${all.filter(r => r.status === 'approved').length}   ·   Awaiting review: ${all.filter(r => r.status === 'submitted').length}`, { fill: C.band, color: C.ink, size: 10.5, bold: false, italic: true, height: 22 });
    spacer(ws);
    for (const r of g.weekly) weeklyBlock(ws, r);
    for (let i = 0; i < 7; i++) {
      const day = addDays(g.monday, i); const date = format(day, 'yyyy-MM-dd');
      const reports = g.daily.filter(r => r.date === date).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
      if (!reports.length && i > 4) continue; // skip empty weekend days
      band(ws, `${format(day, 'EEEE')}  ·  ${format(day, 'd MMMM yyyy')}`, { fill: C.band, color: C.ink, size: 12.5, height: 26 });
      if (!reports.length) { const n = ws.addRow(['No report recorded.']); ws.mergeCells(n.number, 1, n.number, 5); n.getCell(1).font = { name: 'Calibri', size: 10.5, italic: true, color: { argb: C.muted } }; n.getCell(1).alignment = { indent: 1 }; spacer(ws); continue; }
      for (const r of reports) dailyBlock(ws, r);
    }
    printSetup(ws, '1:3');
  }
  return wb;
}

export async function exportReportsToExcel(daily: DailyReport[], weekly: WeeklyReport[], settings?: OrganisationSettings, filename = 'Plants-and-Pure-Reports.xlsx') {
  const workbook = await makeWorkbook(daily, weekly, settings);
  const bytes = await workbook.xlsx.writeBuffer();
  await deliverFile(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

// =====================================================================
// Professional Word document: cover, then a section per week with tables.
// =====================================================================
export async function makeCombinedWord(daily: DailyReport[], weekly: WeeklyReport[], settings?: OrganisationSettings): Promise<Blob> {
  const d = await import('docx');
  const { Document, Paragraph, TextRun, HeadingLevel, Packer, Footer, PageNumber, AlignmentType, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle } = d;
  const org = settings?.organisationName ?? 'Plants & Pure Limited';
  const groups = groupByWeek(daily, weekly);
  const W = 9906;
  const hex = (argb: string) => argb.slice(2);
  const edgeW = { style: BorderStyle.SINGLE, size: 4, color: hex(C.line) };
  const borders = { top: edgeW, bottom: edgeW, left: edgeW, right: edgeW };
  const fill = (color: string) => ({ type: ShadingType.CLEAR, color: 'auto', fill: color });
  const text = (t: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) => new TextRun({ text: t, bold: o.bold, size: o.size ?? 21, color: o.color, italics: o.italics });
  const p = (t: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean; after?: number } = {}) => new Paragraph({ spacing: { after: o.after ?? 80 }, children: [text(t, o)] });

  const makeTable = (headers: string[], rows: string[][], widths: number[], statusCol = -1) => new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => new TableCell({ width: { size: widths[i], type: WidthType.DXA }, borders, shading: fill('FFF3EC'), margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [text(h, { bold: true, size: 19, color: '231E1C' })] })] })) }),
      ...rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((t, i) => new TableCell({ width: { size: widths[i], type: WidthType.DXA }, borders, shading: ri % 2 ? fill('FBF8F5') : undefined, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ children: [text(t, { size: 19, bold: i === statusCol, color: i === statusCol ? hex(statusColor(t)) : undefined })] })] })) })),
    ],
  });
  const label = (t: string) => new Paragraph({ spacing: { before: 160, after: 80 }, keepNext: true, children: [text(t, { bold: true, size: 21, color: hex(C.coral) })] });

  const body: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    new Paragraph({ spacing: { before: 1800, after: 120 }, children: [text(org.toUpperCase(), { bold: true, size: 52, color: hex(C.coral) })] }),
    new Paragraph({ spacing: { after: 120 }, children: [text('Staff Reports', { bold: true, size: 40, color: hex(C.ink) })] }),
    p(`${groups.length} reporting week${groups.length === 1 ? '' : 's'}  ·  ${daily.length} daily and ${weekly.length} weekly report${daily.length + weekly.length === 1 ? '' : 's'}`, { size: 24, color: hex(C.muted) }),
    p(`Generated ${format(new Date(), 'd MMMM yyyy')}`, { size: 22, color: hex(C.muted) }),
  ];
  if (!groups.length) body.push(p('No reports recorded.', { italics: true }));

  groups.forEach((g, gi) => {
    body.push(new Paragraph({
      heading: HeadingLevel.HEADING_1, pageBreakBefore: true, shading: fill('231E1C'), spacing: { after: 200 },
      children: [text(`  Week ${g.week}   ·   ${format(g.monday, 'd MMM')} – ${format(addDays(g.monday, 6), 'd MMM yyyy')}`, { bold: true, size: 30, color: 'FFFFFF' })],
    }));
    for (const r of g.weekly) {
      body.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 100 }, shading: fill('FFF3EC'), children: [text(`Weekly summary — ${r.employeeName}  (${r.reportCode} · ${cap(r.status)})`, { bold: true, size: 25, color: '231E1C' })] }));
      for (const section of reportSections(r).slice(1)) {
        body.push(label(section.heading));
        for (const line of section.lines.length ? section.lines : ['None recorded.']) body.push(p(line));
      }
    }
    for (let i = 0; i < 7; i++) {
      const day = addDays(g.monday, i); const date = format(day, 'yyyy-MM-dd');
      const reports = g.daily.filter(r => r.date === date).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
      if (!reports.length) continue;
      body.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 320, after: 100 }, shading: fill('F4E4DC'), children: [text(`${format(day, 'EEEE')}  ·  ${format(day, 'd MMMM yyyy')}`, { bold: true, size: 25, color: '231E1C' })] }));
      for (const r of reports) {
        body.push(new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 }, keepNext: true, children: [text(`${r.employeeName}`, { bold: true, size: 23, color: hex(C.coral) }), text(`   ${r.roleTitle}  ·  ${r.reportCode}  ·  ${cap(r.status)}  ·  ${r.startTime}–${r.endTime}`, { size: 19, color: hex(C.muted) })] }));
        if (r.objectives.length) { body.push(label('Objectives and achievements')); body.push(makeTable(['#', 'Objective', 'Status', 'Results / figures', 'Reason if not done'], r.objectives.map((o, k) => [String(k + 1), o.objective, o.status, o.resultsFigures || '—', o.reasonIfNotCompleted || '—']), [500, 3000, 1200, 2706, 2500], 2)); }
        if (r.activities.length) { body.push(label('Activities')); body.push(makeTable(['Time', 'Activity / task', 'Quantity', 'Outcome', 'Place / person'], r.activities.map(a => [a.time, a.activityTask, a.quantityFigures || '—', a.outcome || '—', a.placePersonPlatform || '—']), [900, 3000, 1300, 2706, 2000]));}
        if (r.challenges.length) { body.push(label('Challenges and actions')); body.push(makeTable(['When', 'Problem encountered', 'Status', 'Action taken'], r.challenges.map(c => [c.whenHappened, c.problemEncountered, c.resolved ? 'Resolved' : 'Outstanding', c.actionTaken || '—']), [1100, 3600, 1300, 3906], 2)); }
        if (r.tomorrowPlans.length) { body.push(label('Planned for tomorrow')); body.push(makeTable(['#', 'Planned task', 'Approvals', 'Resources needed'], r.tomorrowPlans.map((t, k) => [String(k + 1), t.plannedTask, t.approvalsRequired || 'None', t.resourcesNeeded || '—']), [500, 4300, 2000, 3106])); }
        for (const rv of r.reviews ?? []) body.push(p(`Review — ${rv.reviewerName}: ${cap(String(rv.decision))}${rv.rating ? ` (${rv.rating}/5)` : ''}${rv.comments ? ` — ${rv.comments}` : ''}`, { italics: true, size: 19, color: hex(C.muted) }));
      }
    }
    void gi;
  });

  const doc = new Document({
    creator: 'Plants & Pure', title: `${org} — Staff Reports`,
    styles: { default: { document: { run: { font: 'Calibri', size: 21 }, paragraph: { spacing: { after: 80, line: 276 } } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${org} · Confidential · Page `, size: 17, color: hex(C.muted) }), new TextRun({ children: [PageNumber.CURRENT], size: 17, color: hex(C.muted) })] })] }) },
      children: body,
    }],
  });
  return Packer.toBlob(doc);
}

export async function exportReportsToWord(daily: DailyReport[], weekly: WeeklyReport[], settings?: OrganisationSettings, filename = 'Plants-and-Pure-Reports.docx') {
  await deliverFile(await makeCombinedWord(daily, weekly, settings), filename);
}
