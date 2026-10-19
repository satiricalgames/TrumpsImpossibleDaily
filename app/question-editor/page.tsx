'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import questionsData from '@/content/questions.json';
import executiveMetricsData from '@/content/executive_metrics.json';

type QuestionType = 'standard' | 'injunction' | 'hotspot' | 'live' | 'taco' | 'bing' | 'golf' | 'final';
type SourceKind = 'reference' | 'official' | 'internal' | 'original_satire' | 'user_supplied_asset';

type QuestionSource = {
  kind: SourceKind;
  title: string;
  publisher?: string;
  url?: string;
  path?: string;
  note?: string;
  accessedOn?: string;
};

type Question = {
  id: string;
  number: number;
  type: QuestionType;
  kicker: string;
  prompt: string;
  choices?: string[];
  rewrittenChoices?: string[];
  correctIndex?: number;
  grantSkip?: boolean;
  trapIndex?: number;
  backtrackBy?: number;
  timerSeconds?: number;
  golfTargetPower?: number;
  metricKey?: string;
  hotspot?: { xPct: number; yPct: number; widthPct: number; heightPct: number };
  missRules?: { clicksBeforeLifeLoss: number; maxLivesLost: number };
  audio?: { onTargetClick?: string; volume?: number };
  sources: QuestionSource[];
  feedback: string[];
};

type WritableFile = {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
};

type LocalFileHandle = {
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<WritableFile>;
};

const QUESTION_TYPES: Array<{ value: QuestionType; label: string; help: string }> = [
  { value: 'standard', label: 'Standard multiple choice', help: 'Normal answer choices with one correct answer and optional Skip reward.' },
  { value: 'injunction', label: 'Injunction', help: 'The first click rewrites every answer; the player then answers the rewritten choices.' },
  { value: 'hotspot', label: 'Hidden hotspot', help: 'Timed question with a responsive hidden rectangular click target and miss penalties.' },
  { value: 'live', label: 'Live metric', help: 'Multiple choice whose correct answer displays a selected value from executive_metrics.json.' },
  { value: 'taco', label: 'Taco trap', help: 'Multiple choice with one trap answer that sends the player backwards.' },
  { value: 'bing', label: 'BING mini-game', help: 'Timed rapid-click score challenge with a dedicated sound file.' },
  { value: 'golf', label: 'Golf mini-game', help: 'Power-timing challenge with a configured target power.' },
  { value: 'final', label: 'Final question', help: 'Terminal, deliberately unwinnable question. Keep correctIndex at -1.' },
];

const CHOICE_TYPES = new Set<QuestionType>(['standard', 'injunction', 'live', 'taco', 'final']);
const METRIC_OPTIONS = [
  { value: 'activeInjunctions', label: 'Active injunctions', current: executiveMetricsData.activeInjunctions },
  { value: 'golfCounter', label: 'Golf counter', current: executiveMetricsData.golfCounter },
  { value: 'simulatedPoll', label: 'Simulated poll', current: executiveMetricsData.simulatedPoll },
  { value: 'latestExecutiveOrder.value', label: 'Latest executive order value', current: executiveMetricsData.latestExecutiveOrder.value },
];

function cloneQuestion(question: Question): Question {
  return JSON.parse(JSON.stringify(question)) as Question;
}

function nextQuestionNumber(questions: Question[]) {
  const used = new Set(questions.map((question) => question.number));
  for (let number = 1; number < 47; number += 1) if (!used.has(number)) return number;
  return 46;
}

function blankQuestion(type: QuestionType, number: number): Question {
  const base: Question = {
    id: `question-${number}`,
    number,
    type,
    kicker: '',
    prompt: '',
    sources: [{ kind: 'original_satire', title: 'Original game satire', note: 'Original parody premise; no external factual claim.' }],
    feedback: [],
  };
  if (CHOICE_TYPES.has(type)) {
    base.choices = ['', '', '', ''];
    base.feedback = ['', '', '', ''];
    base.correctIndex = type === 'final' ? -1 : 0;
  }
  if (type === 'injunction') base.rewrittenChoices = ['', '', '', ''];
  if (type === 'live') base.metricKey = 'activeInjunctions';
  if (type === 'hotspot') {
    base.timerSeconds = 15;
    base.hotspot = { xPct: 50, yPct: 50, widthPct: 8, heightPct: 10 };
    base.missRules = { clicksBeforeLifeLoss: 3, maxLivesLost: 1 };
    base.feedback = ['MISS.'];
  }
  if (type === 'taco') {
    base.trapIndex = 1;
    base.backtrackBy = 5;
  }
  if (type === 'bing') {
    base.timerSeconds = 20;
    base.audio = { onTargetClick: '/assets/audio/minigames/bing/bing-bong.mp3', volume: 1 };
  }
  if (type === 'golf') base.golfTargetPower = 70;
  return base;
}

function compactLines(lines: string[] | undefined) {
  return (lines ?? []).map((line) => line.trim()).filter(Boolean);
}

function normalizeQuestion(question: Question): Question {
  const normalized = cloneQuestion(question);
  normalized.id = normalized.id.trim();
  normalized.kicker = normalized.kicker.trim();
  normalized.prompt = normalized.prompt.trim();
  normalized.feedback = compactLines(normalized.feedback);
  normalized.sources = normalized.sources.map((source) => ({
    kind: source.kind,
    title: source.title.trim(),
    ...(source.publisher?.trim() ? { publisher: source.publisher.trim() } : {}),
    ...(source.url?.trim() ? { url: source.url.trim() } : {}),
    ...(source.path?.trim() ? { path: source.path.trim() } : {}),
    ...(source.note?.trim() ? { note: source.note.trim() } : {}),
    ...(source.accessedOn?.trim() ? { accessedOn: source.accessedOn.trim() } : {}),
  }));
  if (normalized.choices) normalized.choices = compactLines(normalized.choices);
  if (normalized.rewrittenChoices) normalized.rewrittenChoices = compactLines(normalized.rewrittenChoices);
  return normalized;
}

function validateQuestion(question: Question, questions: Question[], editingId: string | null) {
  const errors: string[] = [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(question.id)) errors.push('ID must use lowercase letters, numbers and single hyphens.');
  if (questions.some((item) => item.id === question.id && item.id !== editingId)) errors.push('Question ID is already in use.');
  if (!Number.isInteger(question.number) || question.number < 1 || question.number > 47) errors.push('Question number must be a whole number from 1 to 47.');
  if (questions.some((item) => item.number === question.number && item.id !== editingId)) errors.push('Question number is already in use.');
  if (!question.kicker.trim()) errors.push('Kicker is required.');
  if (!question.prompt.trim()) errors.push('Prompt is required.');
  if (!question.sources.length) errors.push('At least one source or creative-provenance record is required.');
  question.sources.forEach((source, index) => {
    if (!source.title.trim()) errors.push(`Source ${index + 1} needs a title.`);
    if (['official', 'reference'].includes(source.kind) && !/^https?:\/\//.test(source.url ?? '')) errors.push(`Source ${index + 1} needs a complete http(s) URL.`);
    if (['internal', 'user_supplied_asset'].includes(source.kind) && !source.path?.trim()) errors.push(`Source ${index + 1} needs a file path.`);
  });
  if (CHOICE_TYPES.has(question.type)) {
    const choices = compactLines(question.choices);
    const feedback = compactLines(question.feedback);
    if (choices.length < 2) errors.push('This type needs at least two answer choices.');
    if (feedback.length !== choices.length) errors.push('Provide one non-empty feedback line for every answer choice.');
    if (question.type === 'final') {
      if (question.correctIndex !== -1) errors.push('The final question must use correctIndex -1.');
    } else if ((question.correctIndex ?? -1) < 0 || (question.correctIndex ?? -1) >= choices.length) {
      errors.push('Correct answer index is outside the answer list.');
    }
    if (question.type === 'injunction' && compactLines(question.rewrittenChoices).length !== choices.length) errors.push('Injunction questions need one rewritten choice per original choice.');
    if (question.type === 'live' && !METRIC_OPTIONS.some((metric) => metric.value === question.metricKey)) errors.push('Choose a valid executive metric for this live question.');
    if (question.type === 'taco' && ((question.trapIndex ?? -1) < 0 || (question.trapIndex ?? -1) >= choices.length)) errors.push('Trap index is outside the answer list.');
  }
  if (question.type === 'hotspot') {
    const box = question.hotspot;
    if (!box || [box.xPct, box.yPct, box.widthPct, box.heightPct].some((value) => !Number.isFinite(value))) errors.push('Complete all hotspot coordinates.');
    if (box && (box.xPct < 0 || box.yPct < 0 || box.widthPct <= 0 || box.heightPct <= 0 || box.xPct + box.widthPct > 100 || box.yPct + box.heightPct > 100)) errors.push('Hotspot rectangle must stay within the 0–100% stage.');
    if ((question.timerSeconds ?? 0) < 1) errors.push('Hotspot timer must be at least one second.');
  }
  if (question.type === 'bing') {
    if ((question.timerSeconds ?? 0) < 1) errors.push('BING timer must be at least one second.');
    if (!question.audio?.onTargetClick?.trim()) errors.push('BING questions need an audio path.');
  }
  if (question.type === 'golf' && ((question.golfTargetPower ?? 0) < 1 || (question.golfTargetPower ?? 0) > 100)) errors.push('Golf target power must be from 1 to 100.');
  return errors;
}

function LinesField({ label, value, onChange, hint }: { label: string; value?: string[]; onChange: (lines: string[]) => void; hint?: string }) {
  return <label className="editor-field editor-span"><span>{label}</span>{hint && <small>{hint}</small>}<textarea rows={5} value={(value ?? []).join('\n')} onChange={(event) => onChange(event.target.value.split('\n'))} /></label>;
}

export default function QuestionEditor() {
  const builtIn = questionsData as Question[];
  const [questions, setQuestions] = useState<Question[]>(() => builtIn.map(cloneQuestion));
  const [mode, setMode] = useState<'add' | 'edit'>('edit');
  const [editingId, setEditingId] = useState<string | null>(builtIn[0]?.id ?? null);
  const [draft, setDraft] = useState<Question>(() => cloneQuestion(builtIn[0]));
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState('Loaded the built-in question bank.');
  const [dirty, setDirty] = useState(false);
  const fileHandle = useRef<LocalFileHandle | null>(null);
  const uploadInput = useRef<HTMLInputElement | null>(null);

  const typeInfo = useMemo(() => QUESTION_TYPES.find((item) => item.value === draft.type)!, [draft.type]);
  const jsonText = useMemo(() => `${JSON.stringify([...questions].sort((a, b) => a.number - b.number), null, 2)}\n`, [questions]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const patchDraft = (patch: Partial<Question>) => setDraft((current) => ({ ...current, ...patch }));

  const chooseMode = (nextMode: 'add' | 'edit') => {
    setMode(nextMode);
    setErrors([]);
    if (nextMode === 'add') {
      setEditingId(null);
      setDraft(blankQuestion('standard', nextQuestionNumber(questions)));
    } else {
      const selected = questions[0];
      setEditingId(selected?.id ?? null);
      if (selected) setDraft(cloneQuestion(selected));
    }
  };

  const selectQuestion = (id: string) => {
    const selected = questions.find((question) => question.id === id);
    if (!selected) return;
    setEditingId(id);
    setDraft(cloneQuestion(selected));
    setErrors([]);
    setStatus(`Editing Question ${selected.number}: ${selected.id}`);
  };

  const changeType = (type: QuestionType) => {
    const replacement = blankQuestion(type, draft.number);
    setDraft({ ...replacement, id: draft.id, number: draft.number, kicker: draft.kicker, prompt: draft.prompt, sources: draft.sources });
    setErrors([]);
  };

  const applyDraft = () => {
    const normalized = normalizeQuestion(draft);
    const nextErrors = validateQuestion(normalized, questions, editingId);
    setErrors(nextErrors);
    if (nextErrors.length) {
      setStatus('Fix the validation issues before applying this question.');
      return;
    }
    const nextQuestions = mode === 'add'
      ? [...questions, normalized]
      : questions.map((question) => question.id === editingId ? normalized : question);
    setQuestions(nextQuestions.sort((a, b) => a.number - b.number));
    setMode('edit');
    setEditingId(normalized.id);
    setDraft(cloneQuestion(normalized));
    setDirty(true);
    setStatus(`${mode === 'add' ? 'Added' : 'Updated'} Question ${normalized.number}. The draft JSON is ready to save.`);
  };

  const pickerApi = () => (window as unknown as {
    showOpenFilePicker?: (options: { multiple: boolean; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<LocalFileHandle[]>;
  }).showOpenFilePicker;

  const openLocalFile = async () => {
    const picker = pickerApi();
    if (!picker) {
      setStatus('Direct file editing is not supported in this browser. Use Download questions.json instead.');
      return;
    }
    try {
      const [handle] = await picker.call(window, { multiple: false, types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }] });
      const file = await handle.getFile();
      const parsed = JSON.parse(await file.text()) as Question[];
      if (!Array.isArray(parsed) || !parsed.length) throw new Error('The selected file is not a question array.');
      fileHandle.current = handle;
      setQuestions(parsed.map(cloneQuestion).sort((a, b) => a.number - b.number));
      setMode('edit');
      setEditingId(parsed[0].id);
      setDraft(cloneQuestion(parsed[0]));
      setDirty(false);
      setErrors([]);
      setStatus(`Opened ${handle.name}. Changes can now be saved directly to this file.`);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setStatus((error as Error).message || 'The file could not be opened.');
    }
  };

  const importJsonFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!Array.isArray(parsed) || !parsed.length) throw new Error('Upload a non-empty questions.json array.');
      const imported = parsed as Question[];
      const ids = new Set<string>();
      const numbers = new Set<number>();
      const importErrors: string[] = [];
      imported.forEach((question, index) => {
        const label = `Item ${index + 1}`;
        if (!question || typeof question !== 'object') {
          importErrors.push(`${label} is not a question object.`);
          return;
        }
        if (typeof question.id !== 'string' || typeof question.number !== 'number' || typeof question.kicker !== 'string' || typeof question.prompt !== 'string' || !Array.isArray(question.feedback) || !Array.isArray(question.sources)) {
          importErrors.push(`${label} is missing one or more common fields: id, number, kicker, prompt, feedback or sources.`);
          return;
        }
        if (!QUESTION_TYPES.some((type) => type.value === question.type)) importErrors.push(`${label} has unsupported type “${String(question.type)}”.`);
        if (ids.has(question.id)) importErrors.push(`${label} repeats ID “${question.id}”.`);
        if (numbers.has(question.number)) importErrors.push(`${label} repeats question number ${question.number}.`);
        ids.add(question.id);
        numbers.add(question.number);
        validateQuestion(question, imported, question.id).forEach((error) => importErrors.push(`${label} (${question.id || 'no ID'}): ${error}`));
      });
      if (importErrors.length) {
        setErrors(importErrors.slice(0, 30));
        setStatus(`Import rejected: ${importErrors.length} validation issue${importErrors.length === 1 ? '' : 's'} found.`);
        return;
      }
      const normalized = imported.map(normalizeQuestion).sort((a, b) => a.number - b.number);
      setQuestions(normalized);
      setMode('edit');
      setEditingId(normalized[0].id);
      setDraft(cloneQuestion(normalized[0]));
      fileHandle.current = null;
      setDirty(true);
      setErrors([]);
      setStatus(`Imported all ${normalized.length} questions from ${file.name}. Review them, then save or download the complete JSON.`);
    } catch (error) {
      setErrors([]);
      setStatus((error as Error).message || 'The uploaded JSON file could not be read.');
    } finally {
      if (uploadInput.current) uploadInput.current.value = '';
    }
  };

  const saveLocalFile = async () => {
    if (!fileHandle.current) {
      setStatus('Open your local questions.json first, or use Download questions.json.');
      return;
    }
    try {
      const writable = await fileHandle.current.createWritable();
      await writable.write(jsonText);
      await writable.close();
      setDirty(false);
      setStatus(`Saved ${fileHandle.current.name} successfully.`);
    } catch (error) {
      setStatus((error as Error).message || 'The file could not be saved.');
    }
  };

  const downloadJson = () => {
    const url = URL.createObjectURL(new Blob([jsonText], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'questions.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus('Downloaded questions.json. Replace the project file with this version before publishing.');
  };

  const copyJson = async () => {
    await navigator.clipboard.writeText(jsonText);
    setStatus('Copied the complete questions JSON to the clipboard.');
  };

  const resetBuiltIn = () => {
    const reset = builtIn.map(cloneQuestion);
    setQuestions(reset);
    setMode('edit');
    setEditingId(reset[0]?.id ?? null);
    if (reset[0]) setDraft(cloneQuestion(reset[0]));
    fileHandle.current = null;
    setDirty(false);
    setErrors([]);
    setStatus('Reloaded the built-in question bank.');
  };

  const updateSource = (index: number, patch: Partial<QuestionSource>) => {
    patchDraft({ sources: draft.sources.map((source, sourceIndex) => sourceIndex === index ? { ...source, ...patch } : source) });
  };

  return (
    <main className="question-editor-shell">
      <header className="editor-header">
        <div><p>PRIVATE CONTENT TOOL</p><h1>QUESTION JSON EDITOR</h1><span>Unlinked from the game. Nothing changes until you save or download the complete JSON file.</span></div>
        <div className="editor-file-actions">
          <input ref={uploadInput} className="editor-hidden-input" type="file" accept=".json,application/json" onChange={(event) => void importJsonFile(event.target.files?.[0])} />
          <button type="button" onClick={() => uploadInput.current?.click()}>UPLOAD WHOLE questions.json</button>
          <button type="button" onClick={openLocalFile}>OPEN LOCAL questions.json</button>
          <button type="button" onClick={saveLocalFile}>SAVE TO OPEN FILE</button>
          <button type="button" onClick={downloadJson}>DOWNLOAD questions.json</button>
          <button type="button" onClick={copyJson}>COPY JSON</button>
          <a href="/executive-metrics-editor">OPEN EXECUTIVE METRICS EDITOR</a>
          <a href="/content-guides/ai-content-guide.md" download>DOWNLOAD AI CONTENT GUIDE</a>
          <button type="button" className="editor-quiet" onClick={resetBuiltIn}>RESET TO BUILT-IN</button>
        </div>
      </header>

      <div className="editor-status" role="status">{dirty && <strong>UNSAVED DRAFT • </strong>}{status}</div>

      <div className="editor-layout">
        <aside className="editor-sidebar">
          <div className="editor-mode-tabs">
            <button type="button" className={mode === 'add' ? 'active' : ''} onClick={() => chooseMode('add')}>＋ ADD NEW</button>
            <button type="button" className={mode === 'edit' ? 'active' : ''} onClick={() => chooseMode('edit')}>✎ EDIT EXISTING</button>
          </div>
          {mode === 'edit' && <label className="editor-select-label"><span>SELECT QUESTION</span><select value={editingId ?? ''} onChange={(event) => selectQuestion(event.target.value)}>{questions.map((question) => <option key={question.id} value={question.id}>Q{question.number} · {question.type} · {question.id}</option>)}</select></label>}
          <div className="editor-type-list">
            <strong>SUPPORTED TYPES</strong>
            {QUESTION_TYPES.map((item) => <button type="button" key={item.value} className={draft.type === item.value ? 'active' : ''} onClick={() => changeType(item.value)}><span>{item.label}</span><small>{item.help}</small></button>)}
          </div>
        </aside>

        <section className="editor-form-card">
          <div className="editor-form-title"><div><p>{mode === 'add' ? 'NEW QUESTION' : `EDITING ${editingId}`}</p><h2>{typeInfo.label}</h2></div><span>{typeInfo.help}</span></div>

          {errors.length > 0 && <div className="editor-errors" role="alert"><strong>FIX THESE ITEMS</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}

          <div className="editor-grid">
            <label className="editor-field"><span>Question ID</span><small>Lowercase words joined with hyphens.</small><input value={draft.id} onChange={(event) => patchDraft({ id: event.target.value })} /></label>
            <label className="editor-field"><span>Question number</span><small>Core positions are 1–47.</small><input type="number" min={1} max={47} value={draft.number} onChange={(event) => patchDraft({ number: Number(event.target.value) })} /></label>
            <label className="editor-field editor-span"><span>Kicker</span><small>Small heading above the question.</small><input value={draft.kicker} onChange={(event) => patchDraft({ kicker: event.target.value })} /></label>
            <label className="editor-field editor-span"><span>Prompt</span><small>The question or instruction shown to the player.</small><textarea rows={3} value={draft.prompt} onChange={(event) => patchDraft({ prompt: event.target.value })} /></label>

            {CHOICE_TYPES.has(draft.type) && <>
              <LinesField label="Answer choices" hint="One answer per line. The first line is index 0." value={draft.choices} onChange={(choices) => patchDraft({ choices })} />
              <LinesField label="Answer feedback" hint="One line per answer, in the same order." value={draft.feedback} onChange={(feedback) => patchDraft({ feedback })} />
              <label className="editor-field"><span>Correct answer index</span><small>{draft.type === 'final' ? 'Final questions must be -1.' : 'First answer is 0, second is 1, and so on.'}</small><input type="number" min={draft.type === 'final' ? -1 : 0} value={draft.correctIndex ?? 0} disabled={draft.type === 'final'} onChange={(event) => patchDraft({ correctIndex: Number(event.target.value) })} /></label>
            </>}

            {draft.type === 'standard' && <label className="editor-check editor-span"><input type="checkbox" checked={Boolean(draft.grantSkip)} onChange={(event) => patchDraft({ grantSkip: event.target.checked })} /><span>A correct answer grants one Skip</span></label>}
            {draft.type === 'live' && <label className="editor-field editor-span"><span>Executive metric</span><small>The current value replaces the answer at the correct-answer index. Edit values on the Executive Metrics Editor page.</small><select value={draft.metricKey ?? ''} onChange={(event) => patchDraft({ metricKey: event.target.value })}><option value="">Select a metric…</option>{METRIC_OPTIONS.map((metric) => <option key={metric.value} value={metric.value}>{metric.label} · current value {metric.current}</option>)}</select></label>}
            {draft.type === 'injunction' && <LinesField label="Rewritten choices" hint="One replacement per original answer, in the same order." value={draft.rewrittenChoices} onChange={(rewrittenChoices) => patchDraft({ rewrittenChoices })} />}
            {draft.type === 'taco' && <>
              <label className="editor-field"><span>Trap answer index</span><input type="number" min={0} value={draft.trapIndex ?? 1} onChange={(event) => patchDraft({ trapIndex: Number(event.target.value) })} /></label>
              <label className="editor-field"><span>Questions sent backwards</span><input type="number" min={1} value={draft.backtrackBy ?? 5} onChange={(event) => patchDraft({ backtrackBy: Number(event.target.value) })} /></label>
            </>}
            {draft.type === 'hotspot' && <>
              <label className="editor-field"><span>Timer seconds</span><input type="number" min={1} value={draft.timerSeconds ?? 15} onChange={(event) => patchDraft({ timerSeconds: Number(event.target.value) })} /></label>
              {(['xPct', 'yPct', 'widthPct', 'heightPct'] as const).map((key) => <label className="editor-field" key={key}><span>Hotspot {key}</span><input type="number" min={0} max={100} step="0.1" value={draft.hotspot?.[key] ?? 0} onChange={(event) => patchDraft({ hotspot: { ...(draft.hotspot ?? { xPct: 0, yPct: 0, widthPct: 8, heightPct: 10 }), [key]: Number(event.target.value) } })} /></label>)}
              <label className="editor-field"><span>Misses before life loss</span><input type="number" min={1} value={draft.missRules?.clicksBeforeLifeLoss ?? 3} onChange={(event) => patchDraft({ missRules: { ...(draft.missRules ?? { clicksBeforeLifeLoss: 3, maxLivesLost: 1 }), clicksBeforeLifeLoss: Number(event.target.value) } })} /></label>
              <label className="editor-field"><span>Maximum lives lost here</span><input type="number" min={0} max={3} value={draft.missRules?.maxLivesLost ?? 1} onChange={(event) => patchDraft({ missRules: { ...(draft.missRules ?? { clicksBeforeLifeLoss: 3, maxLivesLost: 1 }), maxLivesLost: Number(event.target.value) } })} /></label>
              <LinesField label="Miss feedback" hint="Usually one line for the hotspot miss reaction." value={draft.feedback} onChange={(feedback) => patchDraft({ feedback })} />
            </>}
            {draft.type === 'bing' && <>
              <label className="editor-field"><span>Timer seconds</span><input type="number" min={1} value={draft.timerSeconds ?? 20} onChange={(event) => patchDraft({ timerSeconds: Number(event.target.value) })} /></label>
              <label className="editor-field editor-span"><span>Click audio path</span><input value={draft.audio?.onTargetClick ?? ''} onChange={(event) => patchDraft({ audio: { ...(draft.audio ?? {}), onTargetClick: event.target.value } })} /></label>
              <label className="editor-field"><span>Audio volume</span><input type="number" min={0} max={1} step="0.05" value={draft.audio?.volume ?? 1} onChange={(event) => patchDraft({ audio: { ...(draft.audio ?? {}), volume: Number(event.target.value) } })} /></label>
            </>}
            {draft.type === 'golf' && <label className="editor-field"><span>Target power</span><small>1–100.</small><input type="number" min={1} max={100} value={draft.golfTargetPower ?? 70} onChange={(event) => patchDraft({ golfTargetPower: Number(event.target.value) })} /></label>}
          </div>

          <section className="editor-sources">
            <div className="editor-section-heading"><div><h3>SOURCES AND PROVENANCE</h3><p>Factual questions need verified links. Pure jokes should be labelled original satire.</p></div><button type="button" onClick={() => patchDraft({ sources: [...draft.sources, { kind: 'reference', title: '' }] })}>＋ ADD SOURCE</button></div>
            {draft.sources.map((source, index) => <div className="editor-source-card" key={`${index}-${source.kind}`}>
              <div className="editor-source-number">SOURCE {index + 1}</div>
              <label className="editor-field"><span>Kind</span><select value={source.kind} onChange={(event) => updateSource(index, { kind: event.target.value as SourceKind })}><option value="official">Official</option><option value="reference">Reference</option><option value="internal">Internal data</option><option value="original_satire">Original satire</option><option value="user_supplied_asset">User-supplied asset</option></select></label>
              <label className="editor-field"><span>Title</span><input value={source.title} onChange={(event) => updateSource(index, { title: event.target.value })} /></label>
              <label className="editor-field"><span>Publisher</span><input value={source.publisher ?? ''} onChange={(event) => updateSource(index, { publisher: event.target.value })} /></label>
              {['official', 'reference'].includes(source.kind) && <label className="editor-field editor-span"><span>URL</span><input type="url" placeholder="https://…" value={source.url ?? ''} onChange={(event) => updateSource(index, { url: event.target.value })} /></label>}
              {['internal', 'user_supplied_asset'].includes(source.kind) && <label className="editor-field editor-span"><span>Project path</span><input placeholder="content/file.json or public/assets/…" value={source.path ?? ''} onChange={(event) => updateSource(index, { path: event.target.value })} /></label>}
              <label className="editor-field"><span>Accessed on</span><input type="date" value={source.accessedOn ?? ''} onChange={(event) => updateSource(index, { accessedOn: event.target.value })} /></label>
              <label className="editor-field editor-span"><span>Source note</span><textarea rows={2} value={source.note ?? ''} onChange={(event) => updateSource(index, { note: event.target.value })} /></label>
              {draft.sources.length > 1 && <button className="editor-remove" type="button" onClick={() => patchDraft({ sources: draft.sources.filter((_, sourceIndex) => sourceIndex !== index) })}>REMOVE SOURCE</button>}
            </div>)}
          </section>

          <div className="editor-apply-row"><button type="button" onClick={applyDraft}>{mode === 'add' ? 'ADD QUESTION TO JSON DRAFT' : 'UPDATE QUESTION IN JSON DRAFT'}</button><span>{questions.length} questions currently in the draft</span></div>
          <details className="editor-json-preview"><summary>Preview complete JSON</summary><pre>{jsonText}</pre></details>
        </section>
      </div>
    </main>
  );
}
