'use client';

export type DayResult = { answers: boolean[]; completedAt: string; questionIds: string[]; score: number };
export type WeekProgress = { foundAtTiles?: number; foundTrump: boolean; guessDates: string[]; revealedTiles: number[]; totalCorrect: number };
export type PlayerState = {
  bestStreak: number;
  currentStreak: number;
  days: Record<string, DayResult>;
  lastPlayedDate?: string;
  perfectDays: number;
  successfulFinds: number;
  totalFindTiles: number;
  totalTrumpGuesses: number;
  weeks: Record<string, WeekProgress>;
};

export const EMPTY_PLAYER_STATE: PlayerState = {
  bestStreak: 0, currentStreak: 0, days: {}, perfectDays: 0,
  successfulFinds: 0, totalFindTiles: 0, totalTrumpGuesses: 0, weeks: {},
};

const DB_NAME = 'trumps-impossible-daily';
const STORE_NAME = 'player-state';
const PLAYER_KEY = 'local-player';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadPlayerState(): Promise<PlayerState> {
  try {
    const database = await openDatabase();
    const value = await new Promise<PlayerState | undefined>((resolve, reject) => {
      const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).get(PLAYER_KEY);
      request.onsuccess = () => resolve(request.result as PlayerState | undefined);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return value ? { ...EMPTY_PLAYER_STATE, ...value } : structuredClone(EMPTY_PLAYER_STATE);
  } catch {
    const fallback = localStorage.getItem(DB_NAME);
    return fallback ? { ...EMPTY_PLAYER_STATE, ...JSON.parse(fallback) as PlayerState } : structuredClone(EMPTY_PLAYER_STATE);
  }
}

export async function savePlayerState(state: PlayerState): Promise<void> {
  localStorage.setItem(DB_NAME, JSON.stringify(state));
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(state, PLAYER_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    database.close();
  } catch {
    // localStorage already contains a compact fallback copy.
  }
}

export async function requestPersistentStorage(): Promise<void> {
  try { await navigator.storage?.persist?.(); } catch { /* Persistence is only a browser hint. */ }
}
