'use client';

export { default } from './WeeklyScheduleManager';

import { useEffect, useMemo, useRef, useState } from 'react';
import questionsJson from '../../content/questions.json';
import builtIn from '../../content/weekly_game.json';
import { publicPath } from '../../lib/public-path';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
type WeeklyFile = typeof builtIn;
type QuestionSummary = { choices?: string[]; correctIndex?: number; id: string; prompt: string };

function clone(): WeeklyFile { return structuredClone(builtIn); }
function seededOrder<T>(items: T[], seed: number): T[] {
  return [...items].sort((a, b) => {
    const left = Math.sin((items.indexOf(a) + 1) * 999 + seed) * 10000;
    const right = Math.sin((items.indexOf(b) + 1) * 999 + seed) * 10000;
    return (left - Math.floor(left)) - (right - Math.floor(right));
  });
}

function LegacyWeeklyEditor() {
  const [draft, setDraft] = useState<WeeklyFile>(clone);
  const [previewUrl, setPreviewUrl] = useState(publicPath(builtIn.image));
  const [status, setStatus] = useState('Loaded the built-in weekly investigation.');
  const fileInput = useRef<HTMLInputElement | null>(null);
  const questions = questionsJson as QuestionSummary[];
  const eligible = useMemo(() => questions.filter((question) => Array.isArray(question.choices) && question.choices.length >= 2 && Number.isInteger(question.correctIndex) && Number(question.correctIndex) >= 0), [questions]);

  useEffect(() => () => { if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const patch = (value: Partial<WeeklyFile>) => setDraft((current) => ({ ...current, ...value }));
  const uploadImage = (file?: File) => {
    if (!file) return;
    if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    patch({ image: `/assets/weekly/${file.name}` });
    setStatus(`Previewing ${file.name}. Copy this image into public/assets/weekly before publishing.`);
  };
  const setTarget = (event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    const widthPct = draft.target.widthPct;
    const heightPct = draft.target.heightPct;
    patch({ target: { ...draft.target, xPct: Math.max(0, Math.min(100 - widthPct, Number((x - widthPct / 2).toFixed(1)))), yPct: Math.max(0, Math.min(100 - heightPct, Number((y - heightPct / 2).toFixed(1)))) } });
    setStatus('Moved the Trump target area. Adjust its width and height if required.');
  };
  const generateSchedule = () => {
    if (!eligible.length) return;
    const schedule = {} as WeeklyFile['dailyQuestionIds'];
    DAYS.forEach((day, dayIndex) => {
      const ordered = seededOrder(eligible, Date.now() + dayIndex * 47);
      schedule[day] = Array.from({ length: 5 }, (_, index) => ordered[index % ordered.length].id);
    });
    patch({ dailyQuestionIds: schedule });
    setStatus(`Generated seven daily sets from ${eligible.length} eligible quick questions. Review before publishing.`);
  };
  const download = () => {
    const text = `${JSON.stringify(draft, null, 2)}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'weekly_game.json'; anchor.click(); URL.revokeObjectURL(url);
    setStatus('Downloaded weekly_game.json. Replace the project file and add the selected image before publishing.');
  };

  return <main className="question-editor-shell weekly-editor-shell">
    <header className="editor-header"><div><p>PRIVATE CONTENT TOOL</p><h1>WEEKLY GAME EDITOR</h1><span>Prepare the picture, Trump target area, daily schedule and reusable meltdown responses.</span></div><div className="editor-file-actions">
      <input ref={fileInput} className="editor-hidden-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadImage(event.target.files?.[0])} />
      <button type="button" onClick={() => fileInput.current?.click()}>UPLOAD WEEKLY PICTURE</button>
      <button type="button" onClick={generateSchedule}>GENERATE 7 × 5 QUESTIONS</button>
      <button type="button" onClick={download}>DOWNLOAD WEEKLY JSON</button>
      <a href={publicPath('/question-editor/')}>OPEN QUESTION EDITOR</a>
      <button type="button" className="editor-quiet" onClick={() => { setDraft(clone()); setPreviewUrl(publicPath(builtIn.image)); setStatus('Reset to the built-in weekly investigation.'); }}>RESET</button>
    </div></header>
    <p className="editor-status">{status}</p>
    <section className="weekly-editor-grid">
      <div className="editor-form-card weekly-settings">
        <h2>WEEKLY DETAILS</h2>
        <label className="editor-field"><span>Weekly title</span><input value={draft.title} onChange={(event) => patch({ title: event.target.value })} /></label>
        <label className="editor-field"><span>Kicker</span><input value={draft.kicker} onChange={(event) => patch({ kicker: event.target.value })} /></label>
        <label className="editor-field"><span>Published image path</span><input value={draft.image} onChange={(event) => patch({ image: event.target.value })} /></label>
        <label className="editor-field"><span>Accessible image description</span><textarea rows={3} value={draft.imageAlt} onChange={(event) => patch({ imageAlt: event.target.value })} /></label>
        <h3 className="editor-subheading">TRUMP TARGET SIZE</h3>
        <div className="target-inputs">
          {(['xPct', 'yPct', 'widthPct', 'heightPct'] as const).map((field) => <label className="editor-field" key={field}><span>{field}</span><input type="number" min="0" max="100" step="0.5" value={draft.target[field]} onChange={(event) => patch({ target: { ...draft.target, [field]: Number(event.target.value) } })} /></label>)}
        </div>
        <div className="editor-notice"><strong>HOW IT WORKS</strong><span>Click Trump in the preview to move the red target area. Uploading previews the file but cannot write to GitHub; the picture and downloaded JSON are published together.</span></div>
      </div>
      <div className="weekly-preview-card">
        <p>CLICK TRUMP TO POSITION THE TARGET</p>
        <div className="weekly-admin-preview" onClick={setTarget}>
          <img src={previewUrl} alt={draft.imageAlt} />
          <i style={{ left: `${draft.target.xPct}%`, top: `${draft.target.yPct}%`, width: `${draft.target.widthPct}%`, height: `${draft.target.heightPct}%` }} />
          <div className="admin-tile-grid">{Array.from({ length: 25 }, (_, index) => <span key={index} />)}</div>
        </div>
      </div>
      <div className="editor-form-card weekly-schedule-card">
        <h2>DAILY QUESTION SCHEDULE</h2>
        <p>Every player receives the same five IDs on the same local calendar day.</p>
        <div className="weekly-days">{DAYS.map((day) => <label className="editor-field" key={day}><span>{day.toUpperCase()}</span><textarea rows={3} value={draft.dailyQuestionIds[day].join('\n')} onChange={(event) => patch({ dailyQuestionIds: { ...draft.dailyQuestionIds, [day]: event.target.value.split(/\r?\n/).map((id) => id.trim()).filter(Boolean).slice(0, 5) } })} /></label>)}</div>
      </div>
      <div className="editor-form-card weekly-responses-card">
        <h2>REUSABLE MELTDOWN RESPONSES</h2>
        <p>One response per line. These rotate automatically; no ten weekly rewards are required.</p>
        <textarea rows={14} value={draft.meltdownResponses.join('\n')} onChange={(event) => patch({ meltdownResponses: event.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) })} />
      </div>
    </section>
  </main>;
}

void LegacyWeeklyEditor;
