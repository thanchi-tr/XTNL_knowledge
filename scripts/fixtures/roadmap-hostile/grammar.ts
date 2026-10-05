/**
 * The hostile corpus's word lists and phrase grammars (roadmap-rev4.md
 * F-R4-22; lane R7). Pure data and tiny builders: no I/O, no model, no
 * import from src/ beyond nothing at all, so the corpus's ground truth never
 * moves when the validator moves. generate.ts crosses these with the corpus
 * packs and a seeded PRNG.
 *
 * Every list here is written by hand from the spec's words (F-R4-17,
 * F-R4-19, F-R4-22): the claim classes of family E, the recombination
 * triggers of E-G, the constraint phrasings of K, and the inserts of the
 * metamorphic relations M1–M7.
 */

// ═══ Syllables: invented names, brand-like tokens and the D-family markers ══

/** Consonant-vowel syllables; three or four make a word nobody wrote (markers are ≥ 8 letters). */
export const SYLLABLES: readonly string[] = [
  "ka", "zo", "ri", "vel", "tan", "quo", "mir", "dex", "lun", "sar",
  "pel", "vok", "nix", "tor", "bel", "gra", "fen", "zul", "mor", "qui",
  "bra", "tis", "wen", "drak", "ulo", "fey", "ost", "rin", "sko", "jav",
];

// ═══ Family E: the claim grammar (gap strings; suggestions on) ══════════════

/** The carriers a claim or a control phrase rides in (F-R4-22 E). */
export const CARRIERS: readonly string[] = ["{x}", "{x} basics", "Intro to {x}"];

/** Resource nouns: half are lexicon words (RESOURCE_WORDS), half are not (only grounding stops those). */
export const RESOURCE_NOUNS: readonly string[] = [
  "textbook", "workbook", "course", "guide", "handbook", "playlist", "bootcamp", "academy",
  "primer", "compendium", "masterclass", "cheat sheet", "lecture notes", "drill pack", "study plan", "question bank",
];

/** Over-long frames (past GAP_NAME_MAX): the shape rule's length clause drops them, never a cut that shows a part. */
export const OVER_LENGTH_FRAMES: readonly string[] = [
  "{x} with the official {y} textbook and workbook",
  "Complete {x} course by {n} for the {y} exam",
  "{x} and {y} as required by the examining board",
  "Essential {x} that every candidate must master first",
  "{x} drills from the {n} question bank, every day",
];

/** Health words (HEALTH_WORDS and their kind): a gap never gives health advice. */
export const HEALTH_PHRASES: readonly string[] = [
  "Fasting for focus", "Keto meal plan", "Supplement stack", "Max heart rate", "Injury rehab",
  "Calorie cutting", "Detox protocol", "Macros tracking", "Weight loss stack", "Cold plunge recovery",
];

/** Declarative claim frames ({x} a topic): requirement, efficacy, testing claims. */
export const DECLARATIVE_FRAMES: readonly string[] = [
  "{x} is essential", "{x} is required", "Must know {x}", "{x} is always tested", "Examiners expect {x}",
  "{x} guaranteed", "Proven {x} method", "Official {x}", "{x} is mandatory", "Best {x} order",
];

/** About-you frames (ABOUT_YOU_WORDS): Gemini can't know the person. */
export const ABOUT_YOU_FRAMES: readonly string[] = [
  "Your weak {x}", "Fix your {x}", "Gaps in {x}", "Beginner {x}", "{x} you lack",
  "Strengthen weak {x}", "Your {x} struggles", "Already strong {x}",
];

/** Schedule frames (date words, LABEL_START_WORDS, spelled numbers). */
export const SCHEDULE_FRAMES: readonly string[] = [
  "Daily {x}", "Weekly {x} review", "Monday {x}", "Weekend {x}", "{x} every morning",
  "{x} on Sundays", "Two hours of {x}", "{x} twice a week", "Tonight's {x}", "Morning {x} block",
];

/** Spelled numbers, ordinals and Roman numerals (the number class without digits). */
export const SPELLED_NUMBER_FRAMES: readonly string[] = [
  "Two week {x}", "Ten minute {x}", "First {x} module", "Second year {x}", "Part II {x}",
  "{x} III", "Half {x}", "Hundred {x} drills", "Third edition {x}", "Dozen {x} problems",
];

/** Decimal digit zeros of 10 scripts (\p{Nd}): ASCII, Arabic-Indic, Extended Arabic-Indic, Devanagari, Bengali, Thai, Fullwidth, Myanmar, Khmer, Tibetan. */
export const DIGIT_ZEROS: readonly number[] = [0x30, 0x660, 0x6f0, 0x966, 0x9e6, 0xe50, 0xff10, 0x1040, 0x17e0, 0xf20];
/** Han numerals (letters to \p, numbers to a reader): M1 counts them as digits. */
export const HAN_NUMERALS: readonly string[] = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "百", "千", "万", "〇", "两"];
/** Other number characters a NUMBER rule must read. */
export const NUMBER_SIGNS: readonly string[] = ["½", "¾", "²", "Ⅳ", "Ⅻ", "⑤"];

/** A digit string in one script: `n` written with that script's zero. */
export function digitsIn(zero: number, n: number): string {
  return String(n)
    .split("")
    .map((d) => String.fromCodePoint(zero + Number(d)))
    .join("");
}

/**
 * The URL forms (F-R4-22 E and M4; the spec's 16 and four more a model can
 * write): {d} a domain-like word, {p} a path word, {n} a number 1–254.
 */
export const URL_FORMS: readonly string[] = [
  "https://{d}.com/{p}",
  "http://{d}.org",
  "www.{d}.com",
  "{d}.com",
  "{d}.io/{p}",
  "{d}[.]com",
  "{d}(.)com",
  "{d} dot com",
  "hxxps://{d}[.]com",
  "hxxp://{d}.net",
  "bit.ly/{p}",
  "{d}.co.uk",
  "t.me/{p}",
  "r/{p}",
  "/{p}/{d}",
  "{d}.academy",
  "{d} . com",
  "{d}。com",
  "hxxps {d}",
  "10.0.{n}.{n}",
];

/** Foreign scripts with spaces (not NO_SPACE_SCRIPTS): the name stays unchecked and ungrounded. */
export const FOREIGN_NAMES: readonly string[] = [
  "Теория вероятностей", "Математическая статистика", "Λογισμός", "Στατιστική ανάλυση", "الإحصاء الرياضي",
  "סטטיסטיקה", "सांख्यिकी विधि", "통계학 기초", "Ngữ pháp nâng cao", "Từ vựng chuyên ngành",
  "Wahrscheinlichkeitsrechnung", "Análisis numérico", "Théorie des ensembles", "Ćwiczenia słownictwa",
];

/** Names in NO_SPACE_SCRIPTS (Han, Hiragana, Katakana, Thai, Lao, Khmer, Myanmar, Tibetan): always NOT_A_NAME. */
export const NO_SPACE_NAMES: readonly string[] = [
  "統計学", "公式教材で毎日二時間勉強する必要がある", "ひらがなの練習", "テスト対策", "สถิติ", "ไวยากรณ์ขั้นสูง",
  "ສະຖິຕິ", "ស្ថិតិវិទ្យា", "စာရင်းအင်း", "བོད་ཡིག", "確率論入門", "ビジネス日本語",
];

/** Latin letters and their Cyrillic or Greek look-alikes (mixed-script homoglyphs). */
export const HOMOGLYPHS: Readonly<Record<string, string>> = {
  a: "а", e: "е", o: "о", p: "р", c: "с", x: "х", y: "у", i: "і", A: "Α", B: "Β", E: "Ε", H: "Η", I: "Ι", K: "Κ", M: "Μ", O: "Ο", P: "Ρ", T: "Τ",
};

/** Capitalised name stems for 'by <Name>' and proper nouns (no real person: syllable-built at generation). */
export const NAME_SUFFIXES: readonly string[] = ["", "son", "ley", "ova", "ski", "man", "ez", "ini"];

// ═══ The names F-R4-19 must keep (the control set), placed in an outline ═══

export const KEEP_NAMES: readonly string[] = [
  "Time series", "Set theory", "Fixed income", "Standard deviation", "Unit testing", "Double-entry bookkeeping", "Listening", "Sight reading",
];

/**
 * The user's own outlines for the English Field packs that have none (the
 * control set's source, F-R4-22 E): what a person would type, one line per
 * topic, each with the Domain the user ties it to (an index into the pack's
 * chosen Domains, or null: tied to none). The keep names sit in these lines.
 */
export const PACK_OUTLINES: Readonly<Record<string, readonly { line: string; domain: number | null }[]>> = {
  guitar: [
    { line: "Open chord shapes", domain: 0 },
    { line: "Barre chords", domain: 0 },
    { line: "Power chords", domain: 0 },
    { line: "Chord changes in time", domain: 0 },
    { line: "Strumming patterns", domain: null },
    { line: "Fingerpicking patterns", domain: null },
    { line: "Sight reading", domain: 1 },
    { line: "Listening", domain: null },
    { line: "Chord progressions in major keys", domain: 1 },
    { line: "Minor scales", domain: 1 },
    { line: "Song structure", domain: 1 },
    { line: "Playing from memory", domain: null },
  ],
  ielts: [
    { line: "Paraphrasing", domain: 0 },
    { line: "Collocations", domain: 0 },
    { line: "Academic word list", domain: 0 },
    { line: "Cohesive devices", domain: 1 },
    { line: "Coherence and cohesion", domain: 1 },
    { line: "Lexical resource", domain: 0 },
    { line: "Opinion essays", domain: 1 },
    { line: "Discussion essays", domain: 1 },
    { line: "Describing trends", domain: null },
    { line: "Listening", domain: null },
    { line: "Grammatical range and accuracy", domain: null },
    { line: "Task response", domain: 1 },
  ],
  "japanese-work": [
    { line: "Keigo in meetings", domain: 0 },
    { line: "Humble and honorific forms", domain: 0 },
    { line: "Polite requests", domain: 0 },
    { line: "Email phrases", domain: 1 },
    { line: "Phone calls at work", domain: null },
    { line: "Small talk with colleagues", domain: 1 },
    { line: "Meeting vocabulary", domain: 1 },
    { line: "Giving presentations", domain: null },
    { line: "Apologies and excuses", domain: 0 },
    { line: "Business etiquette", domain: null },
  ],
  "python-cert": [
    { line: "Unit testing", domain: null },
    { line: "List comprehensions", domain: 1 },
    { line: "Exception handling", domain: 0 },
    { line: "Dictionaries and sets", domain: 1 },
    { line: "File input and output", domain: 0 },
    { line: "Object oriented programming", domain: 0 },
    { line: "String formatting", domain: 0 },
    { line: "Generators and iterators", domain: 0 },
    { line: "Recursion", domain: null },
    { line: "Sorting algorithms", domain: 1 },
    { line: "Calculus prerequisite review", domain: null },
  ],
  trading: [
    { line: "Time series analysis", domain: 0 },
    { line: "Standard deviation of returns", domain: 2 },
    { line: "Walk-forward testing", domain: 0 },
    { line: "Fixed income markets", domain: null },
    { line: "Double-entry bookkeeping", domain: null },
    { line: "Order execution", domain: 1 },
    { line: "Slippage and spread", domain: 1 },
    { line: "Drawdown control", domain: 2 },
    { line: "Position sizing rules", domain: 2 },
    { line: "Monte Carlo simulation", domain: 0 },
    { line: "Certification exam for traders", domain: null },
  ],
  "actuarial-probability+": [
    { line: "Set theory and counting", domain: 0 },
    { line: "Time series", domain: 1 },
    { line: "Moment generating functions", domain: 0 },
    { line: "Law of total probability", domain: 0 },
    { line: "Central limit theorem", domain: 1 },
    { line: "Calculus prerequisite review", domain: null },
  ],
};

// ═══ Family E-G: recombined claims from the packs' own words ════════════════

/** Claim triggers: a recombined name holding one makes a claim (an exam, a credential, a requirement, a resource). */
export const CLAIM_TRIGGERS: readonly string[] = [
  "exam", "exams", "test", "certificate", "certification", "certified", "licence", "license", "accreditation",
  "qualification", "prerequisite", "requirement", "required", "official", "syllabus", "course", "curriculum", "standard", "mandatory",
];

/** Claim frames for several-source recombinations: a trigger word next to the pack's own topic words. */
export const RECOMBINED_FRAMES: readonly string[] = [
  "{a} exam", "{a} certification", "{a} prerequisite", "{a} licence", "{a} qualification",
  "{a} {b} exam", "Official {a}", "{a} accreditation", "{a} certificate", "{a} requirement",
];

/** Topic-only frames (no claim): two of the pack's words. */
export const PLAIN_FRAMES: readonly string[] = ["{a} {b}", "{a} and {b}", "{a} for {b}"];

// ═══ Family K: constraint phrasings ═════════════════════════════════════════

/**
 * English cue templates ({t} the negated term phrase). Each template's
 * other words hit no BODY or CARE keyword, template word or K aim word
 * (generate.ts asserts it), so the expected exclusions are the term's alone.
 */
export const CUE_TEMPLATES: Readonly<Record<string, readonly string[]>> = {
  no: ["no {t}", "No {t} for now.", "Evenings only. No {t}."],
  not: ["not {t} at the moment", "I'm not {t} this year"],
  avoid: ["avoid {t}", "Must avoid {t}."],
  without: ["training without {t}", "without {t}"],
  "can't": ["can't do {t}", "I can't manage {t}"],
  cannot: ["cannot do {t}", "I cannot manage {t}"],
  "don't": ["don't do {t}", "I don't want {t}"],
  stop: ["had to stop {t}", "told to stop {t}"],
  "doctor says": ["doctor says {t} is out", "Doctor says skip {t}."],
  injury: ["injury from {t}", "an old injury from {t}"],
  injured: ["injured while {t}", "got injured {t}"],
  pain: ["pain when {t}", "back pain from {t}"],
};

/** A list template: three terms under one cue ("no running, jumping or lifting"). */
export const LIST_TEMPLATES: readonly string[] = ["no {t1}, {t2} or {t3}", "avoid {t1}, {t2} and {t3}", "doctor says no {t1}, {t2} or {t3}"];

/**
 * BODY terms (as typed) and the keyword stems they negate. `forms` are the
 * phrases a cue takes; the generator labels each case with every kind whose
 * keywords or label words share a stem with the phrase's content words.
 */
export const BODY_TERMS: readonly string[] = [
  "running", "jogging", "sprinting", "jumping", "lifting", "heavy weights", "the gym", "squats", "deadlifts",
  "high-intensity cardio", "cardio", "intervals", "HIIT", "plyometrics", "racing", "long runs", "distance running",
  "endurance work", "strength training", "resistance training", "heavy loads", "impact sports", "stretching",
  "gentle yoga", "mobility work", "technique work",
];

/** CARE terms. */
export const CARE_TERMS: readonly string[] = [
  "phone calls", "calling", "visiting", "visits", "paperwork", "admin", "admin work", "forms", "planning", "journaling", "a diary", "logging",
  "scheduling",
];

/** Neutral aims for K (no term word in them), and aims that themselves meet a term (an aim conflict). */
export const K_AIMS: Readonly<Record<"BODY" | "CARE", { neutral: string; conflicts: readonly string[] }>> = {
  BODY: { neutral: "Feel fitter by summer", conflicts: ["Run a sub-50 10K", "Deadlift twice my bodyweight", "Squat with good depth", "Stretching every evening"] },
  CARE: { neutral: "Look after my dad well", conflicts: ["Visit Gran every Sunday", "Call Mum most evenings", "Sort the household paperwork"] },
};

/** Vietnamese constraint phrasings: the parser reads English only, so each must raise the confirm. */
export const VI_CONSTRAINTS: Readonly<Record<"BODY" | "CARE", readonly string[]>> = {
  BODY: [
    "đau gối, không chạy bộ", "không được nhảy", "bác sĩ dặn tránh tập nặng", "không tập tạ", "tránh các bài cường độ cao",
    "đang mang thai", "bị cao huyết áp", "vừa mổ đầu gối", "đau lưng khi nâng vật nặng", "không chạy nước rút",
    "bác sĩ cấm tập cardio", "bị hen suyễn",
  ],
  CARE: ["không gọi điện được", "không thể đến thăm vào cuối tuần", "không làm giấy tờ", "không có thời gian rảnh", "mẹ ở viện dưỡng lão", "tôi sống xa nhà"],
};

/** Japanese constraint phrasings. */
export const JA_CONSTRAINTS: Readonly<Record<"BODY" | "CARE", readonly string[]>> = {
  BODY: [
    "膝を痛めているので走らない", "ジャンプは禁止", "医者に激しい運動を止められている", "重いウェイトは避ける", "妊娠中",
    "心臓に持病がある", "腰痛があるのでスクワットはしない", "高強度の有酸素運動は控える", "喘息がある", "手術後のリハビリ中",
  ],
  CARE: ["電話はできない", "週末は訪問できない", "書類仕事は無理", "母は介護施設にいる", "遠くに住んでいる"],
};

/** Neutral endings in each language (they add no term), so each phrasing appears in several honest forms. */
export const VI_SUFFIXES: readonly string[] = ["", ".", " ạ", " (theo lời bác sĩ)", "; chỉ tập buổi tối", " nhé", "!", " – cảm ơn", " (tạm thời)", " trong vài tháng tới"];
export const JA_SUFFIXES: readonly string[] = ["", "。", "です", "（医師の指示）", "ので注意", "！", "、よろしく", "（当面）", "ため", "しばらくの間"];

/** English constraints with no cue (a condition): no term parses, so the confirm must be raised. */
export const CUELESS_CONSTRAINTS: Readonly<Record<"BODY" | "CARE", readonly string[]>> = {
  BODY: [
    "pregnant", "heart condition", "asthma", "recovering from knee surgery", "high blood pressure", "arthritis in both knees",
    "six weeks postpartum", "osteoporosis", "on blood thinners", "dizzy spells", "type 1 diabetes", "a hip replacement last year",
  ],
  CARE: ["she has dementia", "I live two hours away", "mum is in a care home", "I work nights", "my brother shares the load"],
};

// ═══ Family K, sub-class "release": a clause that clears one activity (fix round 3) ═══

/**
 * K's release sub-class (fix round 3, lens 1 major: a clause that cleared one
 * activity ended the cue's scope for the rest of the sentence, so "knee
 * injury, swimming ok, running not ok" excluded nothing). In each phrasing
 * {o} is an activity the user clears ("stretching is fine"), {t} and {t2}
 * the ones still excluded, after it; generate.ts reads the cues a phrasing
 * holds. A case must exclude every kind {t} and {t2} name (recall 100%) and
 * keep every kind only {o} names (0 over-exclusions). The words around the
 * slots hit no kind, template word or K aim word on the track (generate.ts
 * asserts it), nor a Field kind (the over-exclusion item).
 */
export const RELEASE_TEMPLATES: Readonly<Record<"BODY" | "CARE", readonly string[]>> = {
  BODY: [
    // A cue, a cleared activity, then a later exclusion stated after its term (R3's probe phrasings).
    "knee injury, {o} is fine, {t} not ok",
    "injured, {o} is fine, {t} is not ok",
    "knee injury: {o} fine, {t} not allowed",
    "back injury, {o} is fine, {t} is out",
    "knee injury, {o} fine, {t} hurts",
    "knee pain, {o} ok, {t} not ok",
    "doctor says {o} is fine, {t} is out",
    "injured, but cleared for {o}, {t} too painful",
    "knee injury, {o} is okay, except {t}",
    // A contrast or a join right after the release answers the release, not the cue.
    "injured, {o} is fine but {t} hurts",
    "knee injury, {o} is fine and {t} hurts",
    "doctor says {o} is fine and {t} is out",
    // A state cue cleared in its own clause still covers the clauses after it.
    "knee injury healed, but {t} not ok",
    "back pain gone, {t} hurts again",
    // A negating cue, a cleared activity, a second exclusion (the task's phrasing).
    "bad knee, so no {t}; {o} is fine; no {t2} either",
    "no {t}, {o} is fine, no {t2} either",
    "no {t}, {o} is fine but {t2} hurts",
  ],
  CARE: [
    "no {t}, {o} is fine, {t2} not ok",
    "can't manage {t}, {o} ok, {t2} too much",
    "no {t}; {o} is fine; no {t2} either",
  ],
};

/** The activities a BODY or CARE release clears ({o}): the gentle ones a user keeps while injured or stretched. */
export const RELEASE_CLEARED: Readonly<Record<"BODY" | "CARE", readonly string[]>> = {
  BODY: ["stretching", "gentle yoga", "mobility work", "technique work"],
  CARE: ["phone calls", "journaling", "planning"],
};

/**
 * One BODY phrasing per entry of roadmap-lexicon.ts's release lists, so the
 * ablation shows each entry's own weight: a release word or a clause opener
 * clears {o} (with the entry removed, {o} is over-excluded), a blocker keeps
 * {t} excluded (with it removed, {t} is dropped). Frozen here, so the corpus
 * never moves with the lexicon. The blockers that are a cue or a scope break
 * too ("not", "no", "yet", "unless") are covered by that rule and have none.
 */
export const RELEASE_ENTRY_TEMPLATES: Readonly<Record<string, string>> = {
  // CONSTRAINT_RELEASE_WORDS: clears {o}.
  cleared: "injured, but cleared for {o}",
  recovered: "injured last year, now fully recovered and back to {o}",
  healed: "knee injury fully healed and back to {o}",
  fine: "knee injury, {o} is fine",
  ok: "knee injury, {o} ok",
  okay: "knee injury, {o} is okay",
  resolved: "back pain resolved and back to {o}",
  gone: "back pain gone and back to {o}",
  // CONSTRAINT_RELEASE_STARTS: opens a clause that clears {o}.
  but: "knee injury, but {o} is fine",
  however: "injured, however cleared for {o}",
  although: "knee injury, although cleared for {o}",
  though: "knee injury, though {o} is fine",
  now: "had to stop {t} and now cleared for {o}",
  // CONSTRAINT_RELEASE_BLOCKERS: keeps {t} excluded.
  never: "knee injury, {t} is never fine",
  isnt: "knee injury, {t} isn't fine",
  arent: "knee injury, my knees aren't fine for {t}",
  wasnt: "knee injury, {t} wasn't fine",
  werent: "knee injury, my knees weren't fine with {t}",
  doesnt: "knee injury, {t} doesn't seem ok",
  didnt: "knee injury, {t} didn't turn out fine",
  wont: "knee injury, {t} won't be ok",
  hasnt: "knee injury, physio hasn't cleared me for {t}",
  havent: "knee injury, I haven't been cleared for {t}",
  hadnt: "knee injury, I hadn't been cleared for {t}",
  shouldnt: "knee injury, shouldn't assume {t} is fine",
  mustnt: "knee injury, mustn't treat {t} as fine",
  couldnt: "knee injury, couldn't get cleared for {t}",
  nor: "knee injury: no lunges, nor is {t} fine",
  neither: "knee injury, neither knee is fine for {t}",
  until: "knee injury, {t} until fully healed",
  till: "knee injury, {t} out till healed",
  once: "knee injury, {t} once fully healed",
  after: "knee injury, {t} after it's healed",
  before: "knee injury, {t} before being cleared",
  if: "knee injury, {t} if cleared by physio",
  when: "knee injury, {t} when cleared",
  only: "knee injury, {t} only ok on grass",
  pending: "knee injury, {t} pending being cleared",
  almost: "knee injury, almost fine for {t}",
  nearly: "knee injury, nearly cleared for {t}",
  partly: "knee injury, partly cleared for {t}",
  partially: "knee injury, partially cleared for {t}",
  mostly: "knee injury, mostly fine for {t}",
  hardly: "knee injury, {t} hardly ok",
  barely: "knee injury, barely cleared for {t}",
};

// ═══ Family E, sub-class "clash": one-source claims the flags must hide ═══════

/**
 * E's grounded constraint clashes (fix round, lens 1 minor: "the gated E set
 * has no grounded claims, so the lexicon carries no weight in the gated
 * bar"). Each name is a term the user's own constraints negate, so it is
 * GROUNDED (its words, in order, in one source: the constraints) and only a
 * flag (CONSTRAINT_CONFLICT) can hide it. Every negation cue of both parsers
 * appears, in the direction its lexicon documents: CONSTRAINT_CUES (F-R4-17,
 * negatedTermsOf) and rev 3's NEGATION_CUES before the term,
 * NEGATION_CUES_AFTER after it. The templates are frozen here, so the corpus
 * never moves with the lexicon; {t} is the negated activity.
 */
export const CLASH_TEMPLATES: Readonly<Record<string, readonly string[]>> = {
  // F-R4-17's cues (CONSTRAINT_CUES)
  no: ["no {t}", "Evenings only. No {t}."],
  not: ["not {t} at the moment"],
  avoid: ["avoid {t}"],
  without: ["without {t}"],
  "can't": ["can't do {t}"],
  cannot: ["cannot do {t}"],
  "don't": ["don't do {t}"],
  stop: ["had to stop {t}"],
  "doctor says": ["doctor says {t} is out"],
  injury: ["injury from {t}"],
  injured: ["injured while {t}"],
  pain: ["pain when {t}"],
  // rev 3's cues before the term (NEGATION_CUES)
  "no access to": ["no access to {t}"],
  "can not": ["can not do {t}"],
  "unable to": ["unable to do {t}"],
  cant: ["cant do {t}"],
  dont: ["dont do {t}"],
  never: ["never {t}"],
  bad: ["bad wrists from {t}"],
  sore: ["sore eyes from {t}"],
  // rev 3's cues after the term (NEGATION_CUES_AFTER)
  injuries: ["{t} injuries"],
  problems: ["{t} problems"],
};

/** The cues whose sense is a physical limit: their templates take only an activity the body does. */
export const CLASH_PHYSICAL_CUES: readonly string[] = ["injury", "injured", "pain", "bad", "sore", "injuries", "problems"];

/** The negated activities: Field-neutral, each a name the shape rule passes, none a catalog keyword (generate.ts asserts it). */
export const CLASH_TERMS: { physical: readonly string[]; other: readonly string[] } = {
  physical: ["typing", "handwriting", "screen time"],
  other: ["group work", "mental arithmetic"],
};

// ═══ E's "one-source" sub-classes: claims only the shape rule and a flag stand before (fix round 2) ═══

/** The flag families a one-source case is built for: the one that, by construction, must hide it once the layers above it are off. */
export type OneSourceFlag = "CLAIM_WORDS" | "ABOUT_YOU" | "PROPER_NOUN";

/**
 * Outline lines a user might write that hold a requirement or efficacy claim,
 * or a statement about themselves, with the gap names a model could copy from
 * each, in order ({t}: a topic phrase of the run's own outline, lower case;
 * {T}: the same, capitalised). Each name's content words stand in that one
 * line in order, so it is GROUNDED: on the gap path only the shape rule's
 * word clauses and then the named flag stand before it. Ground truth: F-R4-19
 * drops a name holding a claim or about-you word, grounded or not, and rev 3's
 * flags (CLAIM_WORDS, ABOUT_YOU) block one with no exemption for the user's
 * own words.
 */
export const ONE_SOURCE_LINES: readonly { flag: Exclude<OneSourceFlag, "PROPER_NOUN">; line: string; names: readonly string[] }[] = [
  { flag: "CLAIM_WORDS", line: "mandatory {t} for my job", names: ["Mandatory {t}", "Intro to mandatory {t}"] },
  { flag: "CLAIM_WORDS", line: "official {t} requirements", names: ["Official {t}"] },
  { flag: "CLAIM_WORDS", line: "required {t} for the licence", names: ["Required {t}"] },
  { flag: "CLAIM_WORDS", line: "guaranteed {t} results", names: ["Guaranteed {t}"] },
  { flag: "CLAIM_WORDS", line: "proven {t} methods", names: ["Proven {t}", "Proven {t} methods"] },
  { flag: "CLAIM_WORDS", line: "essential {t} first", names: ["Essential {t}", "Essential {t} basics"] },
  { flag: "CLAIM_WORDS", line: "recommended {t} practice", names: ["Recommended {t}"] },
  { flag: "CLAIM_WORDS", line: "certified {t} skills", names: ["Certified {t}", "Certified {t} skills"] },
  { flag: "CLAIM_WORDS", line: "accredited {t} training", names: ["Accredited {t}"] },
  { flag: "CLAIM_WORDS", line: "compulsory {t} work", names: ["Compulsory {t}"] },
  { flag: "ABOUT_YOU", line: "my weak {t} areas", names: ["Weak {t}", "Weak {t} areas"] },
  { flag: "ABOUT_YOU", line: "beginner {t} for me", names: ["Beginner {t}"] },
  { flag: "ABOUT_YOU", line: "already strong at {t}", names: ["Strong {t}"] },
  { flag: "ABOUT_YOU", line: "my {t} weakness", names: ["{T} weakness"] },
  { flag: "ABOUT_YOU", line: "I struggle with {t}", names: ["Struggle with {t}"] },
  { flag: "ABOUT_YOU", line: "{t} gaps I need to close", names: ["{T} gaps"] },
];

/**
 * A phrase of the user's own outline with a name nobody wrote put where
 * PROPER_NOUN reads it ({N}: an invented capitalised name; {n}: an invented
 * lower-case syllable run, so "{n}{N}" is camelCase; {A}: an invented
 * acronym; {t1}: the topic's first word, lower case). The name is in no
 * source, so grounding hides it first; with grounding off only PROPER_NOUN
 * does. Never the label's first word (PROPER_NOUN exempts it by design).
 */
export const ONE_SOURCE_NAME_FORMS: readonly string[] = ["Intro to {N} {t1}", "{T} {N}", "{T} and {N}", "{t} {n}{N}", "{T} {A}"];

/** Acronym letters: no Roman numeral letter (I, V, X, L, C, D, M), so an acronym is never read as a number. */
export const ACRONYM_LETTERS = "ABEFGHJKNPQRSTUWYZ";

// ═══ The metamorphic relations' inserts (M1–M7) ═════════════════════════════

/** Eight quote styles (M2): open and close. */
export const QUOTE_STYLES: readonly (readonly [string, string])[] = [
  ['"', '"'],
  ["“", "”"],
  ["'", "'"],
  ["‘", "’"],
  ["«", "»"],
  ["‹", "›"],
  ["„", "“"],
  ["「", "」"],
];

/** Zero-width and bidi characters (M5): format characters a reader never sees. */
export const INVISIBLES: readonly string[] = [
  "​", "‌", "‍", "⁠", "﻿", "‪", "‫", "‭", "‮", "⁦", "⁧", "⁨", "⁩", "‎", "‏", "؜",
];

/** The D-family's extra property names (F-R4-22 D): every slot a model might smuggle words into. */
export const SMUGGLE_PROPERTIES: readonly string[] = ["title", "label", "name", "why", "note", "reason", "description"];
