'use client';

import { useEffect, useMemo, useState } from 'react';
import questionsJson from '../content/questions.json';
import weeklyGame from '../content/weekly_game.json';
import { publicPath } from '../lib/public-path';
import { EMPTY_PLAYER_STATE, loadPlayerState, type PlayerState, requestPersistentStorage, savePlayerState, type WeekProgress } from '../lib/daily-store';

type DailyQuestion = { choices: string[]; correctIndex: number; feedback?: string[]; id: string; kicker: string; prompt: string; type: string };
type Phase = 'home' | 'quiz' | 'reveal';
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const TILE_COUNT = 25;
const TEST_DAY_OFFSET_KEY = 'trumps-impossible-daily-test-day-offset';
const MAX_TEST_DAY_OFFSET = 7;

function dateKey(date = new Date()): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
function previousDateKey(date = new Date()): string {
  return dateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, 12));
}
function weekKey(date = new Date()): string {
  const mondayOffset = (date.getDay() + 6) % 7;
  return dateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - mondayOffset, 12));
}
function blankWeek(): WeekProgress {
  return { foundTrump: false, guessDates: [], revealedTiles: [], totalCorrect: 0 };
}
function weeklyRank(score: number): string {
  if (score >= 35) return 'ENEMY OF THE PEOPLE';
  if (score >= 30) return 'VERY STABLE INVESTIGATOR';
  if (score >= 25) return 'DEEP STATE DETECTIVE';
  if (score >= 20) return 'ASSISTANT DECLASSIFIER';
  if (score >= 10) return 'FAKE NEWS APPRENTICE';
  return 'LOW-ENERGY INVESTIGATOR';
}
function meltdownLabel(level: number): string {
  if (level >= 10) return 'COMPLETE MELTDOWN';
  if (level >= 8) return 'CLAIMING TOTAL VICTORY';
  if (level >= 6) return 'DEMANDING AN INVESTIGATION';
  if (level >= 4) return 'BLAMING THE MEDIA';
  if (level >= 1) return 'SLIGHTLY ANNOYED';
  return 'SURPRISINGLY CALM';
}
function shareText(today: string, answers: boolean[], week: WeekProgress, profile: PlayerState): string {
  const grid = answers.map((answer) => answer ? '🟩' : '🟥').join('');
  const level = Math.max(0, week.totalCorrect - TILE_COUNT);
  const response = weeklyGame.meltdownResponses[(week.totalCorrect + today.length) % weeklyGame.meltdownResponses.length];
  return [
    `TRUMP'S IMPOSSIBLE DAILY — ${today}`,
    grid,
    `${answers.filter(Boolean).length}/5 · ${week.revealedTiles.length}/25 tiles`,
    `🔥 ${profile.currentStreak}-day streak`,
    week.foundTrump ? `🔎 TRUMP FOUND after ${week.foundAtTiles ?? week.revealedTiles.length} tiles` : '🔎 Trump remains under investigation',
    level ? `📣 Meltdown ${level}/10: ${meltdownLabel(level)}` : '',
    '', response,
  ].filter(Boolean).join('\n');
}

export default function Game() {
  const [player, setPlayer] = useState<PlayerState>(EMPTY_PLAYER_STATE);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState<Phase>('home');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [guessMode, setGuessMode] = useState(false);
  const [message, setMessage] = useState('');
  const [testDayOffset, setTestDayOffset] = useState(0);

  const now = useMemo(() => {
    const shifted = new Date();
    shifted.setDate(shifted.getDate() + testDayOffset);
    return shifted;
  }, [testDayOffset]);
  const today = dateKey(now);
  const thisWeek = weekKey(now);
  const dayName = DAY_NAMES[now.getDay()];
  const questions = useMemo(() => {
    const bank = questionsJson as DailyQuestion[];
    const ids = weeklyGame.dailyQuestionIds[dayName];
    return ids.map((id) => bank.find((question) => question.id === id)).filter((question): question is DailyQuestion => Boolean(question?.choices && question.correctIndex >= 0));
  }, [dayName]);
  const week = player.weeks[thisWeek] ?? blankWeek();
  const todayResult = player.days[today];
  const revealCredits = Math.max(0, Math.min(TILE_COUNT - week.revealedTiles.length, week.totalCorrect - week.revealedTiles.length));
  const meltdown = Math.max(0, week.totalCorrect - TILE_COUNT);
  const currentQuestion = questions[questionIndex];

  useEffect(() => {
    void loadPlayerState().then((state) => {
      const savedOffset = Number.parseInt(window.localStorage.getItem(TEST_DAY_OFFSET_KEY) ?? '0', 10);
      if (Number.isFinite(savedOffset) && savedOffset > 0) setTestDayOffset(Math.min(savedOffset, MAX_TEST_DAY_OFFSET));
      setPlayer(state); setLoaded(true);
    });
    void requestPersistentStorage();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(publicPath('/service-worker.js')).catch(() => {});
  }, []);

  const commit = (next: PlayerState) => { setPlayer(next); void savePlayerState(next); };
  const advanceTestDay = () => {
    setTestDayOffset((current) => {
      const next = Math.min(current + 1, MAX_TEST_DAY_OFFSET);
      window.localStorage.setItem(TEST_DAY_OFFSET_KEY, String(next));
      return next;
    });
    setPhase('home'); setMessage('');
  };
  const resetTestDay = () => {
    window.localStorage.removeItem(TEST_DAY_OFFSET_KEY);
    setTestDayOffset(0); setPhase('home'); setMessage('');
  };
  const startQuiz = () => {
    if (todayResult) { setPhase('reveal'); return; }
    setAnswers([]); setQuestionIndex(0); setSelectedChoice(null); setMessage(''); setPhase('quiz');
  };
  const answerQuestion = (choiceIndex: number) => {
    if (selectedChoice !== null || !currentQuestion) return;
    setSelectedChoice(choiceIndex);
    const correct = choiceIndex === currentQuestion.correctIndex;
    setAnswers((existing) => [...existing, correct]);
    setMessage(currentQuestion.feedback?.[choiceIndex] ?? (correct ? 'CORRECT. THE RECORD HAS BEEN TEMPORARILY UPDATED.' : 'WRONG. THE FACTS HAVE BEEN ESCORTED OUT.'));
  };
  const finishQuiz = () => {
    const score = answers.filter(Boolean).length;
    const existingWeek = player.weeks[thisWeek] ?? blankWeek();
    const currentStreak = player.lastPlayedDate === previousDateKey(now) ? player.currentStreak + 1 : 1;
    const next: PlayerState = {
      ...player,
      bestStreak: Math.max(player.bestStreak, currentStreak), currentStreak,
      days: { ...player.days, [today]: { answers, completedAt: new Date().toISOString(), questionIds: questions.map((question) => question.id), score } },
      lastPlayedDate: today,
      perfectDays: player.perfectDays + (score === 5 ? 1 : 0),
      weeks: { ...player.weeks, [thisWeek]: { ...existingWeek, totalCorrect: existingWeek.totalCorrect + score } },
    };
    commit(next); setPhase('reveal');
    setMessage(score ? `${score} DECLASSIFICATION CREDIT${score === 1 ? '' : 'S'} EARNED.` : 'ZERO CREDITS. A HISTORIC FIRST.');
  };
  const nextQuestion = () => {
    if (questionIndex >= questions.length - 1) { finishQuiz(); return; }
    setQuestionIndex((index) => index + 1); setSelectedChoice(null); setMessage('');
  };
  const revealTile = (tile: number) => {
    if (week.revealedTiles.includes(tile) || revealCredits < 1) return;
    const nextWeek = { ...week, revealedTiles: [...week.revealedTiles, tile].sort((a, b) => a - b) };
    commit({ ...player, weeks: { ...player.weeks, [thisWeek]: nextWeek } });
    setMessage('TILE DECLASSIFIED. THIS DECISION CANNOT BE REVERSED.');
  };
  const guessTrump = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!guessMode || week.guessDates.includes(today) || week.foundTrump) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    const tile = Math.min(4, Math.floor(y / 20)) * 5 + Math.min(4, Math.floor(x / 20));
    if (!week.revealedTiles.includes(tile)) { setMessage('THAT AREA IS STILL CLASSIFIED. REVEAL IT FIRST.'); return; }
    const target = weeklyGame.target;
    const found = x >= target.xPct && x <= target.xPct + target.widthPct && y >= target.yPct && y <= target.yPct + target.heightPct;
    const nextWeek: WeekProgress = { ...week, foundAtTiles: found ? week.revealedTiles.length : week.foundAtTiles, foundTrump: week.foundTrump || found, guessDates: [...week.guessDates, today] };
    commit({
      ...player,
      successfulFinds: player.successfulFinds + (found ? 1 : 0),
      totalFindTiles: player.totalFindTiles + (found ? week.revealedTiles.length : 0),
      totalTrumpGuesses: player.totalTrumpGuesses + 1,
      weeks: { ...player.weeks, [thisWeek]: nextWeek },
    });
    setGuessMode(false);
    setMessage(found ? 'TRUMP FOUND. HE DENIES BEING IN THE PICTURE.' : 'NOT TRUMP. TODAY\'S GUESS HAS BEEN USED.');
  };
  const share = async () => {
    const result = player.days[today];
    if (!result) return;
    const text = shareText(today, result.answers, week, player);
    if (navigator.share) {
      try { await navigator.share({ title: "Trump's Impossible Daily", text, url: window.location.href }); return; } catch { /* Clipboard fallback. */ }
    }
    await navigator.clipboard.writeText(`${text}\n${window.location.href}`);
    setMessage('RESULT COPIED. THE MEDIA HAS BEEN NOTIFIED.');
  };

  if (!loaded) return <main className="daily-shell"><p className="daily-loading">COUNTING THE VOTES…</p></main>;

  if (phase === 'quiz' && currentQuestion) {
    return <main className="daily-shell quiz-view">
      <header className="daily-topbar"><strong>QUESTION {questionIndex + 1}/5</strong><span>{answers.filter(Boolean).length} CORRECT</span></header>
      <section className="daily-question-card">
        <p className="daily-kicker">{currentQuestion.kicker}</p><h1>{currentQuestion.prompt}</h1>
        <div className="daily-choices">{currentQuestion.choices.map((choice, index) => <button type="button" key={choice} className={selectedChoice === null ? '' : index === currentQuestion.correctIndex ? 'correct' : selectedChoice === index ? 'wrong' : 'muted'} onClick={() => answerQuestion(index)}><span>{String.fromCharCode(65 + index)}</span>{choice}</button>)}</div>
        {selectedChoice !== null && <div className="daily-verdict"><strong>{answers.at(-1) ? 'CORRECT' : 'WRONG'}</strong><p>{message}</p><button type="button" onClick={nextQuestion}>{questionIndex === questions.length - 1 ? 'COUNT THE FINAL SCORE' : 'NEXT QUESTION'}</button></div>}
      </section>
    </main>;
  }

  if (phase === 'reveal') {
    const guessedToday = week.guessDates.includes(today);
    return <main className="daily-shell reveal-view">
      <header className="daily-topbar"><strong>{weeklyGame.kicker}</strong><span>WEEK OF {thisWeek}</span></header>
      <section className="investigation-layout">
        <div><p className="daily-kicker">{weeklyGame.title}</p><h1>WHERE IS TRUMP?</h1><p className="daily-subtitle">Choose covered tiles to declassify. Once selected, a tile cannot be changed.</p></div>
        <div className={`weekly-board ${guessMode ? 'guessing' : ''}`} onClick={guessTrump} role="img" aria-label={weeklyGame.imageAlt}>
          <img src={publicPath(weeklyGame.image)} alt="" />
          <div className="tile-grid" aria-label="Classified picture tiles">{Array.from({ length: TILE_COUNT }, (_, tile) => {
            const revealed = week.revealedTiles.includes(tile);
            return <button key={tile} type="button" className={revealed ? 'revealed' : 'covered'} disabled={revealed || revealCredits < 1} onClick={(event) => { event.stopPropagation(); revealTile(tile); }} aria-label={revealed ? `Tile ${tile + 1} revealed` : `Reveal tile ${tile + 1}`}><span>{revealed ? '' : 'CLASSIFIED'}</span></button>;
          })}</div>
          {week.foundTrump && <div className="found-stamp">FOUND<br /><small>HE DENIES IT</small></div>}
        </div>
        <div className="investigation-panel">
          <div className="credit-card"><span>AVAILABLE TILE CREDITS</span><strong>{revealCredits}</strong></div>
          <div className="credit-card"><span>WEEKLY SCORE</span><strong>{week.totalCorrect}/35</strong></div>
          <div className="credit-card wide"><span>RANK</span><strong>{weeklyRank(week.totalCorrect)}</strong></div>
          {week.revealedTiles.length >= TILE_COUNT && <div className="meltdown-card wide"><div><span>TRUMP MELTDOWN METER</span><strong>{meltdown}/10 · {meltdownLabel(meltdown)}</strong></div><div className="meltdown-track"><i style={{ width: `${meltdown * 10}%` }} /></div>{meltdown >= 10 && <p>{weeklyGame.meltdownResponses[week.totalCorrect % weeklyGame.meltdownResponses.length]}</p>}</div>}
        </div>
        <div className="investigation-actions">
          {!week.foundTrump && <button type="button" className="begin-button" disabled={guessedToday || week.revealedTiles.length === 0} onClick={() => { setGuessMode(true); setMessage('TAP TRUMP IN A REVEALED PART OF THE PICTURE.'); }}>{guessedToday ? 'TODAY\'S GUESS USED' : guessMode ? 'TAP TRUMP NOW' : 'I KNOW WHERE TRUMP IS'}</button>}
          <button type="button" className="secondary-button" disabled={!todayResult} onClick={() => void share()}>SHARE TODAY&apos;S RESULT</button>
          <button type="button" className="text-button" onClick={() => setPhase('home')}>RETURN TO BRIEFING</button>
        </div>
        {message && <p className="daily-message">{message}</p>}
      </section>
    </main>;
  }

  return <main className="daily-shell home-view">
    <section className="daily-title-card">
      <p className="classified-label">ABSOLUTELY CLASSIFIED</p><p className="daily-kicker">A NEW IMPOSSIBLE INVESTIGATION EVERY DAY</p>
      <h1>TRUMP&apos;S<br /><em>IMPOSSIBLE</em><br />DAILY</h1>
      <p className="daily-tagline">FIVE QUESTIONS. ONE HIDDEN TRUMP. ZERO RELIABLE FACTS.</p>
      <div className="today-briefing"><div><span>TODAY</span><strong>{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase()}</strong></div><div><span>LOCAL RESET</span><strong>MIDNIGHT · {Intl.DateTimeFormat().resolvedOptions().timeZone}</strong></div></div>
      <button type="button" className="begin-button" onClick={startQuiz}>{todayResult ? 'OPEN WEEKLY INVESTIGATION' : 'PLAY TODAY\'S 5 QUESTIONS'}</button>
      {todayResult && <p className="completed-today">TODAY COMPLETE · {todayResult.answers.map((answer) => answer ? '🟩' : '🟥').join('')} · {todayResult.score}/5</p>}
      <div className="test-clock" aria-label="Daily game testing controls">
        <div><span>TESTING CLOCK</span><strong>{testDayOffset ? `+${testDayOffset} DAY${testDayOffset === 1 ? '' : 'S'}` : 'REAL TODAY'}</strong></div>
        <button type="button" disabled={testDayOffset >= MAX_TEST_DAY_OFFSET} onClick={advanceTestDay}>{testDayOffset >= MAX_TEST_DAY_OFFSET ? '7-DAY LIMIT REACHED' : 'ADVANCE ONE DAY'}</button>
        {testDayOffset > 0 && <button type="button" className="test-reset" onClick={resetTestDay}>RESET TO REAL TODAY</button>}
      </div>
      <div className="home-stats"><div><strong>{player.currentStreak}</strong><span>CURRENT STREAK</span></div><div><strong>{player.bestStreak}</strong><span>BEST STREAK</span></div><div><strong>{player.perfectDays}</strong><span>PERFECT DAYS</span></div><div><strong>{week.revealedTiles.length}/25</strong><span>TILES OPEN</span></div></div>
      <p className="streak-help">Complete the daily quiz on consecutive days to extend your streak.</p>
      <p className="fine-print">Independent parody/satire. Progress is stored privately on this device. No account required.</p>
    </section>
    <div className="ticker" aria-hidden="true"><span>BREAKING: LOCAL PLAYER CLAIMS FIVE QUESTIONS WERE ENOUGH · NEW PICTURE REMAINS HEAVILY CLASSIFIED</span></div>
  </main>;
}
