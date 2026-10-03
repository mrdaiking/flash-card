# Writing cards & importing them

How to make cards that stick, the CSV format the import screen reads, and a
prompt that has an AI (Claude, ChatGPT) write the CSV for you.

## Rules for a good card

1. **One fact per card.** No `meaning 1; meaning 2; meaning 3` — split it into
   separate cards, or you'll always half-remember it.
2. **The front makes you produce.** "English for *trì hoãn*?" sticks better than
   "What does *procrastinate* mean?". Put your own language on the front for
   words you need to *use*.
3. **Back ≤ ~10 words.** Detail goes in `example` (the importer flags answers
   over 150 characters).
4. **Context beats a bare word.** A gap-fill sentence teaches how the word is used.
5. **Avoid** lists, yes/no questions and "explain X" — none of them can be
   answered in a few seconds.

## Patterns

| Pattern | Front | Back | Use for |
|---|---|---|---|
| Gap-fill | sentence with `___` + hint | missing word(s) | phrasal verbs, collocations, grammar |
| Production | your language | target word | words you want to speak/write |
| Recognition | target word | meaning | words you only need to read |
| Reading | kanji word | kana reading | Japanese |
| Concept | one precise question | one-line answer | tech, system design |

For a word that matters, make both a production and a recognition card —
two small cards beat one big one.

## CSV format

```csv
front,back,example
"I need to ___ this meeting to Friday. (move to a later time)",put off,"We put off the launch until the bug was fixed."
trì hoãn (việc cần làm),procrastinate,"I procrastinate when a task feels too big."
"bottleneck (in a process)",the slowest step that limits the whole flow,"Code review became our bottleneck."
"雨が降っている＿＿、出かけた。",のに — despite / even though,"のに shows contrast, often with surprise or dissatisfaction."
手伝う — reading?,てつだう,"友達の引っ越しを手伝った。"
"What does consistent hashing minimise when a node is added?",the number of keys that move (~K/N),"Used in distributed caches so scaling doesn't flush everything."
"HTTP 409",Conflict — request clashes with current state,"e.g. creating a user whose email already exists"
```

- Header can be `front,back,example`, `question,answer` or `term,definition`
  (auto-detected). Tab- or `|`-separated text works too; so does the old
  one-card-per-line `front | back`.
- Quote cells that contain commas, quotes or line breaks; escape a quote as `""`.
- Markdown works: `**bold**`, images as `![](https://…/pic.jpg)`.
- `example` is optional. Labels (Idiom, Grammar, …) aren't imported — add them
  in the card editor.

## Importing

1. Set the deck's template first (deck → ⋯ → Card template): field names and
   the read-aloud language (e.g. Japanese), so imported cards are spoken right.
2. Deck → ⋯ → Import cards → choose the file or paste → Preview.
3. Fix flagged rows: red = front or back missing, grey = duplicate (skipped),
   orange = looks like several ideas — consider splitting.
4. Pacing: spread a big import over 1–4 weeks so you don't get 200 cards due
   tomorrow. Then Import.

## Prompt: let an AI write the cards

Paste this into Claude or ChatGPT, change the three settings, paste your
material at the bottom, and import the CSV it returns. Saving it as a Claude
Project, a custom GPT or a phone text replacement (e.g. `;cards`) makes this a
copy-paste job.

```
You turn my notes into spaced-repetition flashcards. Output ONLY a CSV code block, nothing else.

FORMAT
- Header row exactly: front,back,example
- Quote any cell containing a comma, quote or line break; escape quotes as "".
- Use **bold** for the key word if helpful. No HTML.

RULES (follow strictly)
1. One fact per card. Never put a list or several meanings on the back — split into separate cards.
2. Back: max ~10 words. Put detail, nuance or a sentence in `example`.
3. Prefer cards that make me PRODUCE the answer:
   - Phrasal verbs / collocations / grammar → gap-fill: a natural sentence with ___ and a short hint in brackets on the front; the missing word(s) on the back.
   - Words I want to use → front in {MY LANGUAGE}, back = target word.
   - For important words, ALSO add a recognition card (target word → meaning).
   - Japanese: add a reading card (kanji word → kana) when the reading isn't obvious.
   - Concepts (tech etc.) → one precise question, one-line answer. No "explain X", no yes/no questions.
4. `example` = one natural sentence showing real use (or the rule/reason for grammar). Never repeat the back verbatim.
5. Skip anything trivial or that I clearly already know. No duplicates.

MY LANGUAGE: Vietnamese
TARGET: English            ← change per deck (e.g. Japanese N3, System design)
LEVEL: B2                  ← optional

MATERIAL:
<paste words, an article, a ChatGPT answer, or your notes here>
```

Always skim the AI's output before importing — delete cards you don't want;
the import review catches duplicates and overloaded answers, not wrong ones.
