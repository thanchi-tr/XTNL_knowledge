/**
 * Phase 1 seed script.
 *
 * Populates the 6 Fields / 28 Domains from the seeding directives, each with
 * a handful of real Ideas spanning all four QuestionTypes. XP math (base
 * points, exponential yield decay, grace period) is computed with the exact
 * formulas from the spec so seeded rows are already internally consistent —
 * not placeholder zeros.
 *
 * What this script deliberately does NOT do (out of Phase 1 scope):
 *  - Call Gemini to populate `Idea.embedding`. Prisma Client cannot write an
 *    `Unsupported("vector(1536)")` column directly (needs `$executeRaw` with
 *    a vector literal) and DomainDiscoveryService — the thing that owns
 *    embedding generation — doesn't exist until Phase 2. Ideas are seeded
 *    with a null embedding; Phase 2's backfill script populates it.
 *  - Seed UnlockedSkill rows. The skill tree activates in Phase 4.
 */

import { PrismaClient, CollectionLabel, QuestionType } from "@prisma/client";
import { XP_BASE, yieldXp, graceEndsAt, dueDateFromOffset, domainLevel, fieldLevel } from "../src/lib/xp";
import { ATTRIBUTES, defaultCompositionFor } from "../src/lib/attributes";

const prisma = new PrismaClient();

// ============================================================================
// Idea seed shapes
// ============================================================================
interface BaseIdeaSeed {
  label: CollectionLabel;
  fragments?: number;
  dueOffsetDays?: number;
  failedAttempts?: number;
  level?: number;
}

interface ShortSeed extends BaseIdeaSeed {
  type: "SHORT";
  question: string;
  answer: string;
}

interface MultiSeed extends BaseIdeaSeed {
  type: "MULTI";
  options: string[];
  correct: string;
}

interface FormulaSeed extends BaseIdeaSeed {
  type: "FORMULA";
  question: string;
  answer: string;
}

interface DiagramSeed extends BaseIdeaSeed {
  type: "DIAGRAM";
  image: string;
  hotspots: { id: string; x: number; y: number }[];
  labels: Record<string, string>;
}

type IdeaSeed = ShortSeed | MultiSeed | FormulaSeed | DiagramSeed;

interface DomainSeed {
  name: string;
  ideas: IdeaSeed[];
}

interface FieldSeed {
  name: string;
  domains: DomainSeed[];
}

function ideaQuestionAndAnswer(idea: IdeaSeed): { question: string; answer: string; type: QuestionType } {
  switch (idea.type) {
    case "SHORT":
      return { question: idea.question, answer: idea.answer, type: "SHORT" };
    case "FORMULA":
      return { question: idea.question, answer: idea.answer, type: "FORMULA" };
    case "MULTI":
      return {
        question: JSON.stringify(idea.options),
        answer: idea.correct,
        type: "MULTI",
      };
    case "DIAGRAM":
      return {
        question: JSON.stringify({ image: idea.image, hotspots: idea.hotspots }),
        answer: JSON.stringify(idea.labels),
        type: "DIAGRAM",
      };
  }
}

// ============================================================================
// Seed data — Field: Trading
// Constraint: no AUD/USD figures anywhere; "Abstract R unit" / "Milestone #"
// only. Lore: 6mo reading (Fibonacci, Elliott Wave, Wyckoff, candlesticks) ->
// 1yr manual bar-by-bar backtesting in Excel -> the "3 hours of hell" ->
// systematic EUR/USD since 2019, shaped by Naked Forex and Mindfulness Trading.
// ============================================================================
const TRADING: FieldSeed = {
  name: "Trading",
  domains: [
    {
      name: "Quantitative System Dev",
      ideas: [
        {
          type: "SHORT",
          label: "BOOK",
          question:
            "What statistic combines expectancy and its standard deviation to estimate confidence that a trading edge is real?",
          answer: "System Quality Number (SQN)",
        },
        {
          type: "FORMULA",
          label: "BOOK",
          question:
            "SQN is sqrt(N) times the ratio of mean R-expectancy to the standard deviation of R. Write it using n, meanR, stdevR.",
          answer: "sqrt(n) * (meanR / stdevR)",
        },
      ],
    },
    {
      name: "Forex 101",
      ideas: [
        {
          type: "SHORT",
          label: "BOOK",
          question: "In EUR/USD, which currency is the base and which is the quote?",
          answer: "EUR is the base currency, USD is the quote currency",
        },
        {
          type: "MULTI",
          label: "BOOK",
          options: [
            "The smallest standardized price move for a currency pair",
            "A type of stop-loss order",
            "A candlestick pattern",
            "A margin call trigger",
          ],
          correct: "The smallest standardized price move for a currency pair",
        },
      ],
    },
    {
      name: "Scalping",
      ideas: [
        {
          type: "SHORT",
          label: "ACTIONABLE",
          question: "In the Abstract R risk framework, what does 1R represent?",
          answer:
            "One unit of risk — the amount lost if a trade hits its stop loss, used as the denominator for every P&L figure instead of raw currency",
        },
        {
          type: "MULTI",
          label: "PROPOSAL",
          options: ["The 3 Hours of Hell", "The Drawdown Spiral", "The Grind Session", "The Equity Bleed"],
          correct: "The 3 Hours of Hell",
          failedAttempts: 1,
          dueOffsetDays: -5,
        },
      ],
    },
    {
      name: "Algorithmic Backtesting",
      ideas: [
        {
          type: "SHORT",
          label: "ACTIONABLE",
          question:
            "What manual technique — using Excel and advancing one candle at a time — was used through the 1-year intensive backtesting period to eliminate look-ahead bias?",
          answer: "Bar-by-bar scrolling",
        },
        {
          type: "FORMULA",
          label: "BOOK",
          question: "Profit Factor is the ratio of gross profit to gross loss. Write it using grossProfit and grossLoss.",
          answer: "grossProfit / grossLoss",
        },
      ],
    },
    {
      name: "Risk Management",
      ideas: [
        {
          type: "SHORT",
          label: "ACTIONABLE",
          question: "What is the Stop Loss cap enforced on every trade, expressed as a percentage of account risk?",
          answer: "1%",
        },
        {
          type: "MULTI",
          label: "BOOK",
          options: ["Abstract R unit", "Pips", "Basis Points", "Ticks"],
          correct: "Abstract R unit",
        },
        {
          type: "DIAGRAM",
          label: "BOOK",
          image: "/diagrams/equity-curve-anatomy.svg",
          hotspots: [
            { id: "h1", x: 0.15, y: 0.3 },
            { id: "h2", x: 0.5, y: 0.75 },
            { id: "h3", x: 0.85, y: 0.4 },
          ],
          labels: { h1: "Peak Equity", h2: "Max Drawdown", h3: "Recovery" },
        },
      ],
    },
    {
      name: "Market Psychology",
      ideas: [
        {
          type: "SHORT",
          label: "BOOK",
          question:
            "Which two books most influenced the shift toward a systematic EUR/USD approach starting in 2019?",
          answer: "Naked Forex and Mindfulness Trading",
        },
        {
          type: "MULTI",
          label: "ACTIONABLE",
          options: [
            "Mindful Execution — stay systematic and let the process play out",
            "Immediately close all positions in panic",
            "Double the position size to recover faster",
            "Ignore the account for a week",
          ],
          correct: "Mindful Execution — stay systematic and let the process play out",
        },
      ],
    },
  ],
};

// ============================================================================
// Seed data — Field: Computer Science
// Lore: UoM BSc Software Systems, 2024, WAM 62, pivot off a mid-second-year
// biology/chemistry bridge.
// ============================================================================
const COMPUTER_SCIENCE: FieldSeed = {
  name: "Computer Science",
  domains: [
    {
      name: "Software Systems",
      ideas: [
        {
          type: "SHORT",
          label: "PROPOSAL",
          question: "What degree and major were completed at the University of Melbourne in 2024?",
          answer: "Bachelor of Science, majoring in Software Systems",
        },
        {
          type: "SHORT",
          label: "PROPOSAL",
          question:
            "What Weighted Average Mark (WAM) was held at graduation, following the earlier pivot away from a biology/chemistry bridge?",
          answer: "62",
        },
      ],
    },
    {
      name: "Next.js Architecture",
      ideas: [
        {
          type: "SHORT",
          label: "ACTIONABLE",
          question: "In the Next.js App Router, where can code marked with the 'use server' directive execute?",
          answer: "Only on the server — inside a Server Action or Route Handler, never in the client bundle",
        },
        {
          type: "MULTI",
          label: "BOOK",
          options: [
            "Next.js Server Actions or Cron jobs",
            "A client React component",
            "A browser localStorage script",
            "A Redux reducer",
          ],
          correct: "Next.js Server Actions or Cron jobs",
        },
      ],
    },
    {
      name: "Data Structures & Algorithms",
      ideas: [
        {
          type: "SHORT",
          label: "BOOK",
          question: "What is the average-case time complexity of a hash map lookup?",
          answer: "O(1)",
        },
        {
          type: "FORMULA",
          label: "BOOK",
          question: "Write the worst-case comparison count for binary search over n elements, using log base 2.",
          answer: "log(n, 2)",
        },
      ],
    },
    {
      name: "Vector Databases",
      ideas: [
        {
          type: "SHORT",
          label: "ACTIONABLE",
          question:
            "Which pgvector index type does Idea.embedding use instead of IVFFlat, chosen because it needs no training step and keeps recall high while the table is small?",
          answer: "HNSW",
        },
        {
          type: "FORMULA",
          label: "BOOK",
          question:
            "Cosine similarity between vectors A and B is their dot product divided by the product of their magnitudes. Write it using dotAB, normA, normB.",
          answer: "dotAB / (normA * normB)",
        },
      ],
    },
    {
      name: "System Optimization",
      ideas: [
        {
          type: "SHORT",
          label: "ACTIONABLE",
          question:
            "What framer-motion spring config (stiffness, damping) drives the Domain XP bar's fluid, per-fragment fill?",
          answer: "stiffness 120, damping 14",
        },
        {
          type: "MULTI",
          label: "BOOK",
          options: ["300ms", "1000ms", "50ms", "2 seconds"],
          correct: "300ms",
        },
      ],
    },
  ],
};

// ============================================================================
// Seed data — Field: Business & Finance
// Lore: XTNL as a strict trust fund architecture for Xuan Trinh and Ngoc Le.
// ============================================================================
const BUSINESS_FINANCE: FieldSeed = {
  name: "Business & Finance",
  domains: [
    {
      name: "Fund Management (XTNL)",
      ideas: [
        {
          type: "SHORT",
          label: "PROPOSAL",
          question: "What does XTNL formally represent as a legal and financial structure?",
          answer:
            "A strict trust fund architecture built for Xuan Trinh and Ngoc Le, encompassing long-term resource allocation logic",
          fragments: 2,
        },
        {
          type: "SHORT",
          label: "PROPOSAL",
          question: "Is XTNL best described as a product pitch, or as an institutional thesis and business structure document?",
          answer: "An institutional thesis and business structure document — not a product pitch",
        },
      ],
    },
    {
      name: "Quantitative Resource Allocation",
      ideas: [
        {
          type: "MULTI",
          label: "BOOK",
          options: ["95% CI Lower", "Sharpe Ratio", "Max Drawdown", "Win Rate"],
          correct: "95% CI Lower",
        },
        {
          type: "SHORT",
          label: "ACTIONABLE",
          question:
            "What is the purpose of requiring 3 consecutive weeks at or above 88% execution efficiency before a capital injection unlocks?",
          answer: "To gate additional capital allocation on proven, sustained execution discipline rather than one good week",
        },
      ],
    },
    {
      name: "Operational Logistics",
      ideas: [
        {
          type: "SHORT",
          label: "ACTIONABLE",
          question: "What recurring cadence does the unattended degradation Cron handler run on?",
          answer: "00:00 UTC, once per day",
        },
        {
          type: "MULTI",
          label: "BOOK",
          options: [
            "Novelty -> Expansion -> Saturation",
            "Saturation -> Novelty -> Expansion",
            "Expansion -> Saturation -> Novelty",
            "Novelty -> Saturation -> Expansion",
          ],
          correct: "Novelty -> Expansion -> Saturation",
        },
      ],
    },
    {
      name: "Trust Fund Architecture",
      ideas: [
        {
          type: "SHORT",
          label: "PROPOSAL",
          question: "Why does the architecture avoid coupling the trust's long-term value to any single trading edge?",
          answer: "So the fund's structure stays sound even if any individual strategy's edge decays or gets replaced",
        },
        {
          type: "MULTI",
          label: "BOOK",
          options: [
            "How do I prove it's not curve-fitted?",
            "How do I maximize leverage?",
            "How do I hide losses?",
            "How do I avoid taxation?",
          ],
          correct: "How do I prove it's not curve-fitted?",
        },
      ],
    },
  ],
};

// ============================================================================
// Seed data — Field: Biological & Chemical Sciences
// Lore: radiography deterred by a missed English B3 EAL score; 94.65 ATAR
// pivoted into science bridging.
// ============================================================================
const BIO_CHEM: FieldSeed = {
  name: "Biological & Chemical Sciences",
  domains: [
    {
      name: "Radiographic Imaging",
      ideas: [
        {
          type: "SHORT",
          label: "PROPOSAL",
          question: "What specific English-language score requirement was missed, deterring the original aim of studying radiography?",
          answer: "The English B3 EAL (English as an Additional Language) score requirement",
        },
        {
          type: "SHORT",
          label: "PROPOSAL",
          question: "What ATAR was achieved before pivoting into science bridging studies instead of radiography?",
          answer: "94.65",
        },
        {
          type: "DIAGRAM",
          label: "BOOK",
          image: "/diagrams/chest-xray-landmarks.svg",
          hotspots: [
            { id: "h1", x: 0.5, y: 0.18 },
            { id: "h2", x: 0.5, y: 0.45 },
            { id: "h3", x: 0.3, y: 0.7 },
          ],
          labels: { h1: "Clavicle", h2: "Cardiac Silhouette", h3: "Costophrenic Angle" },
        },
      ],
    },
    {
      name: "Cellular Biology",
      ideas: [
        {
          type: "SHORT",
          label: "BOOK",
          question: "What is the primary function of mitochondria in a eukaryotic cell?",
          answer: "Producing ATP through cellular respiration — the cell's energy powerhouse",
        },
        {
          type: "MULTI",
          label: "BOOK",
          options: ["Cell membrane", "Nucleolus", "Golgi apparatus", "Ribosome"],
          correct: "Cell membrane",
        },
      ],
    },
    {
      name: "Organic Chemistry",
      ideas: [
        {
          type: "SHORT",
          label: "BOOK",
          question: "What type of bond forms when two atoms share a pair of electrons?",
          answer: "A covalent bond",
        },
        {
          type: "MULTI",
          label: "BOOK",
          options: ["-OH (hydroxyl)", "-COOH (carboxyl)", "-NH2 (amine)", "-CHO (aldehyde)"],
          correct: "-OH (hydroxyl)",
        },
      ],
    },
    {
      name: "Neuroplasticity",
      ideas: [
        {
          type: "SHORT",
          label: "BOOK",
          question: "What is neuroplasticity?",
          answer: "The brain's capacity to reorganize itself by forming new neural connections in response to learning or experience",
        },
        {
          type: "MULTI",
          label: "BOOK",
          options: [
            "Distributed practice with expanding intervals",
            "Cramming the night before",
            "Passive re-reading",
            "Highlighting text",
          ],
          correct: "Distributed practice with expanding intervals",
        },
      ],
    },
  ],
};

// ============================================================================
// Seed data — Field: Mathematics & Statistics
// Constraint: FORMULA-heavy, LaTeX-flavored prompts for algebraic-equivalence
// grading.
// ============================================================================
const MATH_STATS: FieldSeed = {
  name: "Mathematics & Statistics",
  domains: [
    {
      name: "Linear Algebra",
      ideas: [
        {
          type: "FORMULA",
          label: "BOOK",
          question: "Write the dot product of two 2D vectors (a1, a2) and (b1, b2).",
          answer: "a1*b1 + a2*b2",
        },
        {
          type: "FORMULA",
          label: "BOOK",
          question: "Write the Euclidean norm (magnitude) of a vector with components x and y.",
          answer: "sqrt(x^2 + y^2)",
        },
      ],
    },
    {
      name: "Probability Theory",
      ideas: [
        {
          type: "FORMULA",
          label: "BOOK",
          question: "Write Bayes' theorem: express P(A|B) in terms of pBgivenA, pA, and pB.",
          answer: "(pBgivenA * pA) / pB",
        },
      ],
    },
    {
      name: "Stochastic Processes",
      ideas: [
        {
          type: "FORMULA",
          label: "BOOK",
          question:
            "The Ebbinghaus Forgetting Curve models recall probability R in terms of elapsed time t and memory strength S. Write it.",
          answer: "exp(-t/S)",
        },
      ],
    },
    {
      name: "Calculus",
      ideas: [
        {
          type: "FORMULA",
          label: "BOOK",
          question: "Write the power rule: the derivative of x^n with respect to x.",
          answer: "n*x^(n-1)",
        },
      ],
    },
  ],
};

// ============================================================================
// Seed data — Field: Personal Skill
// Lore: May 2012 migration Saigon -> Melbourne; pivot from slow investing to
// high-frequency systematic trading; drawdown emotional regulation.
// ============================================================================
const PERSONAL_SKILL: FieldSeed = {
  name: "Personal Skill",
  domains: [
    {
      name: "Mindfulness",
      ideas: [
        {
          type: "SHORT",
          label: "BOOK",
          question:
            "Which book reframes probabilistic thinking through a mindfulness lens, cited as an influence on this system's trading psychology?",
          answer: "Mindfulness Trading",
        },
        {
          type: "MULTI",
          label: "ACTIONABLE",
          options: [
            "Mindful Execution — stay systematic and let the process play out",
            "Panic and close everything",
            "Double the position size",
            "Ignore the account for a week",
          ],
          correct: "Mindful Execution — stay systematic and let the process play out",
        },
      ],
    },
    {
      name: "Systematic Discipline",
      ideas: [
        {
          type: "SHORT",
          label: "PROPOSAL",
          question: "What behavioral pivot took place in trading style — from what, to what?",
          answer: "From slow, discretionary investing to high-frequency systematic trading",
        },
        {
          type: "MULTI",
          label: "BOOK",
          options: ["+0.01 per day logged in", "No effect", "-0.01 per day", "Doubles weekly XP"],
          correct: "+0.01 per day logged in",
        },
      ],
    },
    {
      name: "Memory & Cognition",
      ideas: [
        {
          type: "SHORT",
          label: "BOOK",
          question:
            "Roughly what percentage of newly learned information is retained after 24 hours with no review, per the Ebbinghaus Forgetting Curve?",
          answer: "About 33%",
        },
        {
          type: "MULTI",
          label: "BOOK",
          options: ["150-200%", "10-20%", "500%", "No measurable difference"],
          correct: "150-200%",
        },
      ],
    },
    {
      name: "Peak Performance",
      ideas: [
        {
          type: "SHORT",
          label: "BOOK",
          question:
            "Per Zichermann (2011), rule-based game mechanics in non-game environments increase task completion by roughly what percentage?",
          answer: "35%",
        },
        {
          type: "MULTI",
          label: "BOOK",
          options: ["4 AM - 6 AM", "12 PM - 2 PM", "10 PM - 12 AM", "6 AM - 8 AM"],
          correct: "4 AM - 6 AM",
        },
      ],
    },
    {
      name: "Behavioral Conditioning",
      ideas: [
        {
          type: "SHORT",
          label: "PROPOSAL",
          question: "In what month and year did the migration from Saigon to Melbourne take place?",
          answer: "May 2012",
        },
        {
          type: "SHORT",
          label: "BOOK",
          question: "What consumable skill restores one degraded Idea to its previous level?",
          answer: "Time Reversal Token",
        },
      ],
    },
  ],
};

const FIELDS: FieldSeed[] = [TRADING, COMPUTER_SCIENCE, BUSINESS_FINANCE, BIO_CHEM, MATH_STATS, PERSONAL_SKILL];

// ============================================================================
// Runner
// ============================================================================
async function main() {
  // Idempotency: `prisma migrate dev` auto-runs this seed after every
  // migration it applies, on top of any explicit `npm run db:seed`. Field is
  // upserted below, but Domain/Idea are plain `create` calls, so without
  // clearing them first, every extra invocation would duplicate all 56
  // Domains and ~110 Ideas. Deleting is safe here because these two tables
  // are entirely owned by this seed script — nothing else writes to them at
  // this phase.
  await prisma.idea.deleteMany({});
  await prisma.domain.deleteMany({});

  for (const fieldSeed of FIELDS) {
    // A keyword-derived starting composition (attributes.ts), not 13
    // zeroes — without this the skill system's whole attribute-score
    // substrate is empty for every seeded Field. `update: {}` on an
    // existing Field leaves its composition alone, matching this upsert's
    // existing re-run-safety for `name`.
    const composition = defaultCompositionFor(fieldSeed.name);
    const field = await prisma.field.upsert({
      where: { name: fieldSeed.name },
      update: {},
      create: {
        name: fieldSeed.name,
        attributes: {
          create: ATTRIBUTES.map((attribute) => ({ attribute, weight: composition[attribute] })),
        },
      },
    });

    for (const domainSeed of fieldSeed.domains) {
      const domain = await prisma.domain.create({
        data: { name: domainSeed.name, fieldId: field.id },
      });

      let domainYieldTotal = 0;

      for (const [nSimilar, ideaSeed] of domainSeed.ideas.entries()) {
        const { question, answer, type } = ideaQuestionAndAnswer(ideaSeed);
        const level = ideaSeed.level ?? 1;
        const base = XP_BASE[type];
        const yieldPoints = yieldXp(base, nSimilar);
        const dueDate = dueDateFromOffset(ideaSeed.dueOffsetDays ?? ((nSimilar % 7) - 3));

        await prisma.idea.create({
          data: {
            domainId: domain.id,
            collectionLabel: ideaSeed.label,
            level,
            basePoints: base,
            yieldPoints,
            fragments: ideaSeed.fragments ?? 1,
            question,
            questionType: type,
            answer,
            dueDate,
            graceEndsAt: graceEndsAt(dueDate, level),
            failedAttempts: ideaSeed.failedAttempts ?? 0,
          },
        });

        domainYieldTotal += yieldPoints;
      }

      // Reward XP math (spec: "+2 XP to the Domain's totalPoints" per passed
      // review) isn't earned yet at seed time — no reviews have happened.
      // totalPoints starts from the sum of seeded yieldPoints so
      // Level_domain = floor(0.5 * sqrt(totalPoints)) is meaningful from
      // the first page load instead of every domain reading Level 0.
      await prisma.domain.update({
        where: { id: domain.id },
        data: {
          totalPoints: domainYieldTotal,
          level: domainLevel(domainYieldTotal),
        },
      });
    }

    const domains = await prisma.domain.findMany({ where: { fieldId: field.id } });
    await prisma.field.update({
      where: { id: field.id },
      data: { level: fieldLevel(domains.map((d) => d.level)) },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
