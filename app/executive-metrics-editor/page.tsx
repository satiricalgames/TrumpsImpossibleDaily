'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import metricsData from '@/content/executive_metrics.json';

type MetricsFile = {
  activeInjunctions: number;
  golfCounter: number;
  latestExecutiveOrder: { label: string; date: string; value: number };
  tickerHeadline: string;
  simulatedPoll: number;
  lastUpdated: string;
};
type WritableFile = { write: (data: string) => Promise<void>; close: () => Promise<void> };
type LocalFileHandle = { name: string; getFile: () => Promise<File>; createWritable: () => Promise<WritableFile> };

const clone = (value: MetricsFile) => JSON.parse(JSON.stringify(value)) as MetricsFile;
const isWholeNumber = (value: number) => Number.isInteger(value) && value >= 0;

function validate(value: unknown): { value?: MetricsFile; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { errors: ['The JSON root must be an object.'] };
  const item = value as Partial<MetricsFile>;
  if (!isWholeNumber(Number(item.activeInjunctions))) errors.push('activeInjunctions must be a whole number of 0 or higher.');
  if (!isWholeNumber(Number(item.golfCounter))) errors.push('golfCounter must be a whole number of 0 or higher.');
  if (!Number.isInteger(Number(item.simulatedPoll)) || Number(item.simulatedPoll) < 0 || Number(item.simulatedPoll) > 100) errors.push('simulatedPoll must be a whole percentage from 0 to 100.');
  if (!item.latestExecutiveOrder || typeof item.latestExecutiveOrder !== 'object') errors.push('latestExecutiveOrder must be an object.');
  if (!String(item.latestExecutiveOrder?.label ?? '').trim()) errors.push('latestExecutiveOrder.label is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(item.latestExecutiveOrder?.date ?? ''))) errors.push('latestExecutiveOrder.date must use YYYY-MM-DD.');
  if (!isWholeNumber(Number(item.latestExecutiveOrder?.value))) errors.push('latestExecutiveOrder.value must be a whole number of 0 or higher.');
  if (!String(item.tickerHeadline ?? '').trim()) errors.push('tickerHeadline is required.');
  if (!String(item.lastUpdated ?? '').trim() || Number.isNaN(Date.parse(String(item.lastUpdated)))) errors.push('lastUpdated must be a valid ISO date and time.');
  if (errors.length) return { errors };
  return { errors, value: {
    activeInjunctions: Number(item.activeInjunctions),
    golfCounter: Number(item.golfCounter),
    latestExecutiveOrder: { label: String(item.latestExecutiveOrder?.label).trim(), date: String(item.latestExecutiveOrder?.date), value: Number(item.latestExecutiveOrder?.value) },
    tickerHeadline: String(item.tickerHeadline).trim(),
    simulatedPoll: Number(item.simulatedPoll),
    lastUpdated: String(item.lastUpdated).trim(),
  } };
}

export default function ExecutiveMetricsEditor() {
  const builtIn = metricsData as MetricsFile;
  const [draft, setDraft] = useState<MetricsFile>(() => clone(builtIn));
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState('Loaded the built-in executive metrics.');
  const [dirty, setDirty] = useState(false);
  const fileHandle = useRef<LocalFileHandle | null>(null);
  const uploadInput = useRef<HTMLInputElement | null>(null);
  const jsonText = useMemo(() => `${JSON.stringify(draft, null, 2)}\n`, [draft]);

  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  const update = (patch: Partial<MetricsFile>) => { setDraft((current) => ({ ...current, ...patch })); setDirty(true); setErrors([]); };
  const updateOrder = (patch: Partial<MetricsFile['latestExecutiveOrder']>) => { setDraft((current) => ({ ...current, latestExecutiveOrder: { ...current.latestExecutiveOrder, ...patch } })); setDirty(true); setErrors([]); };
  const checkedText = () => {
    const result = validate(draft); setErrors(result.errors);
    if (!result.value) { setStatus(`Fix ${result.errors.length} validation issue${result.errors.length === 1 ? '' : 's'} before saving.`); return null; }
    setDraft(result.value); setStatus('Validation passed. The complete executive_metrics.json draft is ready.'); return `${JSON.stringify(result.value, null, 2)}\n`;
  };
  const pickerApi = () => (window as unknown as { showOpenFilePicker?: (options: object) => Promise<LocalFileHandle[]> }).showOpenFilePicker;
  const loadText = (text: string, name: string, handle: LocalFileHandle | null) => {
    const result = validate(JSON.parse(text) as unknown);
    if (!result.value) { setErrors(result.errors); setStatus(`Import rejected: ${result.errors.length} validation issue${result.errors.length === 1 ? '' : 's'} found.`); return; }
    setDraft(result.value); fileHandle.current = handle; setDirty(handle === null); setErrors([]); setStatus(handle ? `Opened ${name}. Changes can now be saved directly to this file.` : `Imported ${name}. Review it, then save or download the complete JSON.`);
  };
  const openLocalFile = async () => {
    const picker = pickerApi(); if (!picker) { setStatus('Direct file editing is not supported in this browser. Use Upload or Download instead.'); return; }
    try { const [handle] = await picker.call(window, { multiple: false, types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }] }); const file = await handle.getFile(); loadText(await file.text(), handle.name, handle); }
    catch (error) { if ((error as Error).name !== 'AbortError') setStatus((error as Error).message || 'The file could not be opened.'); }
  };
  const importFile = async (file?: File) => { if (!file) return; try { loadText(await file.text(), file.name, null); } catch (error) { setErrors([]); setStatus((error as Error).message || 'The uploaded JSON could not be read.'); } finally { if (uploadInput.current) uploadInput.current.value = ''; } };
  const save = async () => { const text = checkedText(); if (!text) return; if (!fileHandle.current) { setStatus('Open your local executive_metrics.json first, or use Download.'); return; } try { const writable = await fileHandle.current.createWritable(); await writable.write(text); await writable.close(); setDirty(false); setStatus(`Saved ${fileHandle.current.name} successfully.`); } catch (error) { setStatus((error as Error).message || 'The file could not be saved.'); } };
  const download = () => { const text = checkedText(); if (!text) return; const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'executive_metrics.json'; anchor.click(); URL.revokeObjectURL(url); setStatus('Downloaded executive_metrics.json. Replace the project file before publishing.'); };
  const copy = async () => { const text = checkedText(); if (!text) return; await navigator.clipboard.writeText(text); setStatus('Copied the complete executive metrics JSON to the clipboard.'); };
  const reset = () => { setDraft(clone(builtIn)); fileHandle.current = null; setDirty(false); setErrors([]); setStatus('Reloaded the built-in executive metrics.'); };

  return <main className="question-editor-shell">
    <header className="editor-header"><div><p>PRIVATE CONTENT TOOL</p><h1>EXECUTIVE METRICS EDITOR</h1><span>Unlinked from the game. These shared values feed questions that select a matching metric key.</span></div><div className="editor-file-actions">
      <input ref={uploadInput} className="editor-hidden-input" type="file" accept=".json,application/json" onChange={(event) => void importFile(event.target.files?.[0])} />
      <button type="button" onClick={() => uploadInput.current?.click()}>UPLOAD WHOLE executive_metrics.json</button><button type="button" onClick={openLocalFile}>OPEN LOCAL FILE</button><button type="button" onClick={() => void save()}>SAVE TO OPEN FILE</button><button type="button" onClick={download}>DOWNLOAD JSON</button><button type="button" onClick={() => void copy()}>COPY JSON</button><a href="/question-editor">OPEN QUESTION EDITOR</a><a href="/content-guides/ai-content-guide.md" download>DOWNLOAD AI CONTENT GUIDE</a><button type="button" className="editor-quiet" onClick={reset}>RESET TO BUILT-IN</button>
    </div></header>
    <div className="editor-status" role="status">{dirty && <strong>UNSAVED DRAFT • </strong>}{status}</div>
    <div className="editor-single-layout"><section className="editor-form-card">
      <div className="editor-form-title"><div><p>SHARED ANSWER BANK</p><h2>LIVE QUESTION METRICS</h2></div><span>Update reusable numeric answers here. A live question chooses one with its metricKey field and shows it in the correct answer position.</span></div>
      <div className="editor-notice"><strong>SOURCE REMINDER</strong><span>These are configurable values. If a value represents a real-world fact, add the direct verified source to every question that uses it in the Question Editor.</span></div>
      {errors.length > 0 && <div className="editor-errors" role="alert"><strong>PLEASE FIX:</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
      <div className="editor-grid">
        <label className="editor-field"><span>Active injunctions</span><small>Metric key: activeInjunctions</small><input type="number" min={0} step={1} value={draft.activeInjunctions} onChange={(event) => update({ activeInjunctions: Number(event.target.value) })} /></label>
        <label className="editor-field"><span>Golf counter</span><small>Metric key: golfCounter</small><input type="number" min={0} step={1} value={draft.golfCounter} onChange={(event) => update({ golfCounter: Number(event.target.value) })} /></label>
        <label className="editor-field"><span>Simulated poll</span><small>Metric key: simulatedPoll · percentage from 0 to 100</small><input type="number" min={0} max={100} step={1} value={draft.simulatedPoll} onChange={(event) => update({ simulatedPoll: Number(event.target.value) })} /></label>
        <label className="editor-field"><span>Last updated</span><small>ISO date and time, including time zone.</small><input value={draft.lastUpdated} onChange={(event) => update({ lastUpdated: event.target.value })} /></label>
        <h3 className="editor-subheading editor-span">LATEST EXECUTIVE ORDER</h3>
        <label className="editor-field editor-span"><span>Label</span><input value={draft.latestExecutiveOrder.label} onChange={(event) => updateOrder({ label: event.target.value })} /></label>
        <label className="editor-field"><span>Date</span><small>YYYY-MM-DD</small><input type="date" value={draft.latestExecutiveOrder.date} onChange={(event) => updateOrder({ date: event.target.value })} /></label>
        <label className="editor-field"><span>Numeric value</span><small>Metric key: latestExecutiveOrder.value</small><input type="number" min={0} step={1} value={draft.latestExecutiveOrder.value} onChange={(event) => updateOrder({ value: Number(event.target.value) })} /></label>
        <h3 className="editor-subheading editor-span">FALLBACK TICKER</h3>
        <label className="editor-field editor-span"><span>Ticker headline</span><small>Used only when jokes.json does not provide a ticker headline.</small><textarea rows={3} value={draft.tickerHeadline} onChange={(event) => update({ tickerHeadline: event.target.value })} /></label>
      </div>
      <div className="editor-apply-row"><button type="button" onClick={checkedText}>VALIDATE COMPLETE JSON</button><span>4 selectable numeric metric keys</span></div>
      <details className="editor-json-preview"><summary>Preview complete JSON</summary><pre>{jsonText}</pre></details>
    </section></div>
  </main>;
}
