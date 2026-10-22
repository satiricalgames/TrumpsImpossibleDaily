# Trump’s Impossible Game AI Content Guide

Use this guide when asking an AI system to research or write content for the game. The AI must return valid JSON only when producing a replacement file. Do not include Markdown fences, commentary or citations outside the JSON.

## Non-negotiable research and sourcing rules

1. Browse the web for every question or joke that depends on a real event, statement, statistic, court action, policy, person, place or organisation.
2. Use the most direct source location available. Prefer the exact government document, official transcript, official post, court opinion, data page, first-party page or reputable article—not a search-results page or a publisher homepage.
3. Never invent a title, publisher, URL, quotation, statistic, date or source.
4. Open and verify every URL before returning it. The page must support the specific reference described in the source note.
5. Prefer `official` sources. Use `reference` for reliable secondary reporting or a relevant first-party background page.
6. A purely invented gag with no factual claim must use `original_satire`. Do not attach an unrelated factual source merely to make the joke appear researched.
7. Configurable in-game data uses `internal` with an exact project path. A user-provided image or sound uses `user_supplied_asset` with its exact project path.
8. Record `accessedOn` as `YYYY-MM-DD` for web sources.
9. Paraphrase source material. Do not reproduce long quotations, copyrighted articles, broadcast scripts or song lyrics.
10. Keep the game clearly framed as independent parody. Do not present invented satire as news or fact.

## Source object format

```json
{
  "kind": "official",
  "title": "Exact page or document title",
  "publisher": "Publishing organisation",
  "url": "https://direct-location.example/document",
  "note": "Precisely what this source supports in the question.",
  "accessedOn": "2026-10-19"
}
```

Allowed `kind` values:

- `official`: government, court, official archive, official transcript or authoritative first-party record. Requires `url`.
- `reference`: reputable reporting or a relevant first-party background page. Requires `url`.
- `internal`: another game data file. Requires `path` instead of `url`.
- `original_satire`: original fictional premise or mechanic with no external factual claim. Requires a clear `note`.
- `user_supplied_asset`: an asset supplied by the owner. Requires `path` instead of `url`.

## questions.json

### File-level rules

- The root is a JSON array.
- Core question numbers are unique whole numbers from 1 through 47.
- Question IDs are unique lowercase slugs using letters, numbers and single hyphens.
- Question 47 is the single `final` question.
- Every question has a non-empty `sources` array.
- Every answer choice has a feedback line at the matching array index.
- `correctIndex` is zero-based: first answer `0`, second answer `1`, and so on.
- Do not create unsupported mechanics or fields without requesting an engine change.

### Common fields

```json
{
  "id": "unique-question-id",
  "number": 9,
  "type": "standard",
  "kicker": "SHORT HEADING",
  "prompt": "Question or instruction shown to the player",
  "sources": [],
  "feedback": []
}
```

### Supported question types

#### standard

Normal multiple choice. Required fields: `choices`, `correctIndex`, `feedback`, and `sources`. Optional `grantSkip: true` awards a Skip after a correct answer.

```json
{
  "id": "example-standard",
  "number": 9,
  "type": "standard",
  "kicker": "EXECUTIVE MEMORY TEST",
  "prompt": "What happened next?",
  "choices": ["Answer A", "Answer B", "Answer C", "Answer D"],
  "correctIndex": 2,
  "grantSkip": false,
  "sources": [],
  "feedback": ["Feedback A", "Feedback B", "Feedback C", "Feedback D"]
}
```

#### injunction

The first answer click is overruled and all answers are replaced. Required fields: `choices`, `rewrittenChoices`, `correctIndex`, `feedback`, and `sources`. `rewrittenChoices` must contain exactly one entry for each original choice.

#### hotspot

Timed hidden-target question. Required fields: `timerSeconds`, `hotspot`, `missRules`, `feedback`, and `sources`.

```json
{
  "timerSeconds": 15,
  "hotspot": { "xPct": 50, "yPct": 50, "widthPct": 8, "heightPct": 10 },
  "missRules": { "clicksBeforeLifeLoss": 3, "maxLivesLost": 1 }
}
```

The hotspot rectangle must remain inside the 0–100 percent game stage: `xPct + widthPct <= 100` and `yPct + heightPct <= 100`.

#### live

Multiple choice driven by `content/executive_metrics.json`. Required fields include `metricKey`, `choices`, `correctIndex`, `feedback`, `sources`, and an `internal` source pointing to `content/executive_metrics.json`. The renderer substitutes the selected metric into the answer at `correctIndex`.

Supported `metricKey` values are `activeInjunctions`, `golfCounter`, `simulatedPoll`, and `latestExecutiveOrder.value`. The other answer choices remain ordinary decoys. Do not describe a simulated or manually configured value as a verified live statistic. If the value represents a real fact, include the direct verified external source in the question's `sources` array.

```json
{
  "type": "live",
  "metricKey": "golfCounter",
  "choices": ["190", "This value is replaced", "240", "Nobody is counting"],
  "correctIndex": 1
}
```

#### taco

Multiple choice with a backwards-progress trap. Required fields: `choices`, `correctIndex`, `trapIndex`, `backtrackBy`, `feedback`, and `sources`. `trapIndex` is zero-based and must identify a different outcome from the ordinary correct answer.

#### bing

Timed rapid-click mini-game. Required fields: `timerSeconds`, `audio`, `sources`, and an empty `feedback` array unless the engine is expanded.

```json
{
  "timerSeconds": 20,
  "audio": {
    "onTargetClick": "/assets/audio/minigames/bing/bing-bong.mp3",
    "volume": 1
  }
}
```

#### golf

Power-timing mini-game. Required field: `golfTargetPower` from 1 through 100, plus `sources` and an empty `feedback` array unless the engine is expanded.

#### final

The deliberately unwinnable terminal question. It must be Question 47, use `correctIndex: -1`, and include `choices`, one feedback line per choice, and `sources`. Do not create a second final question.

## executive_metrics.json

This is the common answer bank for `live` questions. Its selectable numeric keys are:

- `activeInjunctions`
- `golfCounter`
- `simulatedPoll`
- `latestExecutiveOrder.value`

Preserve the complete object, including `latestExecutiveOrder`, `tickerHeadline`, and `lastUpdated`. Use whole non-negative numbers; `simulatedPoll` must be from 0 through 100. Use an ISO date and time for `lastUpdated` and `YYYY-MM-DD` for `latestExecutiveOrder.date`.

The metrics file stores values, not evidence. Every factual live question must also carry an `internal` source for `content/executive_metrics.json` and a direct verified external source location supporting the answer. A value intended purely as game satire must be clearly labelled as simulated in the question and its provenance note.

### Prompt for an AI question-research task

Copy and customise this prompt:

> Research and create [NUMBER] original questions for Trump’s Impossible Game. Browse and verify current sources. Follow the attached AI Content Guide exactly. Use only supported question types and unused core numbers from 1–46. Every factual reference must have a direct, verified source location in the question’s `sources` array. Never invent a source, quotation, date or statistic. Use `original_satire` only for a fictional gag that makes no external factual claim. Ensure every answer has matching feedback and every zero-based index is valid. Return a complete valid `questions.json` array only, with no Markdown fence or explanation.

## jokes.json

The root is one JSON object with these sections:

```json
{
  "tickerHeadlines": ["Reusable headline"],
  "recoveryMessages": ["Message shown after an interaction recovers"],
  "shareTemplates": {
    "default": ["Q{question}; {failureType}; score {bingScore}.", "Q{question}; {failureType}; score {bingScore}.", "Q{question}; {failureType}; score {bingScore}."],
    "early": ["Q{question}; score {bingScore}.", "Q{question}; score {bingScore}.", "Q{question}; score {bingScore}."],
    "late": ["Q{question}; stopped by {failureType}.", "Q{question}; stopped by {failureType}.", "Q{question}; stopped by {failureType}."]
  },
  "labels": {
    "testMode": "TEST MODE — JUMP DIRECTLY TO",
    "testButton": "TEST QUESTION",
    "rotatingPrefix": "EXECUTIVE ORDER"
  }
}
```

Rules:

- Preserve the object keys unless the application code is being changed too.
- Each share-template category must contain exactly three non-empty variations, giving nine possible result messages in total. The game randomly chooses one variation when the result screen opens.
- Every `default` variation must preserve `{question}`, `{failureType}`, and `{bingScore}` exactly.
- Every `early` variation must preserve `{question}` and `{bingScore}` exactly.
- Every `late` variation must preserve `{question}` and `{failureType}` exactly.
- Write original parody. Do not copy headlines, comedy routines, campaign material or broadcast wording.
- If a joke refers to a real event or quotation, research it and give the AI’s accompanying review report a direct verified source location. `jokes.json` currently contains text only and does not have per-line source fields, so do not put citation objects into this file without an engine/schema change.
- Return the complete file, not only changed fragments.

### Prompt for an AI jokes task

> Refresh `jokes.json` for Trump’s Impossible Game using the attached AI Content Guide. Preserve every existing key. Supply exactly three variations for each of `shareTemplates.default`, `shareTemplates.early`, and `shareTemplates.late`, preserving the required template tokens in every variation. Write original parody and do not copy real headlines or comedy material. Browse and provide a separate review list of direct source locations for any joke based on a real event or quotation, but keep the returned `jokes.json` valid and limited to its existing schema. Return the complete JSON file first, followed by the source review list.

## rotating_orders.json

The root is one object:

```json
{
  "enabled": true,
  "activeOrderId": "eo-example",
  "orders": []
}
```

Each order uses the standard question structure plus:

- `enabled`: whether the order joins the playable pool.
- `number`: use a unique bonus number of 101 or higher so it does not replace a core 1–47 position.
- `id`: use a unique slug, normally beginning `eo-`.
- `type`: currently use `standard` unless the engine has been deliberately tested with another rotating type.
- `sources`: required and subject to all sourcing rules above.

`activeOrderId` should match an order ID, but current gameplay primarily uses each order’s `enabled` flag. Keep it consistent for future compatibility.

### Prompt for an AI rotating-order task

> Research and create [NUMBER] topical rotating Executive Order questions for Trump’s Impossible Game using the attached AI Content Guide. Browse current sources and use direct source locations. Use unique `eo-` IDs, unique numbers starting at 101, `type: "standard"`, four choices, a valid zero-based `correctIndex`, four matching feedback lines, and a non-empty `sources` array. Clearly distinguish verified background from invented parody. Never fabricate an executive order or imply that a fictional order is real. Return one complete valid `rotating_orders.json` object only.

## Final AI self-check

Before returning any JSON, the AI must confirm internally that:

- JSON parses without comments or trailing commas.
- IDs and numbers are unique.
- Every required field for the selected type is present.
- Choice, rewritten-choice and feedback counts match where required.
- All indexes are zero-based and within range.
- Every question and rotating order has at least one source/provenance record.
- Every factual URL is direct, opened and verified.
- No source, quote, number or date was invented.
- Original satire is labelled as such.
- The response contains the complete requested file.
