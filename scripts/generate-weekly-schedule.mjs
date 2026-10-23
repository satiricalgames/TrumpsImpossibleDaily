import { readFile, writeFile } from 'node:fs/promises';

const [questionsPath = 'content/questions.json', weeklyPath = 'content/weekly_game.json', weekStart = '2026-10-19'] = process.argv.slice(2);
const questions = JSON.parse(await readFile(questionsPath, 'utf8'));
const weekly = JSON.parse(await readFile(weeklyPath, 'utf8'));
const eligible = questions.filter((question) => question.enabled !== false && Array.isArray(question.choices) && question.choices.length === 4 && Number.isInteger(question.correctIndex) && question.correctIndex >= 0 && question.correctIndex < 4);
if (eligible.length < 35) throw new Error(`At least 35 enabled questions are required; found ${eligible.length}.`);

function hash(text) {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}
function shuffled(items, seedText) {
  let seed = hash(seedText);
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const other = seed % (index + 1);
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const selected = shuffled(eligible, weekStart).slice(0, 35);
weekly.weekStart = weekStart;
weekly.dailyQuestionIds = Object.fromEntries(days.map((day, index) => [day, selected.slice(index * 5, index * 5 + 5).map((question) => question.id)]));
await writeFile(weeklyPath, `${JSON.stringify(weekly, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ weekStart, available: eligible.length, scheduled: selected.length, unique: new Set(selected.map((question) => question.id)).size }, null, 2));
