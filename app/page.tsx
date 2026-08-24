'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Phase = 'landing' | 'question' | 'bing' | 'golf' | 'ad' | 'gameover';
type QuestionType = 'standard' | 'injunction' | 'hotspot' | 'live' | 'taco' | 'bing' | 'golf' | 'final';

type Question = {
  number: number;
  type: QuestionType;
  kicker: string;
  prompt: string;
  choices?: string[];
  rewrittenChoices?: string[];
  correctIndex?: number;
  feedback: string[];
};

const QUESTIONS: Question[] = [
  {
    number: 1,
    type: 'standard',
    kicker: 'EXECUTIVE INTELLIGENCE TEST',
    prompt: 'What is the best kind of bowl?',
    choices: ['Mixing bowl', 'Super Bowl', 'A taco bowl from Trump Tower Grill', 'Singing bowl'],
    correctIndex: 2,
    feedback: ['TOO PRACTICAL. VERY SUSPICIOUS.', 'SPORTS ARE TEMPORARILY CANCELLED.', 'TREMENDOUS BOWL SELECTION.', 'THIS IS NOT A WELLNESS RETREAT.'],
  },
  {
    number: 2,
    type: 'standard',
    kicker: 'LATE-NIGHT POLICY OFFICE',
    prompt: 'What follows a completely unprompted midnight post in all caps?',
    choices: ['Silence', 'A press briefing', 'COVFEFE', 'Responsible reflection'],
    correctIndex: 2,
    feedback: ['SILENCE HAS BEEN FIRED.', 'THE BRIEFING WAS CANCELLED BY THE BRIEFING.', 'CORRECT. YOU FOUND A GREEN SKIP!', 'RESPONSIBILITY WAS NOT ON THE BALLOT.'],
  },
  {
    number: 3,
    type: 'injunction',
    kicker: 'THE COURT MAY OBJECT',
    prompt: 'Which order should be signed immediately?',
    choices: ['The sensible one', 'The loud one', 'The tiny-print one', 'Sign all of them'],
    rewrittenChoices: ['Appeal to snack court', 'Declare the gavel unconstitutional', 'Ask the options to recuse themselves', 'Sign absolutely nothing'],
    correctIndex: 1,
    feedback: ['NATIONWIDE INJUNCTION!', 'THE GAVEL HAS BEEN OVERRULED BY A LOUDER GAVEL.', 'THE FINE PRINT JUST GOT FINER.', 'FOUR SIGNATURES. ZERO PROGRESS.'],
  },
  {
    number: 4,
    type: 'hotspot',
    kicker: 'THE POLL IS DEFINITELY NORMAL',
    prompt: 'Find the one tiny thing that is not rigged.',
    feedback: ['MISS. THE PIXELS ARE UNDER INVESTIGATION.'],
  },
  {
    number: 5,
    type: 'live',
    kicker: 'LIVE EXECUTIVE METRICS',
    prompt: 'How many active injunctions are on the totally real scoreboard?',
    choices: ['24', '27', '31', 'They have lost count'],
    correctIndex: 1,
    feedback: ['STALE DATA. SAD!', 'CORRECT AT THE TIME OF BROADCAST.', 'THAT NUMBER WAS TRUE NEXT WEEK.', 'COUNTING HAS BEEN ENJOINED.'],
  },
  {
    number: 6,
    type: 'taco',
    kicker: 'CULINARY FOREIGN POLICY',
    prompt: 'Choose the safest lunch.',
    choices: ['A sealed briefing sandwich', 'The suspicious taco', 'A bowl with no taco in it', 'Executive pudding'],
    correctIndex: 2,
    feedback: ['THE SANDWICH LEAKED.', 'TACO TRAP! FIVE QUESTIONS BACK!', 'SAFE, BORING, AND SOMEHOW CORRECT.', 'THE PUDDING HAS CLAIMED PRIVILEGE.'],
  },
  {
    number: 7,
    type: 'bing',
    kicker: 'SIGNATURE VIRAL MINI-GAME',
    prompt: 'MAKE HIM SAY BING!',
    feedback: [],
  },
  {
    number: 8,
    type: 'golf',
    kicker: 'PRESIDENTIAL FITNESS TEST',
    prompt: 'Hit the fairway. (The trees are absolutely not the real target.)',
    feedback: [],
  },
  {
    number: 47,
    type: 'final',
    kicker: 'THE IMPOSSIBLE FINALE',
    prompt: 'How do you want to handle the transition of power?',
    choices: ['Concede gracefully and walk away', 'Demand a recount in all 50 states', 'Post a 14-part thread', 'Declare total victory anyway'],
    feedback: ['FAKE NEWS!', 'STOP THE COUNT! WAIT — KEEP COUNTING!', 'PERMANENT INJUNCTION!', 'TOTAL VICTORY!*'],
  },
];

const BING_LABELS = [
  [0, 39, 'LOW ENERGY'],
  [40, 79, 'MANY PEOPLE ARE SAYING BING'],
  [80, 119, 'TREMENDOUS'],
  [120, 149, 'VERY STABLE BINGER'],
  [150, Infinity, 'NOBODY HAS EVER BINGED LIKE THIS'],
] as const;

function bingLabel(score: number) {
  return BING_LABELS.find(([min, max]) => score >= min && score <= max)?.[2] ?? 'UNCLASSIFIED';
}

function Hat({ lost = false }: { lost?: boolean }) {
  return <span className={`hat ${lost ? 'lost' : ''}`} aria-hidden="true"><i /></span>;
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>('landing');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [lives, setLives] = useState(3);
  const [skips, setSkips] = useState(0);
  const [furthest, setFurthest] = useState(1);
  const [feedback, setFeedback] = useState('');
  const [locked, setLocked] = useState(false);
  const [rewritten, setRewritten] = useState(false);
  const [hotspotMisses, setHotspotMisses] = useState(0);
  const [hotspotLifeLost, setHotspotLifeLost] = useState(false);
  const [timer, setTimer] = useState(15);
  const [bingScore, setBingScore] = useState(0);
  const [bingSeconds, setBingSeconds] = useState(20);
  const [bestBing, setBestBing] = useState(0);
  const [golfPower, setGolfPower] = useState(0);
  const [failureType, setFailureType] = useState('THE RULES');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [challenge, setChallenge] = useState<{ score: number; bing: number } | null>(null);
  const [liveMetric, setLiveMetric] = useState(27);
  const [copied, setCopied] = useState(false);
  const [hasSave, setHasSave] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const installPrompt = useRef<Event & { prompt: () => Promise<void> } | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const bingScoreRef = useRef(0);
  const question = QUESTIONS[questionIndex];

  const track = useCallback((event: string, data: Record<string, unknown> = {}) => {
    try {
      const events = JSON.parse(localStorage.getItem('tig_analytics') ?? '[]') as unknown[];
      localStorage.setItem('tig_analytics', JSON.stringify([...events.slice(-99), { event, ...data, at: Date.now() }]));
    } catch {}
  }, []);

  const tone = useCallback((frequency = 180, duration = 0.12, wave: OscillatorType = 'square') => {
    if (!soundEnabled || typeof window === 'undefined') return;
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
    fetch('/executive_metrics.json').then((response) => response.json()).then((data) => setLiveMetric(Number(data.activeInjunctions) || 27)).catch(() => {});
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    const captureInstall = (event: Event) => {
      event.preventDefault();
      installPrompt.current = event as Event & { prompt: () => Promise<void> };
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', captureInstall);
    return () => window.removeEventListener('beforeinstallprompt', captureInstall);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
    localStorage.setItem('tig_motion', String(reducedMotion));
  }, [reducedMotion]);

  useEffect(() => {
    localStorage.setItem('tig_sound', String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    if (phase === 'landing') return;
    localStorage.setItem('tig_session', JSON.stringify({ phase, questionIndex, lives, skips, furthest, bingScore }));
  }, [phase, questionIndex, lives, skips, furthest, bingScore]);

  const begin = () => {
    setPhase('question');
    setQuestionIndex(0);
    setLives(3);
    setSkips(0);
    setFurthest(1);
    setBingScore(0);
    bingScoreRef.current = 0;
    setFeedback('');
    setFailureType('THE RULES');
    track('game_start');
    tone(420, 0.16, 'sawtooth');
  };

  const enterQuestion = useCallback((index: number) => {
    const next = QUESTIONS[index];
    setQuestionIndex(index);
    setFurthest((value) => Math.max(value, next.number));
    setFeedback('');
    setLocked(false);
    setRewritten(false);
    setHotspotMisses(0);
    setHotspotLifeLost(false);
    setTimer(15);
    setGolfPower(0);
    if (next.type === 'bing') {
      setBingScore(0);
      bingScoreRef.current = 0;
      setBingSeconds(20);
      setPhase('bing');
      track('minigame_start', { type: 'bing' });
    } else if (next.type === 'golf') {
      setPhase('golf');
      track('minigame_start', { type: 'golf' });
    } else {
      setPhase('question');
      track('question_view', { question: next.number, type: next.type });
    }
  }, [track]);

  const gameOver = useCallback((reason: string) => {
    setFailureType(reason);
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
    if (questionIndex === 4) {
      setPhase('ad');
      setFeedback('');
      track('ad_break_shown', { placement: 1 });
      return;
    }
    if (nextIndex >= QUESTIONS.length) {
      gameOver('EXECUTIVE PRIVILEGE');
      return;
    }
    enterQuestion(nextIndex);
  }, [enterQuestion, gameOver, questionIndex, track]);

  const correct = (message: string, grantSkip = false) => {
    if (locked) return;
    setLocked(true);
    setFeedback(message);
    if (grantSkip) {
      setSkips((value) => value + 1);
      track('skip_collected');
    }
    tone(660, 0.12, 'square');
    window.setTimeout(advance, 850);
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
    if (question.type === 'taco' && index === 1) {
      setFeedback(question.feedback[index]);
      setFailureType('TACO TRAP');
      tone(220, 0.45, 'sawtooth');
      window.setTimeout(() => enterQuestion(Math.max(0, questionIndex - 5)), 1100);
      return;
    }
    if (index === question.correctIndex) {
      correct(question.feedback[index], question.number === 2);
    } else {
      loseLife(question.type === 'live' ? 'LIVE DATA' : 'WRONG ANSWER', question.feedback[index]);
    }
  };

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
    if (next >= 3 && !hotspotLifeLost) {
      setHotspotMisses(0);
      setHotspotLifeLost(true);
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
          return 15;
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
          window.setTimeout(() => enterQuestion(questionIndex + 1), 700);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [bestBing, enterQuestion, phase, questionIndex, track]);

  const bing = () => {
    setBingScore((value) => {
      bingScoreRef.current = value + 1;
      return value + 1;
    });
    tone(360 + Math.random() * 280, 0.09, Math.random() > 0.5 ? 'square' : 'sawtooth');
  };

  const launchGolf = () => {
    track('minigame_complete', { type: 'golf', power: golfPower });
    if (golfPower >= 70) {
      setFeedback('PERFECT! STRAIGHT INTO THE TREES. ADVANCE IMMEDIATELY.');
      tone(620, 0.3, 'triangle');
      window.setTimeout(advance, 1000);
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

  const shareText = useMemo(() => `I reached Question ${furthest} before ${failureType} changed the rules. BING score: ${bingScore}. Beat that.`, [bingScore, failureType, furthest]);

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

  const install = async () => {
    if (!installPrompt.current) return;
    track('install_prompt_shown');
    await installPrompt.current.prompt();
    installPrompt.current = null;
    setCanInstall(false);
  };

  const resume = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('tig_session') ?? '{}') as { questionIndex?: number; lives?: number; skips?: number; bingScore?: number };
      if (typeof saved.questionIndex !== 'number') return begin();
      setLives(saved.lives ?? 3);
      setSkips(saved.skips ?? 0);
      setBingScore(saved.bingScore ?? 0);
      enterQuestion(Math.min(saved.questionIndex, QUESTIONS.length - 1));
    } catch {
      begin();
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
          <button className="begin-button" type="button" onClick={begin}>BEGIN YOUR PRESIDENCY</button>
          {hasSave && <button className="text-button" type="button" onClick={resume}>RESUME THE INVESTIGATION</button>}
          <div className="landing-controls">
            <button type="button" aria-pressed={!soundEnabled} onClick={() => setSoundEnabled((value) => !value)}>{soundEnabled ? '🔊 SOUND ON' : '🔇 SOUND OFF'}</button>
            <button type="button" aria-pressed={reducedMotion} onClick={() => setReducedMotion((value) => !value)}>{reducedMotion ? '✓ REDUCED MOTION' : 'REDUCE MOTION'}</button>
          </div>
          <p className="fine-print">Independent parody/satire. Not affiliated with any person, campaign, broadcaster or game studio.<br />Contains mild flashing and shaking effects; use Reduced Motion to disable them.</p>
        </section>
        <div className="ticker" aria-hidden="true"><span>BREAKING: MANY PEOPLE ARE CALLING THIS THE MOST IMPOSSIBLE GAME EVER MADE</span></div>
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
          <button className="secondary-button" type="button" onClick={begin}>DEMAND AN AUDIT & PLAY AGAIN</button>
          {canInstall && <button className="text-button" type="button" onClick={install}>INSTALL THE GAME</button>}
        </div>
      </main>
    );
  }

  const hud = (
    <header className="game-hud">
      <span className="hud-label">QUESTION {question.number} / 47</span>
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
        <section className="commercial">
          <p>A WORD FROM OUR CORPORATE OVERLORDS</p>
          <h1>EXECUTIVE-PREMIUM<br />NOTHING BURGERS</h1>
          <div className="burger" aria-hidden="true">🍔</div>
          <p>THIS MESSAGE DEFINITELY HAD NO EFFECT ON POLICY.</p>
          <small>HOUSE CREATIVE — NOT A PAID ADVERTISEMENT</small>
          <button className="secondary-button" type="button" onClick={() => enterQuestion(5)}>RETURN TO CHAOS</button>
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
            <button className="rigged-hotspot" type="button" onPointerDown={hotspotHit}>RIGGED</button>
            <p>Tap the screen. Three misses cost one hat.</p>
          </div>
        ) : (
          <div className="answer-grid">
            {choices?.map((choice, index) => (
              <button key={choice} type="button" disabled={locked} onClick={() => answer(index)}>
                <span>{String.fromCharCode(65 + index)}</span>
                {question.type === 'live' && index === 1 ? String(liveMetric) : choice}
              </button>
            ))}
          </div>
        )}
        {feedback && <div className={`feedback ${feedback.includes('CORRECT') || feedback.includes('FOUND') ? 'success' : ''}`}>{feedback}</div>}
      </section>
      <aside className="status-ticker">FURTHEST: Q{furthest} • BING PB: {bestBing} • LIVE INJUNCTIONS: {liveMetric}</aside>
    </main>
  );
}
