'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import jokesData from '@/content/jokes.json';

type JokesFile = {
  tickerHeadlines: string[];
  recoveryMessages: string[];
  shareTemplates: { default: string[]; early: string[]; late: string[] };
  labels: { testMode: string; testButton: string; rotatingPrefix: string };
};

type WritableFile = { write: (data: string) => Promise<void>; close: () => Promise<void> };
type LocalFileHandle = { name: string; getFile: () => Promise<File>; createWritable: () => Promise<WritableFile> };

const clone = (value: JokesFile) => JSON.parse(JSON.stringify(value)) as JokesFile;
const cleanLines = (lines: string[]) => lines.map((line) => line.trim()).filter(Boolean);
const templateArray = (value: unknown) => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim());
  if (typeof value === 'string') return [value.trim(), value.trim(), value.trim()];
  return [];
};

function validate(value: unknown): { value?: JokesFile; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { errors: ['The JSON root must be an object.'] };
  const item = value as Partial<JokesFile>;
  if (!Array.isArray(item.tickerHeadlines) || !item.tickerHeadlines.every((line) => typeof line === 'string')) errors.push('tickerHeadlines must be an array of text strings.');
  if (!Array.isArray(item.recoveryMessages) || !item.recoveryMessages.every((line) => typeof line === 'string')) errors.push('recoveryMessages must be an array of text strings.');
  if (!item.shareTemplates || typeof item.shareTemplates !== 'object') errors.push('shareTemplates must be an object.');
  if (!item.labels || typeof item.labels !== 'object') errors.push('labels must be an object.');
  if (errors.length) return { errors };
  const normalized: JokesFile = {
    tickerHeadlines: cleanLines(item.tickerHeadlines as string[]),
    recoveryMessages: cleanLines(item.recoveryMessages as string[]),
    shareTemplates: {
      default: templateArray(item.shareTemplates?.default),
      early: templateArray(item.shareTemplates?.early),
      late: templateArray(item.shareTemplates?.late),
    },
    labels: {
      testMode: String(item.labels?.testMode ?? '').trim(),
      testButton: String(item.labels?.testButton ?? '').trim(),
      rotatingPrefix: String(item.labels?.rotatingPrefix ?? '').trim(),
    },
  };
  if (!normalized.tickerHeadlines.length) errors.push('Add at least one ticker headline.');
  if (!normalized.recoveryMessages.length) errors.push('Add at least one recovery message.');
  Object.entries(normalized.shareTemplates).forEach(([key, templates]) => {
    if (templates.length !== 3) errors.push(`shareTemplates.${key} must contain exactly three variations.`);
    templates.forEach((text, index) => { if (!text) errors.push(`shareTemplates.${key} variation ${index + 1} cannot be empty.`); });
  });
  Object.entries(normalized.labels).forEach(([key, text]) => { if (!text) errors.push(`labels.${key} cannot be empty.`); });
  const tokens: Record<keyof JokesFile['shareTemplates'], string[]> = {
    default: ['{question}', '{failureType}', '{bingScore}'],
    early: ['{question}', '{bingScore}'],
    late: ['{question}', '{failureType}'],
  };
  Object.entries(tokens).forEach(([key, required]) => normalized.shareTemplates[key as keyof JokesFile['shareTemplates']].forEach((text, index) => required.forEach((token) => {
    if (!text.includes(token)) errors.push(`shareTemplates.${key} variation ${index + 1} must include ${token}.`);
  })));
  return errors.length ? { errors } : { value: normalized, errors };
}

function LinesField({ label, hint, value, onChange }: { label: string; hint: string; value: string[]; onChange: (value: string[]) => void }) {
  return <label className="editor-field editor-span"><span>{label}</span><small>{hint}</small><textarea rows={7} value={value.join('\n')} onChange={(event) => onChange(event.target.value.split('\n'))} /></label>;
}

export default function JokesEditor() {
  const builtIn = jokesData as JokesFile;
  const [draft, setDraft] = useState<JokesFile>(() => clone(builtIn));
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState('Loaded the built-in jokes and interface wording.');
  const [dirty, setDirty] = useState(false);
  const fileHandle = useRef<LocalFileHandle | null>(null);
  const uploadInput = useRef<HTMLInputElement | null>(null);
  const jsonText = useMemo(() => `${JSON.stringify(draft, null, 2)}\n`, [draft]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (next: JokesFile) => { setDraft(next); setDirty(true); setErrors([]); };
  const check = () => {
    const result = validate(draft);
    setErrors(result.errors);
    if (result.value) {
      setDraft(result.value);
      setStatus('Validation passed. The complete jokes.json draft is ready to save or download.');
    } else setStatus(`Fix ${result.errors.length} validation issue${result.errors.length === 1 ? '' : 's'} before saving.`);
    return result.value;
  };
  const pickerApi = () => (window as unknown as { showOpenFilePicker?: (options: object) => Promise<LocalFileHandle[]> }).showOpenFilePicker;

  const loadText = (text: string, name: string, handle: LocalFileHandle | null) => {
    const result = validate(JSON.parse(text) as unknown);
    if (!result.value) { setErrors(result.errors); setStatus(`Import rejected: ${result.errors.length} validation issue${result.errors.length === 1 ? '' : 's'} found.`); return; }
    setDraft(result.value); fileHandle.current = handle; setDirty(handle === null); setErrors([]);
    setStatus(handle ? `Opened ${name}. Changes can now be saved directly to this file.` : `Imported ${name}. Review it, then save or download the complete JSON.`);
  };
  const openLocalFile = async () => {
    const picker = pickerApi();
    if (!picker) { setStatus('Direct file editing is not supported in this browser. Use Upload or Download instead.'); return; }
    try {
      const [handle] = await picker.call(window, { multiple: false, types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }] });
      const file = await handle.getFile(); loadText(await file.text(), handle.name, handle);
    } catch (error) { if ((error as Error).name !== 'AbortError') setStatus((error as Error).message || 'The file could not be opened.'); }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try { loadText(await file.text(), file.name, null); } catch (error) { setErrors([]); setStatus((error as Error).message || 'The uploaded JSON could not be read.'); }
    finally { if (uploadInput.current) uploadInput.current.value = ''; }
  };
  const saveLocalFile = async () => {
    const valid = check();
    if (!valid) return;
    if (!fileHandle.current) { setStatus('Open your local jokes.json first, or use Download jokes.json.'); return; }
    try { const writable = await fileHandle.current.createWritable(); await writable.write(`${JSON.stringify(valid, null, 2)}\n`); await writable.close(); setDirty(false); setStatus(`Saved ${fileHandle.current.name} successfully.`); }
    catch (error) { setStatus((error as Error).message || 'The file could not be saved.'); }
  };
  const download = () => {
    const valid = check(); if (!valid) return;
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(valid, null, 2)}\n`], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'jokes.json'; anchor.click(); URL.revokeObjectURL(url);
    setStatus('Downloaded jokes.json. Replace the project file with this version before publishing.');
  };
  const copy = async () => { const valid = check(); if (!valid) return; await navigator.clipboard.writeText(`${JSON.stringify(valid, null, 2)}\n`); setStatus('Copied the complete jokes JSON to the clipboard.'); };
  const reset = () => { setDraft(clone(builtIn)); fileHandle.current = null; setDirty(false); setErrors([]); setStatus('Reloaded the built-in jokes and interface wording.'); };
  const updateShareTemplate = (category: keyof JokesFile['shareTemplates'], index: number, value: string) => {
    const templates = [...draft.shareTemplates[category]];
    templates[index] = value;
    update({ ...draft, shareTemplates: { ...draft.shareTemplates, [category]: templates } });
  };

  return <main className="question-editor-shell">
    <header className="editor-header">
      <div><p>PRIVATE CONTENT TOOL</p><h1>JOKES JSON EDITOR</h1><span>Unlinked from the game. Nothing changes until you save or download the complete JSON file.</span></div>
      <div className="editor-file-actions">
        <input ref={uploadInput} className="editor-hidden-input" type="file" accept=".json,application/json" onChange={(event) => void importFile(event.target.files?.[0])} />
        <button type="button" onClick={() => uploadInput.current?.click()}>UPLOAD WHOLE jokes.json</button>
        <button type="button" onClick={openLocalFile}>OPEN LOCAL jokes.json</button>
        <button type="button" onClick={saveLocalFile}>SAVE TO OPEN FILE</button>
        <button type="button" onClick={download}>DOWNLOAD jokes.json</button>
        <button type="button" onClick={() => void copy()}>COPY JSON</button>
        <a href="/content-guides/ai-content-guide.md" download>DOWNLOAD AI CONTENT GUIDE</a>
        <button type="button" className="editor-quiet" onClick={reset}>RESET TO BUILT-IN</button>
      </div>
    </header>
    <div className="editor-status" role="status">{dirty && <strong>UNSAVED DRAFT • </strong>}{status}</div>
    <div className="editor-single-layout">
      <section className="editor-form-card">
        <div className="editor-form-title"><div><p>COMPLETE FILE</p><h2>TICKER, RECOVERY &amp; SHARING WORDS</h2></div><span>Edit every game joke and label here. Share placeholders in braces are validated so scores and question numbers still appear.</span></div>
        {errors.length > 0 && <div className="editor-errors"><strong>PLEASE FIX:</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
        <div className="editor-grid">
          <LinesField label="Ticker headlines" hint="One headline per line. Blank lines are removed when validated." value={draft.tickerHeadlines} onChange={(tickerHeadlines) => update({ ...draft, tickerHeadlines })} />
          <LinesField label="Recovery messages" hint="One message per line." value={draft.recoveryMessages} onChange={(recoveryMessages) => update({ ...draft, recoveryMessages })} />
          <h3 className="editor-subheading editor-span">SOCIAL SHARE TEMPLATES</h3>
          <div className="editor-share-group editor-span"><h4>DEFAULT RESULT</h4><p>Each variation must include {'{question}'}, {'{failureType}'} and {'{bingScore}'}.</p>{draft.shareTemplates.default.map((template, index) => <label className="editor-field" key={`default-${index}`}><span>Default variation {index + 1}</span><textarea rows={3} value={template} onChange={(event) => updateShareTemplate('default', index, event.target.value)} /></label>)}</div>
          <div className="editor-share-group editor-span"><h4>EARLY EXIT</h4><p>Each variation must include {'{question}'} and {'{bingScore}'}.</p>{draft.shareTemplates.early.map((template, index) => <label className="editor-field" key={`early-${index}`}><span>Early variation {index + 1}</span><textarea rows={3} value={template} onChange={(event) => updateShareTemplate('early', index, event.target.value)} /></label>)}</div>
          <div className="editor-share-group editor-span"><h4>LATE EXIT</h4><p>Each variation must include {'{question}'} and {'{failureType}'}.</p>{draft.shareTemplates.late.map((template, index) => <label className="editor-field" key={`late-${index}`}><span>Late variation {index + 1}</span><textarea rows={3} value={template} onChange={(event) => updateShareTemplate('late', index, event.target.value)} /></label>)}</div>
          <h3 className="editor-subheading editor-span">INTERFACE LABELS</h3>
          <label className="editor-field"><span>Test mode label</span><input value={draft.labels.testMode} onChange={(event) => update({ ...draft, labels: { ...draft.labels, testMode: event.target.value } })} /></label>
          <label className="editor-field"><span>Test button label</span><input value={draft.labels.testButton} onChange={(event) => update({ ...draft, labels: { ...draft.labels, testButton: event.target.value } })} /></label>
          <label className="editor-field editor-span"><span>Rotating order prefix</span><input value={draft.labels.rotatingPrefix} onChange={(event) => update({ ...draft, labels: { ...draft.labels, rotatingPrefix: event.target.value } })} /></label>
        </div>
        <div className="editor-apply-row"><button type="button" onClick={check}>VALIDATE COMPLETE JSON</button><span>{draft.tickerHeadlines.length} ticker lines · {draft.recoveryMessages.length} recovery lines</span></div>
        <details className="editor-json-preview"><summary>Preview complete JSON</summary><pre>{jsonText}</pre></details>
      </section>
    </div>
  </main>;
}
