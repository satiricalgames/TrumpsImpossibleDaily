'use client';

import { useMemo, useRef, useState } from 'react';
import builtInQuestions from '@/content/questions.json';
import builtInWeekly from '@/content/weekly_game.json';
import { publicPath } from '@/lib/public-path';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
type Day = typeof DAYS[number];
type Question = { id: string; number: number; type: 'standard' | 'live'; enabled?: boolean; kicker: string; prompt: string; choices: string[]; correctIndex: number };
type WeeklyFile = {
  weekStart: string; title: string; kicker: string; image: string; imageAlt: string;
  target: { xPct: number; yPct: number; widthPct: number; heightPct: number };
  dailyQuestionIds: Record<Day, string[]>; meltdownResponses: string[];
};

const clone = <T,>(value: T): T => structuredClone(value);
function hash(text: string) { let value = 2166136261; for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619); return value >>> 0; }
function shuffled<T>(items: T[], seedText: string): T[] {
  let seed = hash(seedText); const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const other = seed % (index + 1); [copy[index], copy[other]] = [copy[other], copy[index]]; }
  return copy;
}
function validateBank(value: unknown): Question[] {
  if (!Array.isArray(value) || !value.length) throw new Error('Upload a non-empty questions.json array.');
  const bank = value as Question[];
  const invalid = bank.find((question) => !question?.id || !Number.isInteger(question.number) || !['standard', 'live'].includes(question.type) || !Array.isArray(question.choices) || question.choices.length !== 4 || !Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex > 3);
  if (invalid) throw new Error(`Question “${invalid.id || 'unknown'}” is not compatible with the daily four-choice format.`);
  if (new Set(bank.map((question) => question.id)).size !== bank.length) throw new Error('The uploaded bank contains duplicate question IDs.');
  return bank.sort((a, b) => a.number - b.number);
}
function isMonday(value: string) { if (!value) return false; const [year, month, day] = value.split('-').map(Number); return new Date(year, month - 1, day, 12).getDay() === 1; }

export default function WeeklyScheduleManager() {
  const [draft, setDraft] = useState<WeeklyFile>(() => clone(builtInWeekly) as WeeklyFile);
  const [questions, setQuestions] = useState<Question[]>(() => clone(builtInQuestions) as Question[]);
  const [questionFileName, setQuestionFileName] = useState('published questions.json');
  const [previewUrl, setPreviewUrl] = useState(publicPath(builtInWeekly.image));
  const [status, setStatus] = useState('Loaded the published weekly investigation and question bank.');
  const imageInput = useRef<HTMLInputElement | null>(null); const questionsInput = useRef<HTMLInputElement | null>(null);
  const eligible = useMemo(() => questions.filter((question) => question.enabled !== false), [questions]);
  const scheduleIds = DAYS.flatMap((day) => draft.dailyQuestionIds[day]);
  const duplicateIds = [...new Set(scheduleIds.filter((id, index) => scheduleIds.indexOf(id) !== index))];
  const missingIds = [...new Set(scheduleIds.filter((id) => !eligible.some((question) => question.id === id)))];
  const scheduleIssues = [
    ...(!isMonday(draft.weekStart) ? ['Week commencing must be a Monday.'] : []),
    ...DAYS.filter((day) => draft.dailyQuestionIds[day].length !== 5).map((day) => `${day} must contain exactly five questions.`),
    ...(duplicateIds.length ? [`Repeated questions: ${duplicateIds.join(', ')}.`] : []),
    ...(missingIds.length ? [`Missing or disabled questions: ${missingIds.join(', ')}.`] : []),
  ];
  const patch = (value: Partial<WeeklyFile>) => setDraft((current) => ({ ...current, ...value }));
  const updateSlot = (day: Day, index: number, id: string) => patch({ dailyQuestionIds: { ...draft.dailyQuestionIds, [day]: draft.dailyQuestionIds[day].map((current, slot) => slot === index ? id : current) } });
  const generate = () => {
    if (eligible.length < 35) { setStatus(`At least 35 enabled questions are required; ${eligible.length} are available.`); return; }
    if (!isMonday(draft.weekStart)) { setStatus('Choose a Monday before generating the schedule.'); return; }
    const selected = shuffled(eligible, draft.weekStart).slice(0, 35);
    const schedule = Object.fromEntries(DAYS.map((day, index) => [day, selected.slice(index * 5, index * 5 + 5).map((question) => question.id)])) as Record<Day, string[]>;
    patch({ dailyQuestionIds: schedule }); setStatus(`Generated 35 unique questions for the week beginning ${draft.weekStart}.`);
  };
  const uploadBank = async (file?: File) => {
    if (!file) return;
    try { const bank = validateBank(JSON.parse(await file.text())); setQuestions(bank); setQuestionFileName(file.name); setStatus(`Loaded ${bank.length} questions from ${file.name}; ${bank.filter((question) => question.enabled !== false).length} are enabled.`); }
    catch (error) { setStatus((error as Error).message); }
    finally { if (questionsInput.current) questionsInput.current.value = ''; }
  };
  const uploadImage = (file?: File) => {
    if (!file) return; if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file)); patch({ image: `/assets/weekly/${file.name}` }); setStatus(`Previewing ${file.name}. Copy it into public/assets/weekly before publishing.`);
  };
  const setTarget = (event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect(); const x = ((event.clientX - bounds.left) / bounds.width) * 100; const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    const { widthPct, heightPct } = draft.target;
    patch({ target: { ...draft.target, xPct: Math.max(0, Math.min(100 - widthPct, Number((x - widthPct / 2).toFixed(1)))), yPct: Math.max(0, Math.min(100 - heightPct, Number((y - heightPct / 2).toFixed(1)))) } });
    setStatus('Moved the Trump target area.');
  };
  const download = () => {
    if (scheduleIssues.length) { setStatus(`Cannot download yet: ${scheduleIssues.join(' ')}`); return; }
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(draft, null, 2)}\n`], { type: 'application/json' })); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `weekly_game-${draft.weekStart}.json`; anchor.click(); URL.revokeObjectURL(url); setStatus('Downloaded the validated weekly game file.');
  };

  return <main className="question-editor-shell weekly-editor-shell">
    <header className="editor-header"><div><p>WEEKLY CONTENT TOOL</p><h1>WEEKLY GAME SCHEDULER</h1><span>Choose the picture and schedule 35 unique questions using readable prompts instead of IDs.</span></div><div className="editor-file-actions">
      <input ref={questionsInput} className="editor-hidden-input" type="file" accept="application/json,.json" onChange={(event) => void uploadBank(event.target.files?.[0])} /><input ref={imageInput} className="editor-hidden-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadImage(event.target.files?.[0])} />
      <button type="button" onClick={() => questionsInput.current?.click()}>UPLOAD QUESTIONS.JSON</button><button type="button" onClick={() => imageInput.current?.click()}>UPLOAD WEEKLY PICTURE</button><button type="button" onClick={generate}>GENERATE 35 UNIQUE QUESTIONS</button><button type="button" onClick={download}>DOWNLOAD WEEKLY JSON</button><a href={publicPath('/question-editor/')}>OPEN QUESTION MANAGER</a>
      <button type="button" className="editor-quiet" onClick={() => { setDraft(clone(builtInWeekly) as WeeklyFile); setQuestions(clone(builtInQuestions) as Question[]); setQuestionFileName('published questions.json'); setPreviewUrl(publicPath(builtInWeekly.image)); setStatus('Restored the published weekly game.'); }}>RESET</button>
    </div></header>
    <p className="editor-status">{status}</p>
    <div className="daily-bank-summary"><strong>{eligible.length} ENABLED QUESTIONS</strong><strong>{new Set(scheduleIds).size}/35 UNIQUE SCHEDULED</strong><strong>{questionFileName}</strong></div>
    {scheduleIssues.length > 0 && <div className="editor-errors schedule-errors"><strong>SCHEDULE NEEDS ATTENTION</strong><ul>{scheduleIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
    <section className="weekly-editor-grid">
      <div className="editor-form-card weekly-settings"><h2>WEEKLY DETAILS</h2>
        <label className="editor-field"><span>Week commencing Monday</span><input type="date" value={draft.weekStart} onChange={(event) => patch({ weekStart: event.target.value })} /></label><label className="editor-field"><span>Weekly title</span><input value={draft.title} onChange={(event) => patch({ title: event.target.value })} /></label><label className="editor-field"><span>Kicker</span><input value={draft.kicker} onChange={(event) => patch({ kicker: event.target.value })} /></label><label className="editor-field"><span>Published image path</span><input value={draft.image} onChange={(event) => patch({ image: event.target.value })} /></label><label className="editor-field"><span>Accessible image description</span><textarea rows={3} value={draft.imageAlt} onChange={(event) => patch({ imageAlt: event.target.value })} /></label>
        <h3 className="editor-subheading">TRUMP TARGET AREA</h3><div className="target-inputs">{(['xPct', 'yPct', 'widthPct', 'heightPct'] as const).map((field) => <label className="editor-field" key={field}><span>{field}</span><input type="number" min="0" max="100" step="0.5" value={draft.target[field]} onChange={(event) => patch({ target: { ...draft.target, [field]: Number(event.target.value) } })} /></label>)}</div>
        <div className="editor-notice"><strong>PUBLISHING NOTE</strong><span>Upload previews remain in your browser. Publish the downloaded weekly JSON, the same questions.json and the selected picture together.</span></div>
      </div>
      <div className="weekly-preview-card"><p>CLICK TRUMP TO POSITION THE TARGET</p><div className="weekly-admin-preview" onClick={setTarget}><img src={previewUrl} alt={draft.imageAlt} /><i style={{ left: `${draft.target.xPct}%`, top: `${draft.target.yPct}%`, width: `${draft.target.widthPct}%`, height: `${draft.target.heightPct}%` }} /><div className="admin-tile-grid">{Array.from({ length: 25 }, (_, index) => <span key={index} />)}</div></div></div>
      <div className="editor-form-card weekly-schedule-card"><h2>35-QUESTION WEEKLY SCHEDULE</h2><p>Each question should appear once. Every player receives the same five questions on the same local calendar day.</p>
        <div className="weekly-days friendly-schedule">{DAYS.map((day) => <section className="schedule-day" key={day}><h3>{day.toUpperCase()}</h3>{Array.from({ length: 5 }, (_, index) => <label className="editor-field" key={index}><span>Question {index + 1}</span><select value={draft.dailyQuestionIds[day][index] ?? ''} onChange={(event) => updateSlot(day, index, event.target.value)}><option value="">Choose a question…</option>{eligible.map((question) => <option key={question.id} value={question.id}>Q{question.number} · {question.type === 'live' ? 'LIVE · ' : ''}{question.prompt}</option>)}</select></label>)}</section>)}</div>
      </div>
      <div className="editor-form-card weekly-responses-card"><h2>REUSABLE MELTDOWN RESPONSES</h2><p>One response per line.</p><textarea rows={14} value={draft.meltdownResponses.join('\n')} onChange={(event) => patch({ meltdownResponses: event.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) })} /></div>
    </section>
  </main>;
}
