'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import questionsData from '@/content/questions.json';
import executiveMetricsData from '@/content/executive_metrics.json';
import jokesData from '@/content/jokes.json';
import rotatingOrdersData from '@/content/rotating_orders.json';
import { publicPath } from '@/lib/public-path';

type Phase = 'landing' | 'question' | 'bing' | 'golf' | 'ad' | 'gameover';
type QuestionType = 'standard' | 'injunction' | 'hotspot' | 'live' | 'taco' | 'bing' | 'golf' | 'final';
type GameMode = 'short' | 'full';
type QuestionSource = {
  kind: 'reference' | 'official' | 'internal' | 'original_satire' | 'user_supplied_asset';
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

const CORE_QUESTIONS = questionsData as Question[];
const ROTATING_QUESTIONS = rotatingOrdersData.enabled
  ? (rotatingOrdersData.orders.filter((order) => order.enabled) as Question[])
  : [];
const FINAL_QUESTION = CORE_QUESTIONS.find((question) => question.number === 47 || question.type === 'final');
const REGULAR_QUESTIONS = CORE_QUESTIONS.filter((question) => question !== FINAL_QUESTION);
const FULL_QUESTIONS = [...REGULAR_QUESTIONS, ...ROTATING_QUESTIONS, ...(FINAL_QUESTION ? [FINAL_QUESTION] : [])];

function readMetric(path: string | undefined): string {
  const parts = (path || 'activeInjunctions').split('.');
  let current: unknown = executiveMetricsData;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) return 'N/A';
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'number' || typeof current === 'string' ? String(current) : 'N/A';
}

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function createShortGame() {
  const selected = shuffled(FULL_QUESTIONS.filter((question) => question.type !== 'final')).slice(0, 9);
  const numbered = selected.map((question, index) => ({ ...question, number: index + 1 }));
  return FINAL_QUESTION ? [...numbered, { ...FINAL_QUESTION, number: 10 }] : numbered;
}

const BING_LABELS = [
  [0, 39, 'LOW ENERGY'],
  [40, 79, 'MANY PEOPLE ARE SAYING BING'],
  [80, 119, 'TREMENDOUS'],
  [120, 149, 'VERY STABLE BINGER'],
  [150, Infinity, 'NOBODY HAS EVER BINGED LIKE THIS'],
] as const;

const AD_BREAK_AFTER_QUESTIONS = new Set([5]);

function bingLabel(score: number) {
  return BING_LABELS.find(([min, max]) => score >= min && score <= max)?.[2] ?? 'UNCLASSIFIED';
}

function Hat({ lost = false }: { lost?: boolean }) {
  return <span className={`hat ${lost ? 'lost' : ''}`} aria-hidden="true"><i /></span>;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>('landing');
  const [gameMode, setGameMode] = useState<GameMode>('full');
  const [gameQuestions, setGameQuestions] = useState<Question[]>(FULL_QUESTIONS);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [lives, setLives] = useState(3);
  const [skips, setSkips] = useState(0);
  const [furthest, setFurthest] = useState(1);
  const [feedback, setFeedback] = useState('');
  const [locked, setLocked] = useState(false);
  const [rewritten, setRewritten] = useState(false);
  const [hotspotMisses, setHotspotMisses] = useState(0);
  const [hotspotLivesLost, setHotspotLivesLost] = useState(0);
  const [timer, setTimer] = useState(15);
  const [bingScore, setBingScore] = useState(0);
  const [bingSeconds, setBingSeconds] = useState(20);
  const [bestBing, setBestBing] = useState(0);
  const [golfPower, setGolfPower] = useState(0);
  const [failureType, setFailureType] = useState('THE RULES');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [challenge, setChallenge] = useState<{ score: number; bing: number } | null>(null);
  const activeInjunctionMetric = readMetric('activeInjunctions');
  const [copied, setCopied] = useState(false);
  const [shareVariant, setShareVariant] = useState(0);
  const [hasSave, setHasSave] = useState(false);
  const [testQuestionIndex, setTestQuestionIndex] = useState(3);
  const [testMode, setTestMode] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const bingAudio = useRef<HTMLAudioElement | null>(null);
  const bingScoreRef = useRef(0);
  const question = gameQuestions[questionIndex] ?? FULL_QUESTIONS[0];
  const liveMetric = readMetric(question.metricKey);

  const track = useCallback((event: string, data: Record<string, unknown> = {}) => {
    try {
      const events = JSON.parse(localStorage.getItem('tig_analytics') ?? '[]') as unknown[];
      localStorage.setItem('tig_analytics', JSON.stringify([...events.slice(-99), { event, ...data, at: Date.now() }]));
    } catch {}
  }, []);

  const tone = useCallback((frequency = 180, duration = 0.12, wave: OscillatorType = 'square') => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const AudioCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      const context = audioContext.current ?? new AudioCtor();
      audioContext.current = context;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = wave;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.09, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    } catch {
      // Sound is optional and must never block an answer transition.
    }
  }, [soundEnabled]);

  useEffect(() => {
    const storedSound = localStorage.getItem('tig_sound');
    const storedMotion = localStorage.getItem('tig_motion');
    const storedBest = Number(localStorage.getItem('tig_best_bing') ?? 0);
    if (storedSound !== null) setSoundEnabled(storedSound === 'true');
    if (storedMotion !== null) setReducedMotion(storedMotion === 'true');
    setBestBing(storedBest);
    setHasSave(Boolean(localStorage.getItem('tig_session')));
    const params = new URLSearchParams(window.location.search);
    if (params.has('beat')) setChallenge({ score: Number(params.get('beat') ?? 0), bing: Number(params.get('bing') ?? 0) });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register(publicPath('/service-worker.js')).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
    localStorage.setItem('tig_motion', String(reducedMotion));
  }, [reducedMotion]);

  useEffect(() => {
    localStorage.setItem('tig_sound', String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    const source = FULL_QUESTIONS.find((item) => item.type === 'bing')?.audio;
    if (!source?.onTargetClick) return;
    const audio = new Audio(publicPath(source.onTargetClick));
    audio.preload = 'auto';
    audio.volume = source.volume ?? 1;
    bingAudio.current = audio;
    return () => {
      audio.pause();
      bingAudio.current = null;
    };
  }, []);

  useEffect(() => {
    if (phase === 'landing') return;
    localStorage.setItem('tig_session', JSON.stringify({
      phase,
      gameMode,
      questionIds: gameQuestions.map((item) => item.id),
      questionIndex,
      lives,
      skips,
      furthest,
      bingScore,
    }));
  }, [phase, gameMode, gameQuestions, questionIndex, lives, skips, furthest, bingScore]);

  const begin = (mode: GameMode) => {
    const sequence = mode === 'short' ? createShortGame() : FULL_QUESTIONS;
    setTestMode(false);
    setGameMode(mode);
    setGameQuestions(sequence);
    setQuestionIndex(0);
    setLives(3);
    setSkips(0);
    setFurthest(1);
    setBingScore(0);
    bingScoreRef.current = 0;
    setFeedback('');
    setFailureType('THE RULES');
    setHasSave(true);
    track('game_start', { mode, questionCount: mode === 'short' ? 10 : 47 });
    tone(420, 0.16, 'sawtooth');
    enterQuestion(0, sequence);
  };

  const enterQuestion = useCallback((index: number, sequence = gameQuestions) => {
    const next = sequence[index];
    if (!next) return;
    setQuestionIndex(index);
    setFurthest((value) => Math.max(value, next.number));
    setFeedback('');
    setLocked(false);
    setRewritten(false);
    setHotspotMisses(0);
    setHotspotLivesLost(0);
    setTimer(next.timerSeconds ?? 15);
    setGolfPower(0);
    if (next.type === 'bing') {
      setBingScore(0);
      bingScoreRef.current = 0;
      setBingSeconds(next.timerSeconds ?? 20);
      setPhase('bing');
      track('minigame_start', { type: 'bing' });
    } else if (next.type === 'golf') {
      setPhase('golf');
      track('minigame_start', { type: 'golf' });
    } else {
      setPhase('question');
      track('question_view', { question: next.number, type: next.type });
    }
  }, [gameQuestions, track]);

  const startTestQuestion = () => {
    setTestMode(true);
    setGameMode('full');
    setGameQuestions(FULL_QUESTIONS);
    setLives(3);
    setSkips(2);
    setFurthest(FULL_QUESTIONS[testQuestionIndex].number);
    setBingScore(0);
    setFeedback('');
    enterQuestion(testQuestionIndex, FULL_QUESTIONS);
  };

  const gameOver = useCallback((reason: string) => {
    setFailureType(reason);
    setShareVariant(Math.floor(Math.random() * 3));
    setPhase('gameover');
    track('game_over', { furthestQuestion: furthest, failureType: reason, bingScore });
    tone(85, 0.7, 'sawtooth');
  }, [bingScore, furthest, tone, track]);

  const loseLife = useCallback((reason: string, message: string) => {
    if (locked) return;
    setLocked(true);
    const remaining = lives - 1;
    setLives(remaining);
    setFailureType(reason);
    setFeedback(message);
    track('life_lost', { question: question.number, reason });
    tone(95, 0.38, 'square');
    if (remaining <= 0) {
      window.setTimeout(() => gameOver(reason), 850);
    } else {
      window.setTimeout(() => {
        setLocked(false);
        setFeedback('');
      }, 950);
    }
  }, [gameOver, lives, locked, question.number, tone, track]);

  const advance = useCallback(() => {
    const nextIndex = questionIndex + 1;
    if (AD_BREAK_AFTER_QUESTIONS.has(question.number)) {
      setPhase('ad');
      setFeedback('');
      track('ad_break_shown', { afterQuestion: question.number });
      return;
    }
    if (nextIndex >= gameQuestions.length) {
      gameOver('EXECUTIVE PRIVILEGE');
      return;
    }
    enterQuestion(nextIndex);
  }, [enterQuestion, gameOver, gameQuestions.length, question.number, questionIndex, track]);

  const correct = (message: string, grantSkip = false) => {
    if (locked) return;
    setLocked(true);
    setFeedback(message);
    if (grantSkip) {
      setSkips((value) => value + 1);
      track('skip_collected');
    }
    window.setTimeout(advance, 3200);
    tone(660, 0.12, 'square');
  };

  const answer = (index: number) => {
    if (locked || !question.choices) return;
    track('answer_selected', { question: question.number, answerIndex: index });
    if (question.type === 'final') {
      setLocked(true);
      setFeedback(question.feedback[index]);
      tone(index === 3 ? 720 : 110, 0.45, 'sawtooth');
      window.setTimeout(() => gameOver(index === 2 ? 'PERMANENT INJUNCTION' : 'TRANSITION MALFUNCTION'), 1000);
      return;
    }
    if (question.type === 'injunction' && !rewritten) {
      setFeedback('🔨 NATIONWIDE INJUNCTION! THE ANSWERS HAVE BEEN REWRITTEN.');
      setRewritten(true);
      tone(120, 0.35, 'square');
      window.setTimeout(() => setFeedback(''), 1100);
      return;
    }
    if (question.type === 'taco' && index === (question.trapIndex ?? 1)) {
      setFeedback(question.feedback[index]);
      setFailureType('TACO TRAP');
      tone(220, 0.45, 'sawtooth');
      window.setTimeout(() => enterQuestion(Math.max(0, questionIndex - (question.backtrackBy ?? 5))), 1100);
      return;
    }
    if (index === question.correctIndex) {
      correct(question.feedback[index], question.grantSkip);
    } else {
      loseLife(question.type === 'live' ? 'LIVE DATA' : 'WRONG ANSWER', question.feedback[index]);
    }
  };

  useEffect(() => {
    if (phase !== 'question' || !locked) return;
    const recovery = window.setTimeout(() => {
      setLocked(false);
      if (!feedback) setFeedback(jokesData.recoveryMessages[0] ?? 'THE BUTTONS HAVE BEEN RELEASED BY COURT ORDER. TRY AGAIN.');
    }, 1800);
    return () => window.clearTimeout(recovery);
  }, [feedback, locked, phase]);

  const hotspotHit = (event: React.PointerEvent) => {
    event.stopPropagation();
    correct('YOU FOUND THE TINY RIGGED ESCAPE HATCH.');
  };

  const hotspotMiss = () => {
    if (locked) return;
    const next = hotspotMisses + 1;
    setHotspotMisses(next);
    setFeedback(`MISS ${next}/3 — THE PIXELS ARE UNDER INVESTIGATION.`);
    tone(130, 0.08, 'square');
    const clicksBeforeLoss = question.missRules?.clicksBeforeLifeLoss ?? 3;
    const maxLivesLost = question.missRules?.maxLivesLost ?? 1;
    if (next >= clicksBeforeLoss && hotspotLivesLost < maxLivesLost) {
      setHotspotMisses(0);
      setHotspotLivesLost((value) => value + 1);
      loseLife('RANDOM CLICKING', 'THREE MISSES. ONE MAGA HAT CONFISCATED.');
    }
  };

  useEffect(() => {
    if (phase !== 'question' || question.type !== 'hotspot' || locked) return;
    const id = window.setInterval(() => {
      setTimer((value) => {
        if (value <= 1) {
          window.clearInterval(id);
          loseLife('TIME EXPIRED', 'THE POLL CLOSED WHILE YOU WERE STILL LOOKING.');
          return question.timerSeconds ?? 15;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [locked, loseLife, phase, question.type]);

  useEffect(() => {
    if (phase !== 'bing') return;
    const id = window.setInterval(() => {
      setBingSeconds((value) => {
        if (value <= 1) {
          window.clearInterval(id);
          const finalScore = bingScoreRef.current;
          const nextBest = Math.max(bestBing, finalScore);
          setBestBing(nextBest);
          localStorage.setItem('tig_best_bing', String(nextBest));
          track('bing_score', { score: finalScore });
          window.setTimeout(advance, 700);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [advance, bestBing, phase, track]);

  const bing = () => {
    setBingScore((value) => {
      bingScoreRef.current = value + 1;
      return value + 1;
    });
    if (soundEnabled && bingAudio.current) {
      bingAudio.current.currentTime = 0;
      void bingAudio.current.play().catch(() => {});
    }
  };

  const launchGolf = () => {
    track('minigame_complete', { type: 'golf', power: golfPower });
    if (golfPower >= (question.golfTargetPower ?? 70)) {
      setFeedback('PERFECT! STRAIGHT INTO THE TREES. ADVANCE IMMEDIATELY.');
      tone(620, 0.3, 'triangle');
      window.setTimeout(advance, 3200);
    } else {
      loseLife('THE FAIRWAY', 'DISASTER! YOU HIT THE FAIRWAY LIKE THE INSTRUCTIONS SAID.');
      setGolfPower(0);
    }
  };

  const useSkip = () => {
    if (skips < 1 || locked) return;
    if (question.type === 'final') {
      setSkips((value) => value - 1);
      setFeedback('SKIP DENIED BY EXECUTIVE PRIVILEGE!');
      setLocked(true);
      tone(90, 0.5, 'square');
      window.setTimeout(() => gameOver('SKIP DENIED'), 900);
      return;
    }
    setSkips((value) => value - 1);
    track('skip_used', { question: question.number });
    advance();
  };

  const shareText = useMemo(() => {
    const templates = furthest <= 3
      ? jokesData.shareTemplates.early
      : furthest >= 8
        ? jokesData.shareTemplates.late
        : jokesData.shareTemplates.default;
    const template = templates[shareVariant] ?? templates[0];
    return template
      .replace('{question}', String(furthest))
      .replace('{failureType}', failureType)
      .replace('{bingScore}', String(bingScore));
  }, [bingScore, failureType, furthest, shareVariant]);

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}?beat=${furthest}&bing=${bingScore}`;
    track('share_clicked');
    if (navigator.share) {
      try {
        await navigator.share({ title: "Trump's Impossible Game", text: shareText, url });
        return;
      } catch {}
    }
    await navigator.clipboard.writeText(`${shareText} ${url}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const resume = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('tig_session') ?? '{}') as {
        gameMode?: GameMode;
        questionIds?: string[];
        questionIndex?: number;
        lives?: number;
        skips?: number;
        bingScore?: number;
      };
      if (typeof saved.questionIndex !== 'number') return;
      const mode = saved.gameMode === 'short' ? 'short' : 'full';
      const savedSequence = saved.questionIds
        ?.map((id) => FULL_QUESTIONS.find((item) => item.id === id))
        .filter((item): item is Question => Boolean(item));
      const sequence = savedSequence?.length
        ? savedSequence.map((item, index) => mode === 'short' ? { ...item, number: index + 1 } : item)
        : FULL_QUESTIONS;
      setGameMode(mode);
      setGameQuestions(sequence);
      setLives(saved.lives ?? 3);
      setSkips(saved.skips ?? 0);
      setBingScore(saved.bingScore ?? 0);
      enterQuestion(Math.min(saved.questionIndex, sequence.length - 1), sequence);
    } catch {
      setPhase('landing');
    }
  };

  if (phase === 'landing') {
    return (
      <main className="landing">
        <div className="stars" aria-hidden="true">★ ★ ★ ★ ★</div>
        <section className="title-card">
          <div className="top-secret">ABSOLUTELY CLASSIFIED</div>
          <p className="eyebrow">A DELIBERATELY RIGGED POLITICAL PARODY</p>
          <h1><span>TRUMP&apos;S</span> IMPOSSIBLE GAME</h1>
          <p className="promise">THE GAME IS RIGGED. THE ANSWERS CHANGE.<br />FACTS DON&apos;T HELP. GOOD LUCK.</p>
          {challenge && <div className="challenge">A FRIEND REACHED Q{challenge.score} WITH {challenge.bing} BINGS. HUMILIATE THEM.</div>}
          <div className="game-mode-picker" role="group" aria-label="Choose game length">
            <p>CHOOSE YOUR PRESIDENTIAL TERM</p>
            <div>
              <button className="begin-button mode-button" type="button" onClick={() => begin('short')}>
                <strong>10 QUESTIONS</strong><span>QUICK CHAOS</span>
              </button>
              <button className="secondary-button mode-button" type="button" onClick={() => begin('full')}>
                <strong>47 QUESTIONS</strong><span>THE FULL DISASTER</span>
              </button>
            </div>
          </div>
          {hasSave && <button className="text-button" type="button" onClick={resume}>RESUME THE INVESTIGATION</button>}
          <div className="landing-controls">
            <button type="button" aria-pressed={!soundEnabled} onClick={() => setSoundEnabled((value) => !value)}>{soundEnabled ? '🔊 SOUND ON' : '🔇 SOUND OFF'}</button>
            <button type="button" aria-pressed={reducedMotion} onClick={() => setReducedMotion((value) => !value)}>{reducedMotion ? '✓ REDUCED MOTION' : 'REDUCE MOTION'}</button>
          </div>
          <div className="test-panel">
            <label htmlFor="test-question">{jokesData.labels.testMode}</label>
            <div>
              <select id="test-question" value={testQuestionIndex} onChange={(event) => setTestQuestionIndex(Number(event.target.value))}>
                {FULL_QUESTIONS.map((item, index) => <option key={item.id} value={index}>{item.number > 47 ? jokesData.labels.rotatingPrefix : 'Q'}{item.number}: {item.type}</option>)}
              </select>
              <button type="button" onClick={startTestQuestion}>{jokesData.labels.testButton}</button>
            </div>
          </div>
          <p className="fine-print">Independent parody/satire. Not affiliated with any person, campaign, broadcaster or game studio.<br />Contains mild flashing and shaking effects; use Reduced Motion to disable them.</p>
        </section>
        <div className="ticker" aria-hidden="true"><span>{jokesData.tickerHeadlines[0] ?? executiveMetricsData.tickerHeadline}</span></div>
      </main>
    );
  }

  if (phase === 'gameover') {
    return (
      <main className="result-shell">
        <section className="result-card" aria-label="Game result">
          <div className="breaking">BREAKING</div>
          <p>EXECUTIVE GAME NETWORK</p>
          <h1>PLAYER COLLAPSES AT QUESTION {furthest}</h1>
          <dl>
            <div><dt>CAUSE OF DEFEAT</dt><dd>{failureType}</dd></div>
            <div><dt>LIVES LOST</dt><dd>{3 - lives}</dd></div>
            <div><dt>BING SCORE</dt><dd>{bingScore}</dd></div>
            <div><dt>CLASSIFICATION</dt><dd>{bingLabel(bingScore)}</dd></div>
          </dl>
          <blockquote>“{shareText}”</blockquote>
        </section>
        <div className="result-actions">
          <button className="begin-button" type="button" onClick={share}>{copied ? 'RESULT COPIED!' : 'SHARE THE HUMILIATION'}</button>
          <button className="secondary-button" type="button" onClick={() => setPhase('landing')}>DEMAND AN AUDIT & PLAY AGAIN</button>
        </div>
      </main>
    );
  }

  const hud = (
    <header className="game-hud">
      <span className="hud-label">QUESTION {question.number} / {gameMode === 'short' ? 10 : 47} {testMode && '• TEST MODE'}</span>
      <span aria-label={`${lives} lives remaining`} className="lives">
        {[0, 1, 2].map((index) => <Hat key={index} lost={index >= lives} />)}
      </span>
      <div className="hud-tools">
        <button type="button" className="skip-button" disabled={!skips} onClick={useSkip}>➜ SKIP × {skips}</button>
        <button type="button" aria-label={soundEnabled ? 'Mute sound' : 'Turn on sound'} onClick={() => setSoundEnabled((value) => !value)}>{soundEnabled ? '🔊' : '🔇'}</button>
        <button type="button" aria-label="Toggle reduced motion" aria-pressed={reducedMotion} onClick={() => setReducedMotion((value) => !value)}>◫</button>
      </div>
    </header>
  );

  if (phase === 'ad') {
    return (
      <main className="game-shell">
        {hud}
        <section
          className="commercial commercial-clickable"
          role="button"
          tabIndex={0}
          aria-label="Continue to the next question"
          onClick={() => enterQuestion(questionIndex + 1)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              enterQuestion(questionIndex + 1);
            }
          }}
        >
          <p className="commercial-kicker">A WORD FROM A COMPLETELY FICTIONAL CAR COMPANY</p>
          <div className="computer-car-ad">
            <img
              src={publicPath('/assets/images/computer-car-commercial.webp')}
              alt="A ridiculous fictional gold and red luxury car covered in old computers, keyboards, cables and satellite dishes"
            />
            <div className="computer-car-copy">
              <span>INTRODUCING THE EXECU-COMPUTER 47</span>
              <h1>ITS GOT COMPUTER</h1>
              <p>WHY THINK WHEN YOUR CAR CAN ALMOST DO IT FOR YOU?</p>
            </div>
          </div>
          <p className="ad-countdown">TAP OR CLICK ANYWHERE TO CONTINUE</p>
        </section>
      </main>
    );
  }

  if (phase === 'bing') {
    return (
      <main className="game-shell bing-shell">
        {hud}
        <section className="minigame-card">
          <p className="eyebrow">{question.kicker}</p>
          <div className="score-strip"><span>TIME {bingSeconds}</span><strong>{bingScore} BINGS</strong><span>BEST {bestBing}</span></div>
          <h1>{question.prompt}</h1>
          <button className="bing-target" type="button" onPointerDown={bing} aria-label="Tap to score a BING">
            <span className="hair" aria-hidden="true" />
            <span className="face" aria-hidden="true"><i className="mouth">BING!</i></span>
          </button>
          <p className="classification">{bingLabel(bingScore)}</p>
        </section>
      </main>
    );
  }

  if (phase === 'golf') {
    return (
      <main className="game-shell">
        {hud}
        <section className="minigame-card golf-card">
          <p className="eyebrow">{question.kicker}</p>
          <h1>{question.prompt}</h1>
          <div className="golf-scene" aria-hidden="true"><span className="trees">♠ ♠ ♠</span><span className="flag">⚑</span><span className="ball" style={{ left: `${10 + golfPower * 0.7}%` }}>●</span></div>
          <div className="power-meter"><i style={{ width: `${golfPower}%` }} /></div>
          <div className="minigame-actions">
            <button type="button" onPointerDown={() => { setGolfPower((value) => Math.min(100, value + 9)); tone(220 + golfPower * 3, 0.04, 'square'); }}>PUMP THE SWING</button>
            <button type="button" onClick={launchGolf}>LAUNCH!</button>
          </div>
          {feedback && <div className="feedback">{feedback}</div>}
        </section>
      </main>
    );
  }

  const choices = rewritten && question.rewrittenChoices ? question.rewrittenChoices : question.choices;
  return (
    <main className={`game-shell ${feedback ? 'has-feedback' : ''}`}>
      {hud}
      <section className="question-card">
        <div className="question-meta">
          <p className="eyebrow">{question.kicker}</p>
          {question.type === 'hotspot' && <strong className="timer">00:{String(timer).padStart(2, '0')}</strong>}
          {question.type === 'live' && <span className="live-pill">● LIVE • UPDATED TODAY</span>}
        </div>
        <h1>{question.prompt}</h1>
        {question.type === 'hotspot' ? (
          <div className="hotspot-stage" onPointerDown={hotspotMiss}>
            <div className="poll-bar"><i style={{ width: '73%' }} /><span>73% ABSOLUTELY NOT RIGGED</span></div>
            <div className="poll-bar"><i style={{ width: '91%' }} /><span>91% OTHER NUMBER</span></div>
            <button
              className={`rigged-hotspot ${testMode ? 'test-visible' : ''}`}
              style={{
                left: `${question.hotspot?.xPct ?? 83}%`,
                top: `${question.hotspot?.yPct ?? 14}%`,
                width: `${question.hotspot?.widthPct ?? 8}%`,
                height: `${question.hotspot?.heightPct ?? 10}%`,
              }}
              type="button"
              onPointerDown={hotspotHit}
            >
              {testMode ? 'RIGGED TARGET' : 'RIGGED'}
            </button>
            <p>Tap the screen. {question.missRules?.clicksBeforeLifeLoss ?? 3} misses cost one hat.</p>
          </div>
        ) : (
          <div className="answer-grid">
            {choices?.map((choice, index) => (
              <button key={choice} type="button" aria-disabled={locked} onClick={() => answer(index)}>
                <span className="answer-letter">{String.fromCharCode(65 + index)}</span>
                <span className="answer-copy">{question.type === 'live' && index === question.correctIndex ? liveMetric : choice}</span>
              </button>
            ))}
          </div>
        )}
        {feedback && <div className={`feedback ${feedback.includes('CORRECT') || feedback.includes('FOUND') ? 'success' : ''}`}>{feedback}</div>}
      </section>
      <aside className="status-ticker">FURTHEST: Q{furthest} • BING PB: {bestBing} • LIVE INJUNCTIONS: {activeInjunctionMetric}</aside>
    </main>
  );
}
