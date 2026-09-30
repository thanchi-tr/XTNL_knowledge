# Vision

XTNL becomes one character sheet for a whole life. One clock turns the day over at 04:00 local time for everything: todos, streaks, the review queue, attestation, quotas and settlement. The zone comes from NEXT_PUBLIC_USER_TIMEZONE, so server and client always agree.

The app opens on /today. The review queue is the first quest ('Clear the queue · 12 of 17 · paid by reviews'). Below it come the day's musts, todos and habits, the week's movement ring, the goals strip, and at the bottom anything still owed. Every row shows exactly what it will pay ('≈ 12 XP'). Tapping it pays exactly that amount and leaves a receipt that explains why.

Capture is one line from anywhere:
- 'c' or Ctrl/Cmd+K in the app, the header '+ Capture' button, or a bottom-left button on the phone.
- A home-screen shortcut, Android's share sheet, or Win+Shift+Q system-wide on the desktop.
- 'gym legs 60m every mon,thu !' is parsed on the device into visible chips. Tapping a chip turns that part back into plain words. The line is saved in one INSERT and can be undone.

Workouts arrive by themselves from Samsung Health through Health Connect. Years of history can be backfilled from Samsung's export without paying XP for the past.

Grading is 'AI sizes once, formula scores':
- An instant lexical grade is written first. Gemini then refines it once, in after(), returning only enums (category, band, duration band, attributes).
- The grade freezes at the first completion or after 24 h.
- A published, deterministic formula prices every completion. Nothing is random and nothing is ever repriced.
- Knowledge work is never paid twice: reviews already pay, so the review quest and study-linked tasks pay 0.
- A daily knee bends the XP curve after 100 XP, so grinding cannot outrun a steady week.

Compulsory tasks carry bounded XP debt. The debt stays on the board as make-up cards until the task is done, and each task keeps its own streak. Several things keep one bad day from becoming a what-the-hell spiral: a whole next day to record yesterday, earned freezes, rest, sick and vacation days, minimum versions, and a one-day repair.

Over months, four fixed life tracks (Body, Duty, Craft, Care) feed the same 13 attributes, emblem gates, title epithet and single character level as the knowledge Fields. Each track is capped by kept weeks, finished goals and PRs, never by volume. Mastery points come only from capped outcomes, under 3% of knowledge income, so the emblem economy keeps its 10–15-year horizon.

The user comes back because:
- the next step is always small and visible;
- the bookkeeping is automatic;
- the numbers are honest ('calibrating n/N' until they mean something);
- a slip can always be recovered.
