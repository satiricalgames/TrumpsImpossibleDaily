'use client';

import { useMemo, useRef, useState } from 'react';
import builtInQuestions from '@/content/questions.json';
import { publicPath } from '@/lib/public-path';

type QuestionType = 'standard' | 'live';
type SourceKind = 'reference' | 'official' | 'internal' | 'original_satire' | 'user_supplied_asset';
type QuestionSource = { kind: SourceKind; title: string; publisher?: string; url?: string; path?: string; note?: string; accessedOn?: string };
type Question = {
  id: string; number: number; type: QuestionType; enabled: boolean; kicker: string; prompt: string;
  choices: string[]; correctIndex: number; feedback: string[]; sources: QuestionSource[]; metricKey?: string;
};

const SOURCE_KINDS: SourceKind[] = ['official', 'reference', 'internal', 'original_satire', 'user_supplied_asset'];
const clone = <T,>(value: T): T => structuredClone(value);
const blankQuestion = (number: number): Question => ({
  id: `question-${number}`, number, type: 'standard', enabled: true, kicker: '', prompt: '',
  choices: ['', '', '', ''], correctIndex: 0, feedback: ['', '', '', ''],
  sources: [{ kind: 'original_satire', title: 'Original satire', note: 'Original parody wording; no external factual claim.' }],
});
const normalize = (question: Question): Question => ({
  ...question, id: question.id.trim(), kicker: question.kicker.trim(), prompt: question.prompt.trim(),
  choices: question.choices.map((value) => value.trim()), feedback: question.feedback.map((value) => value.trim()),
  sources: question.sources.map((source) => ({
    kind: source.kind, title: source.title.trim(),
    ...(source.publisher?.trim() ? { publisher: source.publisher.trim() } : {}),
    ...(source.url?.trim() ? { url: source.url.trim() } : {}),
    ...(source.path?.trim() ? { path: source.path.trim() } : {}),
    ...(source.note?.trim() ? { note: source.note.trim() } : {}),
    ...(source.accessedOn?.trim() ? { accessedOn: source.accessedOn.trim() } : {}),
  })),
  ...(question.type === 'live' && question.metricKey?.trim() ? { metricKey: question.metricKey.trim() } : {}),
});
function validate(question: Question, bank: Question[], originalId: string | null): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(question.id)) errors.push('ID must use lowercase words joined by single hyphens.');
  if (bank.some((item) => item.id === question.id && item.id !== originalId)) errors.push('That question ID is already used.');
  if (!Number.isInteger(question.number) || question.number < 1) errors.push('Question number must be a positive whole number.');
  if (bank.some((item) => item.number === question.number && item.id !== originalId)) errors.push('That question number is already used.');
  if (!question.kicker) errors.push('Kicker is required.');
  if (!question.prompt) errors.push('Question prompt is required.');
  if (question.choices.length !== 4 || question.choices.some((choice) => !choice)) errors.push('Provide exactly four non-empty choices.');
  if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex > 3) errors.push('Select one correct answer.');
  if (question.feedback.length !== 4 || question.feedback.some((line) => !line)) errors.push('Provide one feedback line for each choice.');
  if (!question.sources.length) errors.push('Add at least one source or original-satire record.');
  question.sources.forEach((source, index) => {
    if (!source.title) errors.push(`Source ${index + 1} needs a title.`);
    if (['official', 'reference'].includes(source.kind) && !/^https?:\/\//.test(source.url ?? '')) errors.push(`Source ${index + 1} needs a complete web address.`);
    if (['internal', 'user_supplied_asset'].includes(source.kind) && !source.path) errors.push(`Source ${index + 1} needs a project path.`);
  });
  return errors;
}
function validateBank(value: unknown): Question[] {
  if (!Array.isArray(value) || !value.length) throw new Error('Upload a non-empty JSON array.');
  const bank = value as Question[]; const ids = new Set<string>(); const numbers = new Set<number>(); const issues: string[] = [];
  bank.forEach((question, index) => {
    const label = question?.id || `Item ${index + 1}`;
    if (!question || typeof question !== 'object') { issues.push(`${label} is not a question.`); return; }
    if (!['standard', 'live'].includes(question.type)) issues.push(`${label} uses unsupported type “${String(question.type)}”.`);
    if (ids.has(question.id)) issues.push(`Duplicate ID: ${question.id}.`); else ids.add(question.id);
    if (numbers.has(question.number)) issues.push(`Duplicate number: ${question.number}.`); else numbers.add(question.number);
    if (!Array.isArray(question.choices) || question.choices.length !== 4) issues.push(`${label} must have four choices.`);
    if (!Array.isArray(question.feedback) || question.feedback.length !== 4) issues.push(`${label} must have four feedback lines.`);
    if (!Array.isArray(question.sources) || !question.sources.length) issues.push(`${label} needs source information.`);
  });
  if (issues.length) throw new Error(`Import rejected: ${issues.slice(0, 8).join(' ')}`);
  return bank.map((question) => normalize({ ...question, enabled: question.enabled !== false })).sort((a, b) => a.number - b.number);
}

export default function DailyQuestionManager() {
  const builtIn = builtInQuestions as Question[];
  const [questions, setQuestions] = useState<Question[]>(() => builtIn.map(clone));
  const [selectedId, setSelectedId] = useState(builtIn[0]?.id ?? '');
  const [draft, setDraft] = useState<Question>(() => clone(builtIn[0]));
  const [originalId, setOriginalId] = useState<string | null>(builtIn[0]?.id ?? null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'standard' | 'live' | 'disabled'>('all');
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState(`Loaded ${builtIn.length} daily questions.`);
  const uploadInput = useRef<HTMLInputElement | null>(null);
  const filtered = useMemo(() => questions.filter((question) => {
    const text = `${question.number} ${question.id} ${question.kicker} ${question.prompt}`.toLowerCase();
    return text.includes(search.toLowerCase()) && (filter === 'all' || (filter === 'disabled' ? !question.enabled : question.type === filter));
  }), [questions, search, filter]);
  const jsonText = useMemo(() => `${JSON.stringify([...questions].sort((a, b) => a.number - b.number), null, 2)}\n`, [questions]);
  const patch = (value: Partial<Question>) => setDraft((current) => ({ ...current, ...value }));
  const loadSelection = (bank: Question[], id = bank[0]?.id) => {
    const selected = bank.find((question) => question.id === id); if (!selected) return;
    setSelectedId(selected.id); setOriginalId(selected.id); setDraft(clone(selected)); setErrors([]);
  };
  const pick = (id: string) => { loadSelection(questions, id); const selected = questions.find((question) => question.id === id); if (selected) setStatus(`Editing Q${selected.number}: ${selected.prompt}`); };
  const add = () => { const blank = blankQuestion(Math.max(0, ...questions.map((question) => question.number)) + 1); setSelectedId(''); setOriginalId(null); setDraft(blank); setErrors([]); setStatus('Preparing a new daily question.'); };
  const saveDraft = () => {
    const ready = normalize(draft); const nextErrors = validate(ready, questions, originalId); setErrors(nextErrors);
    if (nextErrors.length) { setStatus('Fix the validation issues before saving the draft.'); return; }
    const next = (originalId ? questions.map((question) => question.id === originalId ? ready : question) : [...questions, ready]).sort((a, b) => a.number - b.number);
    setQuestions(next); setSelectedId(ready.id); setOriginalId(ready.id); setDraft(clone(ready)); setStatus(`${originalId ? 'Updated' : 'Added'} Q${ready.number}. Download when finished.`);
  };
  const remove = () => {
    if (!originalId || !window.confirm(`Delete ${originalId} from this JSON draft?`)) return;
    const removedId = originalId; const next = questions.filter((question) => question.id !== removedId); setQuestions(next);
    if (next.length) loadSelection(next); else { const blank = blankQuestion(1); setSelectedId(''); setOriginalId(null); setDraft(blank); }
    setStatus(`Deleted ${removedId} from the draft. Download the JSON to keep this change.`);
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try { const imported = validateBank(JSON.parse(await file.text())); setQuestions(imported); loadSelection(imported); setStatus(`Imported ${imported.length} compatible daily questions from ${file.name}.`); }
    catch (error) { setStatus((error as Error).message); }
    finally { if (uploadInput.current) uploadInput.current.value = ''; }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([jsonText], { type: 'application/json' })); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'questions.json'; anchor.click(); URL.revokeObjectURL(url); setStatus(`Downloaded ${questions.length} questions.`);
  };
  const updateChoice = (index: number, value: string) => patch({ choices: draft.choices.map((choice, choiceIndex) => choiceIndex === index ? value : choice) });
  const updateFeedback = (index: number, value: string) => patch({ feedback: draft.feedback.map((line, lineIndex) => lineIndex === index ? value : line) });
  const updateSource = (index: number, value: Partial<QuestionSource>) => patch({ sources: draft.sources.map((source, sourceIndex) => sourceIndex === index ? { ...source, ...value } : source) });

  return <main className="question-editor-shell">
    <header className="editor-header"><div><p>DAILY CONTENT TOOL</p><h1>QUESTION BANK MANAGER</h1><span>Only four-choice Standard and Live questions are supported by Trump&apos;s Impossible Daily.</span></div><div className="editor-file-actions">
      <input ref={uploadInput} className="editor-hidden-input" type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} />
      <button type="button" onClick={() => uploadInput.current?.click()}>UPLOAD QUESTIONS.JSON</button><button type="button" onClick={download}>DOWNLOAD QUESTIONS.JSON</button>
      <button type="button" onClick={() => void navigator.clipboard.writeText(jsonText).then(() => setStatus('Copied the complete question bank.'))}>COPY COMPLETE JSON</button>
      <a href={publicPath('/weekly-editor/')}>OPEN WEEKLY SCHEDULER</a>
      <button type="button" className="editor-quiet" onClick={() => { const reset = builtIn.map(clone); setQuestions(reset); loadSelection(reset); setStatus('Restored the published question bank.'); }}>RESET</button>
    </div></header>
    <p className="editor-status">{status}</p>
    <div className="daily-bank-summary"><strong>{questions.length} TOTAL</strong><strong>{questions.filter((question) => question.enabled).length} ENABLED</strong><strong>{questions.filter((question) => question.type === 'live').length} LIVE-DATA</strong></div>
    <div className="editor-layout"><aside className="editor-sidebar">
      <button type="button" className="editor-mode-button active" onClick={add}>＋ ADD NEW QUESTION</button>
      <label className="editor-field"><span>Search questions</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ID, prompt or number" /></label>
      <label className="editor-field"><span>Show</span><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">All questions</option><option value="standard">Standard</option><option value="live">Live-data</option><option value="disabled">Disabled</option></select></label>
      <label className="editor-field"><span>Select question</span><select size={14} value={selectedId} onChange={(event) => pick(event.target.value)}>{filtered.map((question) => <option key={question.id} value={question.id}>Q{question.number} · {question.enabled ? question.type : 'disabled'} · {question.prompt}</option>)}</select></label>
    </aside><section className="editor-form-card">
      <div className="editor-form-title"><div><p>{originalId ? `EDITING ${originalId}` : 'NEW QUESTION'}</p><h2>{draft.type === 'live' ? 'LIVE-DATA QUESTION' : 'STANDARD QUESTION'}</h2></div><span>Disabled questions stay in the bank but are excluded from new schedules.</span></div>
      {errors.length > 0 && <div className="editor-errors" role="alert"><strong>FIX THESE ITEMS</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
      <div className="editor-grid">
        <label className="editor-check editor-span"><input type="checkbox" checked={draft.enabled} onChange={(event) => patch({ enabled: event.target.checked })} /><span>Enabled for weekly scheduling</span></label>
        <label className="editor-field"><span>Question ID</span><input value={draft.id} onChange={(event) => patch({ id: event.target.value })} /></label><label className="editor-field"><span>Question number</span><input type="number" min={1} value={draft.number} onChange={(event) => patch({ number: Number(event.target.value) })} /></label>
        <label className="editor-field"><span>Question type</span><select value={draft.type} onChange={(event) => patch({ type: event.target.value as QuestionType })}><option value="standard">Standard</option><option value="live">Live-data</option></select></label>
        {draft.type === 'live' && <label className="editor-field"><span>Metric key</span><input value={draft.metricKey ?? ''} onChange={(event) => patch({ metricKey: event.target.value })} placeholder="Optional update reference" /></label>}
        <label className="editor-field editor-span"><span>Kicker</span><input value={draft.kicker} onChange={(event) => patch({ kicker: event.target.value })} /></label><label className="editor-field editor-span"><span>Question</span><textarea rows={3} value={draft.prompt} onChange={(event) => patch({ prompt: event.target.value })} /></label>
        {draft.choices.map((choice, index) => <div className="daily-answer-editor" key={index}><label className="editor-field"><span>Answer {String.fromCharCode(65 + index)}</span><input value={choice} onChange={(event) => updateChoice(index, event.target.value)} /></label><label className="editor-field"><span>Feedback for {String.fromCharCode(65 + index)}</span><input value={draft.feedback[index] ?? ''} onChange={(event) => updateFeedback(index, event.target.value)} /></label></div>)}
        <label className="editor-field editor-span"><span>Correct answer</span><select value={draft.correctIndex} onChange={(event) => patch({ correctIndex: Number(event.target.value) })}>{draft.choices.map((choice, index) => <option key={index} value={index}>{String.fromCharCode(65 + index)} · {choice || 'Empty answer'}</option>)}</select></label>
      </div>
      <section className="editor-sources"><div className="editor-section-heading"><div><h3>SOURCES AND PROVENANCE</h3><p>Keep the factual source locations supplied with each question.</p></div><button type="button" onClick={() => patch({ sources: [...draft.sources, { kind: 'reference', title: '' }] })}>＋ ADD SOURCE</button></div>
        {draft.sources.map((source, index) => <div className="editor-source-card" key={`${index}-${source.kind}`}><div className="editor-source-number">SOURCE {index + 1}</div>
          <label className="editor-field"><span>Kind</span><select value={source.kind} onChange={(event) => updateSource(index, { kind: event.target.value as SourceKind })}>{SOURCE_KINDS.map((kind) => <option key={kind} value={kind}>{kind.replaceAll('_', ' ')}</option>)}</select></label><label className="editor-field"><span>Title</span><input value={source.title} onChange={(event) => updateSource(index, { title: event.target.value })} /></label><label className="editor-field"><span>Publisher</span><input value={source.publisher ?? ''} onChange={(event) => updateSource(index, { publisher: event.target.value })} /></label>
          {['official', 'reference'].includes(source.kind) && <label className="editor-field editor-span"><span>URL</span><input type="url" value={source.url ?? ''} onChange={(event) => updateSource(index, { url: event.target.value })} /></label>}{['internal', 'user_supplied_asset'].includes(source.kind) && <label className="editor-field editor-span"><span>Project path</span><input value={source.path ?? ''} onChange={(event) => updateSource(index, { path: event.target.value })} /></label>}
          <label className="editor-field"><span>Accessed on</span><input type="date" value={source.accessedOn ?? ''} onChange={(event) => updateSource(index, { accessedOn: event.target.value })} /></label><label className="editor-field editor-span"><span>Source note</span><textarea rows={2} value={source.note ?? ''} onChange={(event) => updateSource(index, { note: event.target.value })} /></label>
          {draft.sources.length > 1 && <button type="button" className="editor-remove" onClick={() => patch({ sources: draft.sources.filter((_, sourceIndex) => sourceIndex !== index) })}>REMOVE SOURCE</button>}
        </div>)}
      </section>
      <div className="editor-apply-row"><button type="button" onClick={saveDraft}>{originalId ? 'UPDATE QUESTION IN DRAFT' : 'ADD QUESTION TO DRAFT'}</button>{originalId && <button type="button" className="editor-danger" onClick={remove}>DELETE QUESTION</button>}<span>{questions.length} questions in this draft</span></div>
    </section></div>
  </main>;
}
