# Capture contracts (STEP 0)

What lanes A, B, C and D build on. The spec is `capture.md`. Everything below is **frozen**: changing a name, a shape or a signature is a lead decision, not a lane edit. A lane fills in the body behind a signature and may add private helpers in the files it owns.

Every stub carries a `// STUB: lane X implements` comment. Before handing off, a lane greps its files for `STUB: lane <its letter>` and leaves none behind.

The tree compiles with every stub in place (`npx tsc --noEmit -p .` is clean), and `life:check`, `ui:check`, `novelty:check` and `skills:stats` pass.

## 1. Shared types and constants: `src/lib/life-types.ts` (pure, client-importable)

| Export | What | Implemented by |
|---|---|---|
| `CaptureToken.field` adds `"answer"` | The IDEA-mode token for the text after the first `::`. Its label is `'Answer: <first 24 chars>…'`. It is revertible: a reverted answer keeps `::` as title text. | A (parser) |
| `ParsedCapture.answer?: string \| null` | IDEA mode: the text after the first unreverted `::`, kept whole. Absent or null when there is none. The title is the question part. | A (parser). C stores it as `note` |
| `CAPTURE_UNDO_MS = 600_000` | How long a capture can be undone or edited. The server's undo and recapture use it, and so do the sheet's Edit offer and the 'Added here' pruning. | frozen (value). C switches the private copy in `tasks.ts` to this import |
| `CAPTURE_BATCH_MAX = 20` | The most lines one paste may add. The server enforces it, and the sheet's `splitPastedLines` caps at it. | frozen (value) |
| `PlaceLane` | `"must" \| "planned" \| "habits" \| "upcoming" \| "later" \| "anytime" \| "inbox" \| "goals" \| "done"`. It is not today-board's existing `Lane` (must/today/yesterday/anytime), which stays as it is. | frozen |
| `PLACE_LANES` | The `PlaceLane` values as a readonly array, for checks. | frozen |
| `BoardPlace` | `{ lane: PlaceLane; label: string }`. Labels use the board's own words: `'Must'`, `'Planned'`, `'Habits'`, `'Habits · next Thu'`, `'Planned later · Fri 2 Oct'`, `'Anytime'`, `'Anytime · by 30 Nov'`, `'Inbox'`, `'Inbox · filing'`, `'Goals'`, `'Done today'`. | C (`placeOf`) |

## 2. Capture server actions: `src/app/actions/capture.ts` ("use server")

| Export | Signature / shape | Implemented by |
|---|---|---|
| `CaptureErrorCode` | `"too-late" \| "gone"` | frozen |
| `CaptureResult<T>` | `{ ok: true; value: T } \| { ok: false; error: string; code?: CaptureErrorCode }`. `code` is set only where the sheet must act on the reason: `'too-late'` shows [Save as new], `'gone'` drops the edit. | frozen. C sets `code` |
| `CapturedItem.where` | `BoardPlace`, **required**. createTemplateCore computes it from the inserted row with `placeOf`. A self-filing idea gets `{lane:'inbox', label:'Inbox · filing'}`. | **C**. The stub `provisionalWhere` in capture.ts is a coarse guess that must not ship |
| `CapturedItem.replacedId?` | `string`: the old capture an edit replaced. | C |
| `CapturedItem.oldKept?` | `boolean`: the edit saved the new line but couldn't take back the old one. | C |
| `CapturedItem.filing?` | `boolean`: an `idea: Q :: A` draft is being filed in `after()`. | C |
| `recaptureFromCapture` | `(oldId: string, text: string, reverted?: CaptureSpan[], opts?: { refresh?: boolean; captureKey?: string }) => Promise<CaptureResult<CapturedItem>>`. It sanitizes and re-parses like createFromCapture, writes the new row FIRST, then calls undoCaptureCore on the old one. | **C** (stub returns `{ok:false}`) |
| `CaptureLineInput` | `{ text: string; reverted?: CaptureSpan[]; captureKey: string }` | frozen |
| `CaptureLineResult` | `{ ok: true; item: CapturedItem } \| { ok: false; captureKey: string; error: string }` | frozen |
| `CaptureManyResult` | `{ results: CaptureLineResult[] }`, in the order the lines were sent. | frozen |
| `createManyFromCapture` | `(lines: CaptureLineInput[], opts?: { refresh?: boolean }) => Promise<CaptureManyResult>`. At most `CAPTURE_BATCH_MAX` lines, each created in turn; one `after()` for sizing; one `refresh()`. | **C** (stub fails every line, with its captureKey) |
| `CaptureActiveTitle` | `{ normTitle: string; title: string; where: BoardPlace }` (P3 duplicate note) | C fills it; B matches on `normTitle` equality |
| `CaptureVocabulary.recent` | `string[]`: the distinct rawText of the last 8 quick TASK/HABIT captures in the last 30 days, newest first. Cached under `'life'`. | **C** (stub `[]`) |
| `CaptureVocabulary.active` | `CaptureActiveTitle[]`: open templates, at most 300. | **C** (stub `[]`) |
| `loadCaptureVocabulary` | `(opts?: { words?: boolean }) => Promise<CaptureVocabulary>`. The ~1,200 words load only when `words === true`, and `words` is `[]` otherwise. | **C**. The stub ignores `opts` and always loads words, so today's sheet keeps its hints until B passes `{words:true}` in idea mode |

Unchanged and still frozen: `createFromCapture(text, reverted?, opts?: {refresh?, captureKey?})`, `CapturedItem`'s existing fields, and the `CAPTURED_EVENT` (`"xtnl:captured"`, in `components/capture/events.ts`), whose `detail` is the `CapturedItem` and so now carries `where`. TodayBoard (C) reads `detail.id` and `detail.where.lane`.

## 3. Parser: `src/lib/capture-parse.ts`

| Export | Signature | Implemented by |
|---|---|---|
| `IdeaLineSplit` | `{ question: string; answer: string \| null }` | frozen |
| `splitIdeaLine` | `(text: string) => IdeaLineSplit`. It strips a leading `idea:` / `i:` and splits on the first `::`, trimming both parts. An empty answer is `null`. It must read `::` exactly as parseCapture's IDEA-mode split does. | **A**. The stub works as described, so B can test against it; A owns the rule and must make the two readers share it |

## 4. Idea actions: `src/app/actions/ideas.ts` ("use server")

| Export | Change | Implemented by |
|---|---|---|
| `SubmitIdeaInput.draftId?` | `string`: the IDEA_DRAFT this idea finishes. | **D**: archive on created or merged. Saturated keeps the draft, and a missing draft is ignored |
| `LinkIdeaInput.draftId?` | `string` | **D**: archive on linked |
| `EnrichIdeaInput.draftId?` | `string` | **D**: archive on enriched |
| `SubmitIdeaResult` adds `{ status: "error"; message: string }` | Known failures (embedding unreachable or timed out) return this instead of throwing. Nothing was written, and the form keeps every field. | **D** (nothing returns it yet; AddIdeaForm already compiles with it) |

The archive rule (D): `prisma.taskTemplate.updateMany({ where: { id: draftId, userId, kind: 'IDEA_DRAFT', archivedAt: null }, data: { archivedAt: now } })`, then `invalidate('life','activity')`. Validate draftId to 64 characters or fewer.

`submitIdeaCore(userId, { content, collectionLabel, draftId, … })` is lane D's internal extraction from submitIdea, called by idea-filing.ts. It is not frozen and is never exported from a "use server" module. `LinkIdeaResult` and `EnrichResult` are unchanged here. D may give them an error member too, since D owns both ideas.ts and AddIdeaForm.

## 5. New: `src/lib/idea-handoff.ts` (client, dependency-free)

| Export | Signature / value | Implemented by |
|---|---|---|
| `IDEA_HANDOFF_KEY` | `"xtnl:add:handoff"` (sessionStorage) | frozen |
| `IDEA_HANDOFF_TTL_MS` | `600_000` | frozen |
| `SHEET_DRAFT_KEY` | `"xtnl:capture:draft"`, the sheet's unsent line `{ text, reverted }` in localStorage (QuickCapture's `DRAFT_KEY`) | frozen. B imports it, or keeps the same literal |
| `SHEET_DRAFT_CLEARED_EVENT` | `"xtnl:capture:draft-cleared"`, a window event whose `detail` is `SheetDraftCleared` | frozen. **B listens**: when the in-memory line still equals `detail.text`, B clears it |
| `IdeaHandoffInput` | `{ question: string; answer: string; sheetText: string }`, where `answer` is `''` when the line had no `::` | frozen |
| `IdeaHandoff` | `IdeaHandoffInput & { at: number }` | frozen |
| `SheetDraftCleared` | `{ text: string }` | frozen |
| `StorageLike` | `{ getItem, setItem, removeItem }` | frozen |
| `HandoffEnv` | `{ storage?: StorageLike \| null; now?: number }`: test seams. The default storage is sessionStorage for the handoff and localStorage for the sheet draft; `null` means unavailable. | frozen |
| `writeIdeaHandoff` | `(input: IdeaHandoffInput, env?: HandoffEnv) => boolean` (true when stored). It never throws. | **D** (stub returns `false`) |
| `takeIdeaHandoff` | `(env?: HandoffEnv) => IdeaHandoff \| null`. It reads and deletes the handoff, and rejects anything older than the TTL or malformed. It never throws. | **D** (stub returns `null`) |
| `clearSheetDraftIf` | `(sheetText: string, env?: HandoffEnv) => boolean`. It removes `SHEET_DRAFT_KEY` only when its `text === sheetText`, then dispatches `SHEET_DRAFT_CLEARED_EVENT`. | **D** (stub returns `false`) |

Why the event: QuickCapture is mounted once in the root layout and keeps the line in React state, which survives client navigation. It also rewrites `SHEET_DRAFT_KEY` on every change. Removing the storage entry alone would therefore leave the line in the sheet, and acceptance 10 ('clears the sheet's line') would fail.

Restore precedence on /add (D): `?draft` param > handoff > autosave (`localStorage 'xtnl:add:autosave'`).

## 6. New: `src/lib/idea-filing.ts` (server-only, never "use server")

| Export | Signature | Implemented by |
|---|---|---|
| `IdeaFilingOutcome` | `"created" \| "merged" \| "saturated" \| "failed"` | frozen |
| `fileIdeaDraftCore` | `(userId: string, draftId: string) => Promise<IdeaFilingOutcome>`. It never throws, and it logs. Created or merged archives the draft through the draftId rule. Saturated or failed keeps it. It never auto-merges. | **D** (stub returns `'failed'`, which keeps the draft) |

C calls it from createFromCapture as `after(() => fileIdeaDraftCore(userId, id))`, but only for an IDEA_DRAFT that has an answer and is not a duplicate. C reads `userId` before calling `after()`. capture.md marks one-box filing (P2) as needing a one-line confirmation from the user before it is built.

## 7. Cross-lane conventions (documented, no code in STEP 0)

- **Row flash hash**: `/today#t-<templateId>`. B's toast 'View' link writes it. C's TodayBoard reads it on mount and strips it with `replaceState`. TaskRow renders `data-template-id`.
- **Inbox draft link**: `/add?draft=<id>` (already `CapturedItem.href` for an IDEA_DRAFT). C's InboxSheet [Finish] uses the same form.
- **Unsent marker**: `document.documentElement.dataset.captureUnsent` and the portalled `<span id="capture-unsent" class="sr-only">`. Both are B's, and Chrome.tsx (B) points `aria-describedby` at them.
- **Sheet storage keys** (all B's): `xtnl:capture:draft`, `xtnl:capture:pending` (a pending entry gains `replaces?: string` for an edit), `xtnl:capture:vocab` `{day, goals, recent, rawBefore}`.
- **Fragment prefill**: `#capture=<encoded>` on any route. B reads it, and it never auto-saves.

## 8. Lane-internal (not frozen: owned and used inside one lane)

- A: the parser rules R1–R15, the Vietnamese rules, `isCaptureHotkey` (Ctrl/Cmd+K), speakable grammar, and the autocorrect profile: `autocorrectAtCaret(text, caret, opts?: { profile?: 'prose' \| 'task' })` and `useAutocorrect(onChange, enabled = true, profile = 'prose')`. **A must land this signature before B** (B passes `'task'`). It was not stubbed in STEP 0.
- B: `enterAction`, `applyInsert`, `splitPastedLines`, `caretContext`, `readCaptureFragment`, `toastCopy`, the history-decision helper, and `capture-queue.ts` (`nextRetryDelay`, `isNetworkFailure`, the queue state), all in its own files.
- C: `placeOf(template, today, instances)` and `BoardData.laterRows: { templateId, title, label }[]` (today-board.ts); `recaptureCore(userId, oldId, parsed, { rawText, captureKey })`, the pure `planRecapture({ oldCreatedAt, oldArchived, now })`, the `CreatedTask.where` computation, and the recent and active queries (tasks.ts).
- D: `submitIdeaCore`, `fallbackDomainName(fieldName, tags, contentText)`, the `withModelTimeout` call sites (`gemini.ts` already exports `withModelTimeout(promise, ms) → ModelResult<T>`), the autosave, the list-row reducer, and `wrapSelection`.

## 9. Check scripts

- Lane C creates `scripts/capture-server-check.ts`, and lane D creates `scripts/idea-capture-check.ts`. Both are pure and touch no DB.
- Lane A registers both in `package.json` `life:check` (A owns package.json).
- STEP 0 added one key to an existing Lane A file: `answer: "answer"` in `SLOT` in `scripts/capture-parse-check.ts`. That exhaustive `Record` over the token fields would not compile without it.

## 9. As built — additions after the review fixes (2026-10-01)

- **src/lib/capture-shape.ts** (new, pure, client-importable): `captureShapeOf(parsed, today)`, `type CaptureShape`, `CAPTURE_NOTE_MAX`. The server's createTemplateCore stores it; the sheet's `wherePreviewOf` reads it, so the preview and the stored row cannot drift. tasks.ts no longer exports `captureShapeOf`.
- **tasks.ts**: `planRecapture` takes optional `oldId`, `keyRowId`, `oldTicked`, `oldDoneNow`; `RecaptureStep` gains `'keep-tick'`, and `'find'` means "return the key's row, no create, no tick". New: `planUndoCapture`, `standingReplacement`, `REPLACEMENT_HOPS`, `resentTickBlock`, `resentEditOf`, `lineIsDoneNow`, `tickFactsOf`, the `RECAPTURE_*` / `RESENT_NOT_TICKED` / `UNDO_CAPTURE_*` copy constants, `UndoCaptureResult`, `UndoCapturePlan`; `undoCaptureCore(userId, templateId, now?, opts?: { archivedAt?: Date })`. Link convention: an edit archives the old row at the new row's `createdAt`.
- **actions/tasks.ts**: `undoCapture` returns `TaskActionResult<null> & { code?: "gone" }`.
- **CaptureErrorCode** stays `"too-late" | "gone"`; 'gone' also covers an edit of a line already taken back or replaced.
- **CapturedItem.doneNow / doneNowError**: `doneNow` is true whenever a tick went through with the save (including an edit that kept the old row's board tick). New texts: 'Saved on <day>; tick it on Today.', 'Saved and ticked on <day>.', 'The old line's tick was taken back. …', 'Saved by an earlier send, not ticked. Tick it on Today.'
- **xtnl:capture:pending** entries gain `day?: DayKey` (the life day the line was typed). A line whose day is not today (or has none) is never sent automatically: it waits in the failed list with 'Captured on <day> · check its day, then Retry'.
- **capture-ui.ts** (sheet helpers added in the fix round): `replacingOf`, `EDIT_SAVING_NOTE` / `EDIT_UNSAVED_NOTE`, `undoGoneCopy(title, serverMessage?)`, `pendingDayNote`, `vocabOnOpen`, `VOCAB_IDLE_MS`, `vocabRefreshDecision({…, coarseOpen, lineEmpty, emptyForMs})`, `menuNote`, `enterAction({…, done})` → `'close'`, `insertRowChips(parsed, text, { narrow })`.

