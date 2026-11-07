# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Groups of 3–10 people who share costs: on a trip, a meal out, a shared house or room. Originally students, but the audience is wider (confirmed 2026-11-05): working adults, families and mixed-age groups too, so small type and slang cannot be assumed to work for everyone. Used mostly on a phone, during the trip (adding an expense right after paying) and afterwards (settling up, sending money, checking who has paid).

## Product Purpose

Record who paid for what as it happens, from everyone's own phone, then tell the group who should transfer how much to whom in the fewest transfers. It makes paying back effortless (a PromptPay QR with the amount filled in) and keeps track of who has actually paid (a slip read by AI, confirmed by the receiver). Success: a real group finishes a trip without anyone doing the maths or chasing payments in the chat.

## Positioning

Thai-first: PromptPay QR (EMVCo) and reading Thai bank slips are built in, which overseas splitters do not do. Everyone sees changes live; edits made at the same time become a choice, not a silent overwrite; it works with no signal. No account is needed, only a nickname.

## Operating Context

- Phones, often outdoors or in restaurants, sometimes with no signal (mountains, islands); installable as a PWA.
- Money moves in the group's banking apps; HarnKan never holds or moves money. Payers scan the QR in their bank app, then upload or share the slip.
- Groups invite each other with a link or QR, usually pasted into a LINE group.

## Capabilities and Constraints

- Trips, members (including placeholder names for friends who have not joined), expenses split equally, by weight, or by exact amounts, in baht only (integer satang).
- Settlement with the minimum number of transfers; payments are claimed by the payer and confirmed by the receiver.
- Slip reading: Gemini vision or local OCR. The image is never stored; only amount, time, shortened receiver name, last 4 digits and reference are kept.
- Must never claim to verify a slip with a bank. Bank verification needs partner APIs and is out of scope.
- Joining: an invite link, plus the trip owner can lock the trip to new members and replace the link so old links stop working (decided 2026-11-05).
- Out of scope this round: in-app payments, currency conversion, native apps.

## Brand Commitments

- Name: หารกัน (HarnKan).
- Voice: polite, neutral Thai (decided 2026-11-05), clear rather than chatty, never slangy.
- It must not look like a banking app (stiff, cold, transactional), not childish or cartoonish (it handles money), and not like a generic template or AI/SaaS app.

## Evidence on Hand

- Synthetic slip set and matching eval: `eval/fixtures/synthetic/`, `eval/results/match-ocr.md` (60 fictional slips, 92% auto-tick, 0 false ticks).
- Demo screenshots from a fictional trip: `docs/screenshots/`.
- No real users, testimonials or real-trip data yet; do not invent any.

## Product Principles

1. Money facts are exact and explained: every number can be traced to the expenses behind it.
2. Nothing silently disappears: conflicts, offline changes and unconfirmed payments are always visible.
3. The receiver has the final say on money received; the app only reads and suggests.
4. Slips are sensitive: keep the least data needed, for the shortest time.
5. Fast on a phone with one hand, with or without signal.

## Accessibility & Inclusion

Mixed-age users: readable type sizes, strong contrast, large touch targets, and respect for reduced-motion settings.
