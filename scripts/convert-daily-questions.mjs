import { readFile, writeFile } from 'node:fs/promises';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error('Usage: node scripts/convert-daily-questions.mjs <input.json> <output.json>');

const oldQuestions = JSON.parse(await readFile(inputPath, 'utf8'));
const excludedTypes = new Set(['hotspot', 'bing', 'golf', 'final']);
const liveAnswers = {
  inflation_yoy_pct: '3.7%',
  egg_price_change_since_jan_2025_pct: 'Down about 54.1%',
  regular_gas_price_change_since_inauguration_pct: 'Up about 37.8%',
  real_average_worker_annual_change_usd: 'Up about $630 per year',
};

const converted = oldQuestions
  .filter((question) => !excludedTypes.has(question.type))
  .filter((question) => Array.isArray(question.choices) && question.choices.length === 4)
  .filter((question) => Number.isInteger(question.correctIndex) && question.correctIndex >= 0 && question.correctIndex < 4)
  .map((question, index) => {
    const choices = [...question.choices];
    if (question.type === 'live' && liveAnswers[question.metricKey]) choices[question.correctIndex] = liveAnswers[question.metricKey];
    return {
      id: question.id,
      number: index + 1,
      type: question.type === 'live' ? 'live' : 'standard',
      enabled: true,
      kicker: question.kicker,
      prompt: question.prompt,
      choices,
      correctIndex: question.correctIndex,
      feedback: question.feedback,
      sources: question.sources,
      ...(question.type === 'live' && question.metricKey ? { metricKey: question.metricKey } : {}),
    };
  });

await writeFile(outputPath, `${JSON.stringify(converted, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ input: oldQuestions.length, output: converted.length, removed: oldQuestions.length - converted.length }, null, 2));
