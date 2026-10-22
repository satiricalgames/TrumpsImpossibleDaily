'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import rotatingData from '@/content/rotating_orders.json';
import { publicPath } from '@/lib/public-path';

type SourceKind = 'reference' | 'official' | 'internal' | 'original_satire' | 'user_supplied_asset';
type OrderSource = { kind: SourceKind; title: string; publisher?: string; url?: string; path?: string; note?: string; accessedOn?: string };
type RotatingOrder = { id: string; enabled: boolean; number: number; type: 'standard'; kicker: string; prompt: string; choices: string[]; correctIndex: number; sources: OrderSource[]; feedback: string[] };
type OrdersFile = { enabled: boolean; activeOrderId: string; orders: RotatingOrder[] };
type WritableFile = { write: (data: string) => Promise<void>; close: () => Promise<void> };
type LocalFileHandle = { name: string; getFile: () => Promise<File>; createWritable: () => Promise<WritableFile> };

const cloneFile = (value: OrdersFile) => JSON.parse(JSON.stringify(value)) as OrdersFile;
const cloneOrder = (value: RotatingOrder) => JSON.parse(JSON.stringify(value)) as RotatingOrder;
const cleanLines = (lines: string[]) => lines.map((line) => line.trim()).filter(Boolean);

function nextNumber(orders: RotatingOrder[]) { return Math.max(100, ...orders.map((order) => Number(order.number) || 100)) + 1; }
function blankOrder(orders: RotatingOrder[]): RotatingOrder {
  const number = nextNumber(orders);
  return { id: `eo-new-order-${number}`, enabled: false, number, type: 'standard', kicker: 'ROTATING EXECUTIVE ORDER', prompt: '', choices: ['', '', '', ''], correctIndex: 0, sources: [{ kind: 'original_satire', title: 'Original game satire', note: 'Original parody premise; no external factual claim.' }], feedback: ['', '', '', ''] };
}
function normalizeOrder(order: RotatingOrder): RotatingOrder {
  return {
    ...cloneOrder(order), id: order.id.trim(), type: 'standard', kicker: order.kicker.trim(), prompt: order.prompt.trim(),
    choices: cleanLines(order.choices), feedback: cleanLines(order.feedback),
    sources: order.sources.map((source) => ({ kind: source.kind, title: source.title.trim(), ...(source.publisher?.trim() ? { publisher: source.publisher.trim() } : {}), ...(source.url?.trim() ? { url: source.url.trim() } : {}), ...(source.path?.trim() ? { path: source.path.trim() } : {}), ...(source.note?.trim() ? { note: source.note.trim() } : {}), ...(source.accessedOn?.trim() ? { accessedOn: source.accessedOn.trim() } : {}) })),
  };
}
function validateOrder(order: RotatingOrder, orders: RotatingOrder[], editingId: string | null) {
  const errors: string[] = [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(order.id)) errors.push('ID must use lowercase letters, numbers and single hyphens.');
  if (orders.some((item) => item.id === order.id && item.id !== editingId)) errors.push('Order ID is already in use.');
  if (!Number.isInteger(order.number) || order.number < 101) errors.push('Order number must be a whole number of 101 or higher.');
  if (orders.some((item) => item.number === order.number && item.id !== editingId)) errors.push('Order number is already in use.');
  if (order.type !== 'standard') errors.push('Rotating orders currently support only the standard question type.');
  if (!order.kicker.trim()) errors.push('Kicker is required.');
  if (!order.prompt.trim()) errors.push('Prompt is required.');
  const choices = cleanLines(order.choices); const feedback = cleanLines(order.feedback);
  if (choices.length < 2) errors.push('Add at least two answer choices.');
  if (feedback.length !== choices.length) errors.push('Provide one non-empty feedback line for every answer choice.');
  if (!Number.isInteger(order.correctIndex) || order.correctIndex < 0 || order.correctIndex >= choices.length) errors.push('Correct answer index is outside the answer list.');
  if (!Array.isArray(order.sources) || !order.sources.length) errors.push('Add at least one source or creative-provenance record.');
  (order.sources ?? []).forEach((source, index) => {
    if (!source.title?.trim()) errors.push(`Source ${index + 1} needs a title.`);
    if (['official', 'reference'].includes(source.kind) && !/^https?:\/\//.test(source.url ?? '')) errors.push(`Source ${index + 1} needs a complete http(s) URL.`);
    if (['internal', 'user_supplied_asset'].includes(source.kind) && !source.path?.trim()) errors.push(`Source ${index + 1} needs a file path.`);
  });
  return errors;
}
function validateFile(value: unknown): { value?: OrdersFile; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { errors: ['The JSON root must be an object.'] };
  const item = value as Partial<OrdersFile>;
  if (typeof item.enabled !== 'boolean') errors.push('enabled must be true or false.');
  if (typeof item.activeOrderId !== 'string') errors.push('activeOrderId must be text.');
  if (!Array.isArray(item.orders) || !item.orders.length) errors.push('orders must be a non-empty array.');
  if (errors.length) return { errors };
  const orders = item.orders as RotatingOrder[];
  orders.forEach((order, index) => {
    if (!order || typeof order !== 'object' || !Array.isArray(order.choices) || !Array.isArray(order.feedback) || !Array.isArray(order.sources)) errors.push(`Order ${index + 1} is missing choices, feedback or sources.`);
    else validateOrder(order, orders, order.id).forEach((error) => errors.push(`Order ${index + 1} (${order.id || 'no ID'}): ${error}`));
  });
  const activeOrderId = item.activeOrderId as string;
  if (!orders.some((order) => order.id === activeOrderId)) errors.push('activeOrderId must match an order ID.');
  return errors.length ? { errors } : { value: { enabled: item.enabled as boolean, activeOrderId, orders: orders.map(normalizeOrder).sort((a, b) => a.number - b.number) }, errors };
}
function LinesField({ label, hint, value, onChange }: { label: string; hint: string; value: string[]; onChange: (value: string[]) => void }) {
  return <label className="editor-field editor-span"><span>{label}</span><small>{hint}</small><textarea rows={6} value={value.join('\n')} onChange={(event) => onChange(event.target.value.split('\n'))} /></label>;
}

export default function RotatingOrdersEditor() {
  const builtIn = rotatingData as OrdersFile;
  const [file, setFile] = useState<OrdersFile>(() => cloneFile(builtIn));
  const [mode, setMode] = useState<'add' | 'edit'>('edit');
  const [editingId, setEditingId] = useState<string | null>(builtIn.orders[0]?.id ?? null);
  const [draft, setDraft] = useState<RotatingOrder>(() => cloneOrder(builtIn.orders[0]));
  const [errors, setErrors] = useState<string[]>([]);
  const [status, setStatus] = useState('Loaded the built-in rotating executive orders.');
  const [dirty, setDirty] = useState(false);
  const fileHandle = useRef<LocalFileHandle | null>(null);
  const uploadInput = useRef<HTMLInputElement | null>(null);
  const jsonText = useMemo(() => `${JSON.stringify({ ...file, orders: [...file.orders].sort((a, b) => a.number - b.number) }, null, 2)}\n`, [file]);

  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
  const patchDraft = (patch: Partial<RotatingOrder>) => setDraft((current) => ({ ...current, ...patch }));
  const chooseMode = (next: 'add' | 'edit') => {
    setMode(next); setErrors([]);
    if (next === 'add') { setEditingId(null); setDraft(blankOrder(file.orders)); }
    else { const first = file.orders[0]; setEditingId(first?.id ?? null); if (first) setDraft(cloneOrder(first)); }
  };
  const selectOrder = (id: string) => { const selected = file.orders.find((order) => order.id === id); if (!selected) return; setEditingId(id); setDraft(cloneOrder(selected)); setErrors([]); setStatus(`Editing Order ${selected.number}: ${selected.id}`); };
  const applyDraft = () => {
    const normalized = normalizeOrder(draft); const nextErrors = validateOrder(normalized, file.orders, editingId); setErrors(nextErrors);
    if (nextErrors.length) { setStatus('Fix the validation issues before applying this order.'); return; }
    const orders = (mode === 'add' ? [...file.orders, normalized] : file.orders.map((order) => order.id === editingId ? normalized : order)).sort((a, b) => a.number - b.number);
    const activeOrderId = editingId && file.activeOrderId === editingId ? normalized.id : file.activeOrderId;
    setFile({ ...file, orders, activeOrderId }); setMode('edit'); setEditingId(normalized.id); setDraft(cloneOrder(normalized)); setDirty(true); setStatus(`${mode === 'add' ? 'Added' : 'Updated'} Order ${normalized.number}. The JSON draft is ready to save.`);
  };
  const removeOrder = () => {
    if (!editingId || file.orders.length <= 1) { setStatus('Keep at least one rotating order in the file.'); return; }
    const orders = file.orders.filter((order) => order.id !== editingId); const next = orders[0];
    setFile({ ...file, orders, activeOrderId: file.activeOrderId === editingId ? next.id : file.activeOrderId }); setEditingId(next.id); setDraft(cloneOrder(next)); setDirty(true); setErrors([]); setStatus('Removed the selected order from the draft. Reset to built-in if you need to undo it.');
  };
  const updateSource = (index: number, patch: Partial<OrderSource>) => patchDraft({ sources: draft.sources.map((source, sourceIndex) => sourceIndex === index ? { ...source, ...patch } : source) });
  const pickerApi = () => (window as unknown as { showOpenFilePicker?: (options: object) => Promise<LocalFileHandle[]> }).showOpenFilePicker;
  const loadText = (text: string, name: string, handle: LocalFileHandle | null) => {
    const result = validateFile(JSON.parse(text) as unknown);
    if (!result.value) { setErrors(result.errors.slice(0, 40)); setStatus(`Import rejected: ${result.errors.length} validation issue${result.errors.length === 1 ? '' : 's'} found.`); return; }
    const next = result.value; setFile(next); setMode('edit'); setEditingId(next.orders[0].id); setDraft(cloneOrder(next.orders[0])); fileHandle.current = handle; setDirty(handle === null); setErrors([]); setStatus(handle ? `Opened ${name}. Changes can now be saved directly to this file.` : `Imported ${name}. Review it, then save or download the complete JSON.`);
  };
  const openLocalFile = async () => {
    const picker = pickerApi(); if (!picker) { setStatus('Direct file editing is not supported in this browser. Use Upload or Download instead.'); return; }
    try { const [handle] = await picker.call(window, { multiple: false, types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }] }); const picked = await handle.getFile(); loadText(await picked.text(), handle.name, handle); }
    catch (error) { if ((error as Error).name !== 'AbortError') setStatus((error as Error).message || 'The file could not be opened.'); }
  };
  const importFile = async (picked?: File) => { if (!picked) return; try { loadText(await picked.text(), picked.name, null); } catch (error) { setErrors([]); setStatus((error as Error).message || 'The uploaded JSON could not be read.'); } finally { if (uploadInput.current) uploadInput.current.value = ''; } };
  const validatedText = () => { const result = validateFile(file); setErrors(result.errors.slice(0, 40)); if (!result.value) { setStatus(`Fix ${result.errors.length} validation issue${result.errors.length === 1 ? '' : 's'} before saving.`); return null; } setStatus('Validation passed. The complete rotating_orders.json draft is ready.'); return `${JSON.stringify(result.value, null, 2)}\n`; };
  const save = async () => { const text = validatedText(); if (!text) return; if (!fileHandle.current) { setStatus('Open your local rotating_orders.json first, or use Download.'); return; } try { const writable = await fileHandle.current.createWritable(); await writable.write(text); await writable.close(); setDirty(false); setStatus(`Saved ${fileHandle.current.name} successfully.`); } catch (error) { setStatus((error as Error).message || 'The file could not be saved.'); } };
  const download = () => { const text = validatedText(); if (!text) return; const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'rotating_orders.json'; anchor.click(); URL.revokeObjectURL(url); setStatus('Downloaded rotating_orders.json. Replace the project file before publishing.'); };
  const copy = async () => { const text = validatedText(); if (!text) return; await navigator.clipboard.writeText(text); setStatus('Copied the complete rotating orders JSON to the clipboard.'); };
  const reset = () => { const next = cloneFile(builtIn); setFile(next); setMode('edit'); setEditingId(next.orders[0]?.id ?? null); setDraft(cloneOrder(next.orders[0])); fileHandle.current = null; setDirty(false); setErrors([]); setStatus('Reloaded the built-in rotating executive orders.'); };

  return <main className="question-editor-shell">
    <header className="editor-header"><div><p>PRIVATE CONTENT TOOL</p><h1>ROTATING ORDERS EDITOR</h1><span>Unlinked from the game. Nothing changes until you save or download the complete JSON file.</span></div><div className="editor-file-actions">
      <input ref={uploadInput} className="editor-hidden-input" type="file" accept=".json,application/json" onChange={(event) => void importFile(event.target.files?.[0])} />
      <button type="button" onClick={() => uploadInput.current?.click()}>UPLOAD WHOLE rotating_orders.json</button><button type="button" onClick={openLocalFile}>OPEN LOCAL FILE</button><button type="button" onClick={() => void save()}>SAVE TO OPEN FILE</button><button type="button" onClick={download}>DOWNLOAD JSON</button><button type="button" onClick={() => void copy()}>COPY JSON</button><a href={publicPath('/content-guides/ai-content-guide.md')} download>DOWNLOAD AI CONTENT GUIDE</a><button type="button" className="editor-quiet" onClick={reset}>RESET TO BUILT-IN</button>
    </div></header>
    <div className="editor-status" role="status">{dirty && <strong>UNSAVED DRAFT • </strong>}{status}</div>
    <div className="editor-layout">
      <aside className="editor-sidebar">
        <div className="editor-mode-tabs"><button type="button" className={mode === 'add' ? 'active' : ''} onClick={() => chooseMode('add')}>＋ ADD NEW</button><button type="button" className={mode === 'edit' ? 'active' : ''} onClick={() => chooseMode('edit')}>✎ EDIT EXISTING</button></div>
        {mode === 'edit' && <label className="editor-select-label"><span>SELECT ORDER</span><select value={editingId ?? ''} onChange={(event) => selectOrder(event.target.value)}>{file.orders.map((order) => <option key={order.id} value={order.id}>EO {order.number} · {order.id}{order.enabled ? ' · enabled' : ''}</option>)}</select></label>}
        <div className="editor-file-settings"><strong>FILE SETTINGS</strong><label className="editor-check"><input type="checkbox" checked={file.enabled} onChange={(event) => { setFile({ ...file, enabled: event.target.checked }); setDirty(true); }} /><span>Rotating orders enabled</span></label><label className="editor-select-label"><span>ACTIVE ORDER</span><select value={file.activeOrderId} onChange={(event) => { setFile({ ...file, activeOrderId: event.target.value }); setDirty(true); }}>{file.orders.map((order) => <option key={order.id} value={order.id}>EO {order.number} · {order.id}</option>)}</select></label></div>
      </aside>
      <section className="editor-form-card">
        <div className="editor-form-title"><div><p>{mode === 'add' ? 'NEW ROTATING ORDER' : `ORDER ${draft.number}`}</p><h2>STANDARD BONUS QUESTION</h2></div><span>Rotating orders are optional bonus questions. Each one uses the standard multiple-choice format and its own provenance records.</span></div>
        {errors.length > 0 && <div className="editor-errors"><strong>PLEASE FIX:</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
        <div className="editor-grid">
          <label className="editor-check editor-span"><input type="checkbox" checked={draft.enabled} onChange={(event) => patchDraft({ enabled: event.target.checked })} /><span>Enable this order</span></label>
          <label className="editor-field"><span>ID</span><small>Lowercase words joined with hyphens.</small><input value={draft.id} onChange={(event) => patchDraft({ id: event.target.value })} /></label>
          <label className="editor-field"><span>Bonus number</span><small>Whole number, 101 or higher.</small><input type="number" min={101} value={draft.number} onChange={(event) => patchDraft({ number: Number(event.target.value) })} /></label>
          <label className="editor-field"><span>Type</span><input value="standard" disabled /></label>
          <label className="editor-field"><span>Kicker</span><input value={draft.kicker} onChange={(event) => patchDraft({ kicker: event.target.value })} /></label>
          <label className="editor-field editor-span"><span>Prompt</span><textarea rows={3} value={draft.prompt} onChange={(event) => patchDraft({ prompt: event.target.value })} /></label>
          <LinesField label="Answer choices" hint="One answer per line. The first answer is index 0." value={draft.choices} onChange={(choices) => patchDraft({ choices })} />
          <LinesField label="Answer feedback" hint="One line per answer, in the same order." value={draft.feedback} onChange={(feedback) => patchDraft({ feedback })} />
          <label className="editor-field"><span>Correct answer index</span><small>First answer is 0, second is 1, and so on.</small><input type="number" min={0} value={draft.correctIndex} onChange={(event) => patchDraft({ correctIndex: Number(event.target.value) })} /></label>
        </div>
        <section className="editor-sources"><div className="editor-section-heading"><div><h3>SOURCES AND PROVENANCE</h3><p>Factual orders need verified links. Pure jokes should be labelled original satire.</p></div><button type="button" onClick={() => patchDraft({ sources: [...draft.sources, { kind: 'reference', title: '' }] })}>＋ ADD SOURCE</button></div>
          {draft.sources.map((source, index) => <div className="editor-source-card" key={`${index}-${source.kind}`}><div className="editor-source-number">SOURCE {index + 1}</div>
            <label className="editor-field"><span>Kind</span><select value={source.kind} onChange={(event) => updateSource(index, { kind: event.target.value as SourceKind })}><option value="official">Official</option><option value="reference">Reference</option><option value="internal">Internal data</option><option value="original_satire">Original satire</option><option value="user_supplied_asset">User-supplied asset</option></select></label>
            <label className="editor-field"><span>Title</span><input value={source.title} onChange={(event) => updateSource(index, { title: event.target.value })} /></label><label className="editor-field"><span>Publisher</span><input value={source.publisher ?? ''} onChange={(event) => updateSource(index, { publisher: event.target.value })} /></label>
            {['official', 'reference'].includes(source.kind) && <label className="editor-field editor-span"><span>URL</span><input type="url" placeholder="https://…" value={source.url ?? ''} onChange={(event) => updateSource(index, { url: event.target.value })} /></label>}{['internal', 'user_supplied_asset'].includes(source.kind) && <label className="editor-field editor-span"><span>Project path</span><input placeholder="content/file.json or public/assets/…" value={source.path ?? ''} onChange={(event) => updateSource(index, { path: event.target.value })} /></label>}
            <label className="editor-field"><span>Accessed on</span><input type="date" value={source.accessedOn ?? ''} onChange={(event) => updateSource(index, { accessedOn: event.target.value })} /></label><label className="editor-field editor-span"><span>Source note</span><textarea rows={2} value={source.note ?? ''} onChange={(event) => updateSource(index, { note: event.target.value })} /></label>{draft.sources.length > 1 && <button className="editor-remove" type="button" onClick={() => patchDraft({ sources: draft.sources.filter((_, sourceIndex) => sourceIndex !== index) })}>REMOVE SOURCE</button>}
          </div>)}
        </section>
        <div className="editor-apply-row editor-apply-actions"><div><button type="button" onClick={applyDraft}>{mode === 'add' ? 'ADD ORDER TO JSON DRAFT' : 'UPDATE ORDER IN JSON DRAFT'}</button>{mode === 'edit' && <button type="button" className="editor-danger" onClick={removeOrder}>REMOVE ORDER</button>}</div><span>{file.orders.length} orders currently in the draft</span></div>
        <details className="editor-json-preview"><summary>Preview complete JSON</summary><pre>{jsonText}</pre></details>
      </section>
    </div>
  </main>;
}
