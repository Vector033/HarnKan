---
name: หารกัน (HarnKan)
description: A trip cost splitter drawn as a Thai food-court coupon booklet. Every amount owed is a numbered coupon.
colors:
  ink: "#14302b"
  ink-2: "#1f443d"
  ground: "#eef1ef"
  paper: "#ffffff"
  muted: "#4f625d"
  line: "#d3dcd8"
  perf: "#a9b8b2"
  serial: "#a3271f"
  owe: "#a3271f"
  owe-soft: "#fbe6e3"
  ok: "#1d6b4a"
  ok-soft: "#dcefe5"
  wait: "#8a5300"
  wait-soft: "#fbefd6"
  pp: "#1b3f73"
  t0: "#f6cdd6"
  t1: "#c4e8d6"
  t2: "#c5dcf3"
  t3: "#f3e19a"
  t4: "#dccdf1"
  t5: "#f8d2b4"
typography:
  display:
    fontFamily: "Anuphan, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Anuphan, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Anuphan, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  meta:
    fontFamily: "Anuphan, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  amount:
    fontFamily: "Kanit, Anuphan, system-ui, sans-serif"
    fontWeight: 600
    letterSpacing: "0"
    fontFeature: "tnum"
  serial:
    fontFamily: "Kanit, Anuphan, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "0.06em"
    fontFeature: "tnum"
rounded:
  coupon: "14px"
  control: "12px"
  chip: "6px"
spacing:
  stack: "8px"
  coupon-y: "12px"
  coupon-x: "14px"
  gutter: "16px"
  section: "28px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.ink-2}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "48px"
  button-quiet:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "48px"
  button-danger:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.owe}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "48px"
  button-add-expense:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.coupon}"
    padding: "0 20px"
    height: "56px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
  coupon:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.coupon}"
    padding: "12px 14px"
  chip-pending:
    backgroundColor: "{colors.wait-soft}"
    textColor: "{colors.wait}"
    typography: "{typography.meta}"
    rounded: "{rounded.chip}"
    padding: "2px 8px"
  notice-error:
    backgroundColor: "{colors.owe-soft}"
    textColor: "{colors.owe}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
  header-band:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    padding: "12px 16px 16px"
  tab-bar:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted}"
    typography: "{typography.meta}"
    height: "64px"
  promptpay-panel:
    backgroundColor: "{colors.pp}"
    textColor: "{colors.paper}"
    rounded: "{rounded.coupon}"
    padding: "14px 16px 20px"
---

# Design System: หารกัน (HarnKan)

## Overview

**Creative North Star: "The Food-Court Coupon Booklet"**

Every amount owed is a numbered coupon torn from the trip's own booklet. The world is the coupon stock of a Thai food court: white paper slips on a cool pale ground, a deep ink green-black for the shell and all text, one pastel coupon tint per member, and small red serial numbers printed in a corner. Perforations are dashed lines, and a payment that is confirmed tears off along its perforation.

The density is phone-first and single column, at most 512px wide, built for one hand and mixed-age eyes. Rank comes from weight before size: a four-step type scale, with section headings at body size in bold rather than in a larger size. State is carried by line form instead of colour: dashed means pending, solid means settled, struck through means the money did not move.

The world rejects the fintech dashboard (white cards, a green accent, charts) and the green/red money ledger. Balances are ink amounts with words ("คุณต้องโอนรวม", "เพื่อนต้องโอนให้คุณรวม"), never a sign colour.

**Key Characteristics:**
- Ink green-black shell and text on a cool pale ground; white coupons on top.
- One coupon tint per member, by join order, reused for their tile, their payer chip and coupons they are owed.
- Red only for serial numbers (and, through the owe tokens, error and destructive text).
- Amounts and serials in Kanit with tabular figures; every other word in Anuphan.
- Dashed perforations as both decoration and state.
- Soft coupon corners (14px) and controls (12px); no pills.

## Colors

A cool, low-chroma ink-and-paper base with a set of six pastel coupon tints and one small red accent.

### Primary
- **Coupon Ink** (ink): the shell colour of the header band, the primary button, the add-expense button, the active-tab bar and badge, the focus ring, and all body text. `themeColor` in the layout matches it.
- **Ink Press** (ink-2): the hover and active state of ink buttons only.

### Secondary
- **Serial Red** (serial): coupon and booklet numbers ("No. 2116", "No. 2116-61"), always at 13px semibold. It was darkened from the planned #c7352c so it reaches 4.5:1 on every member tint at 13px.

### Tertiary
- **Coupon Tints** (t0 rose, t1 mint, t2 sky, t3 lemon, t4 lilac, t5 apricot): one per member in join order, cycling after six. They fill the member tile, the "your share" stub, and a transfer coupon you need to pay (tinted with the receiver's colour). Lemon (t3) is also the text-selection colour and the dashed "sending" chip on the ink header. Mint (t1) is the "online" (ออนไลน์) chip on the header; its ok dot sends out a soft ring every 2.4s (none under reduced motion).
- **PromptPay Navy** (pp): a real-world scheme colour, not a world colour. It is used only for the QR panel and the QR button's text and border, so the QR looks like the one people see at shop counters.

### Neutral
- **Cool Ground** (ground): the page background, the sheet body, and the sticky day-guide rows (at 95% opacity).
- **Coupon Paper** (paper): coupons, inputs, secondary buttons, the sheet header and footer, and the tab bar.
- **Muted Ink** (muted): secondary text, hints, inactive tabs, and struck-through amounts.
- **Rule Line** (line): input borders, the tab-bar top edge, and dividers between expense rows inside a coupon.
- **Perforation Grey** (perf): dashed perforations, the empty-state border, and the scrollbar thumb.

### Status
- **Owe** (owe, owe-soft): error text, inline error notices, destructive confirmations and the danger button. It shares the serial hex but is a separate role. It is never used to colour a balance.
- **OK** (ok, ok-soft): positive status only (the live dot, a slip that matches, a split that adds up exactly, the privacy shield). It is not used for balances.
- **Wait** (wait, wait-soft): pending and awaiting states, always paired with a dashed outline.

### Named Rules
**The Serial Red Rule.** Red is for serial numbers. Errors and destructive actions use the owe tokens. No other surface, icon or amount is red.

**The No Ledger Rule.** Balances are ink amounts with words that say which way the money goes. Never use green for money in and red for money out.

**The One Tint Per Member Rule.** A member keeps the same tint everywhere for the whole trip, assigned by join order. Tints mark people, not states.

## Typography

**Display / UI Font:** Anuphan (with system-ui, sans-serif), weights 400 to 700.
**Numeral Font:** Kanit (with Anuphan, system-ui), weights 500 and 600, always with tabular figures.

**Character:** Anuphan is a calm, rounded Thai sans that reads clearly at small sizes for older users. Kanit's firmer, slightly condensed numerals feel like printed coupon figures and keep columns of baht aligned.

### Hierarchy
- **Display** (bold, 34px, 1.2, so Thai marks above and below a wrapped line never touch): the app name on the home header, the "you owe" balance, and the amount on the PromptPay panel. Amounts at this size are Kanit semibold.
- **Title** (bold, 22px, 1.25): the trip name in the header band. Amounts at this size (stub totals, coupon amounts) are Kanit semibold.
- **Body** (regular, 16px, 1.55): all running text, buttons, inputs, and section headings (bold). Explanatory paragraphs are capped around 30 to 36ch.
- **Meta** (regular to semibold, 14px, 1.5): labels, hints, timestamps, chips, tab labels and day-guide rows.
- **Serial** (Kanit semibold, 13px, 0.06em tracking, serial red): coupon numbers only.
- The baht sign follows an amount at 0.72em, medium weight.

### Named Rules
**The Four Steps Rule.** The scale has four steps: meta 14, body 16, title 22, display 34. Rank comes from weight first, then size. Nothing readable is below 14px; the 13px serial is the only exception, and it is a mark, not a sentence.

**The Coupon Numerals Rule.** Every amount, serial and count is set in Kanit with tabular figures. Words are never set in Kanit.

## Layout

Phone first: a single column, centred, at most 512px wide, up to 1023px. The page gutter is 16px; the home and join pages use 20px inside the header band. An ink header band opens every page; on the trip screen it is sticky, and the day-guide rows stick directly under it (at 76px) while their day is in view.

The trip screen has a fixed three-tab bar at the bottom (64px tall, safe-area aware) and a fixed add-expense button above it on the right, aligned to the column edge on wide screens. Main content reserves 128px of bottom padding so neither covers the last row.

**Wide screens (1024px and up).** The ink band runs the full width with its content in a centred 1152px container.
- **Trip:** two columns. The left shows expenses or members (two tabs in the ink band, active marked by a 3px mint bar); the right is the settlement, always visible, 400px wide and sticky under the header. The bottom tab bar is gone and "เพิ่มรายจ่าย" sits at the top of the list, not floating. The "you need to transfer" banner is hidden because the settlement is already on screen.
- **Home and join:** split screen. The left half is the ink band, sticky and full height, with the name, the line and the example coupon; the right half holds the form and the trip list at most 576px wide.
- **Privacy:** the band runs full width; text stays at a 672px measure.
- Rows that stick under the header read its measured height (`--header-h`), so a two-line trip name never covers them.

Spacing rhythm: 8px between coupons in a list, 10px between side-by-side stubs, 12px by 14px inside a coupon, 20px inside sheets and forms, 28px to 32px between sections. Sheets are bottom sheets on phones (up to 92dvh) and centred dialogs from 640px up.

## Elevation & Depth

Depth comes mostly from tone: white paper on a cool ground, the ink band above, and a dimmed ink backdrop (ink at 45%) behind sheets. Coupons rest on the table with a faint contact shadow (softness borrowed, as an idea only, from friendly Thai money apps; never their colours, clouds or names).

### Shadow Vocabulary
- **Floating button lift** (`box-shadow: 0 6px 18px -6px rgb(20 48 43 / 0.55)`): only on the fixed add-expense button, which floats over scrolling content.
- **Tile edge** (`box-shadow: inset 0 0 0 1.5px rgb(20 48 43 / 0.16)`): an inner hairline on member tiles so pale tints hold their edge on white.

### Named Rules
- **Paper contact** (`0 1px 2px rgb(20 48 43 / 0.05), 0 8px 22px -14px rgb(20 48 43 / 0.28)`): every coupon. It is removed while a coupon tears.

**The Paper On The Table Rule.** Coupons rest; they never lift. No hover lift, no growing shadows. Only the add-expense button floats.

## Shapes

Small, slightly softened rectangles, like cut coupon stock. Coupons, sheets, the empty state, the PromptPay panel and the add-expense button use the coupon corner (14px). Buttons, inputs, notices and member tiles use the control corner (12px). The ink band on the home, join and privacy pages has a 28px curved bottom on phones. Chips, segmented options and the tab badge use the chip corner (6px). There are no pills; the only full circle is the 6px live dot.

Perforations are 2px dashed lines in perforation grey (or tinted ink at 25 to 35% on coloured coupons). A vertical perforation separates a coupon's body from its amount stub; a horizontal one separates a coupon from its actions, and a sheet's title from its body.

### Named Rules
**The Line Form Rule.** Dashed means pending or not settled, solid means settled, struck through means cancelled or rejected. Pending chips, pending notices and claims awaiting confirmation always carry a dashed edge.

## Components

### Buttons
Firm and plain, ink on paper.
- **Shape:** control corner (12px); the add-expense button uses the coupon corner (14px).
- **Primary:** ink fill, white semibold body text, at least 48px tall, 12px by 20px padding. Hover and press go to ink press; disabled drops to 45% opacity.
- **Secondary:** paper fill, ink text, 1px ink border at 25% (50% on hover), at least 48px tall; press fills with ground.
- **Quiet:** no fill, ink text underlined at 30% (full on hover), at least 48px tall.
- **Press:** every enabled button scales to 0.98 on press (150ms ease-out); whole tappable coupons scale to 0.99. Coupons never lift on hover.
- **Danger:** paper fill, owe text, owe border at 40% (full on hover).
- **Add expense:** the primary button, fixed at the bottom right, 56px tall, with the floating button lift.
- **Focus:** a 2px ink outline, offset 2px, on every focusable element.

### Chips
- **Style:** meta semibold, chip corner (6px), 2px by 8px padding.
- **State:** pending is wait text on wait-soft with a dashed wait border; "live" is ink on mint with an ok dot; offline and connecting are white on white at 12% over the ink band; sending is lemon text with a dashed lemon border.

### Cards / Containers (Coupons)
- **Corner Style:** coupon corner (14px), content clipped.
- **Background:** paper; tinted with a member's tint when it is that member's money (your share, a transfer you need to pay). Unsettled history coupons sit at 60% paper.
- **Shadow Strategy:** paper contact only (see Elevation & Depth).
- **Border:** none; structure comes from perforations and row dividers in rule line.
- **Internal Padding:** 12px by 14px; 16px for the balance coupon.

### Inputs / Fields
- **Style:** paper fill, 1px rule-line border, control corner (12px), 12px by 14px padding, body text.
- **Focus:** border turns ink with a 2px ink ring at 15%.
- **Labels and hints:** label in meta semibold ink above; hint in meta muted below; errors in meta owe below.

### Navigation
- **Header band:** ink fill, white text, trip name in title bold, member count in meta in a pale green-grey; sync chip on the right; back button 48px square. Focus rings inside the ink band and the PromptPay panel are white.
- **Tab bar:** three equal tabs on paper with a rule-line top edge, 64px tall, icon over a meta semibold label. Active is ink with a 3px ink bar at the top edge and a heavier icon stroke; inactive is muted. A pending-confirmation count sits as an ink badge.

### Coupon Stub (signature)
A coupon split by a vertical perforation: the body holds the label, names and the serial; the stub holds the amount in Kanit semibold. Amounts that would not fit drop one type step rather than clip.

When a receiver confirms a payment, three beats play in order (about 1s, the peak of the app):
1. **Stamp:** a "ได้รับเงินแล้ว" rubber stamp lands on the body (ok border 2.5px, ok text, paper at 90%, chip corner): from 1.45x and -14deg to 1x and -6deg in 350ms on the exponential ease-out. Green here is a status mark, not a balance colour.
2. **Tear:** the stub tears off along the perforation (24px right, 10px down, 6deg, opacity held until 60%, 280ms). Each piece carries its own paper, so the gap shows the ground.
3. **Fold:** the remaining coupon folds away (rows to 0, 200ms), then the payment files into history.

Under reduced motion the stamp appears without travel and the stub fades in 200ms; there is no fold. If the decision fails, the coupon comes back whole.

The home page shows the same coupon once, as a labelled example ("ตัวอย่าง"), only while the device has no trips: it settles in at -1.5deg and its stamp lands once. It never loops.

### Sheet
A bottom sheet on phones and a centred dialog from 640px, on the ground colour with a paper title bar, a horizontal perforation under the title, and a paper footer for actions. It rises 24px in 240ms when it opens and the backdrop fades in over 200ms. A sheet holding a typed draft asks "ทิ้งข้อมูลที่กรอกไว้?" before Escape, the backdrop or the X can close it; the conflict sheet cannot be dismissed at all, only answered. While a slip is read, the result rows show dashed placeholder values (dashed = not settled yet) with a faint sweep.

### PromptPay Panel
The QR on a white 8px-cornered tile inside a PromptPay navy panel with the coupon corner, the amount in display Kanit below it, and the payee with a masked PromptPay ID in pale blue.

### Settle Strip
How much of the trip is settled, in the Line Form language: a dashed perforation track (not settled) filled with solid ink (confirmed money), 10px tall with chip corners, never a pill. Label left in meta, "settled / total ฿" right in Kanit. At 100% the label turns ok with a check: "ทุกคนโอนกันครบแล้ว" (or "โอนครบแล้ว" in the compact form on home trip coupons, which hides the amounts). It sits under "ใครโอนให้ใคร" and on every trip coupon cached on the device. Claimed but unconfirmed money counts as not settled.

### Empty State
A coupon-cornered box with a 2px dashed perforation border, a body semibold title and a muted body line capped at 32ch.

## Do's and Don'ts

### Do:
- **Do** give every coupon a serial number in serial red, 13px Kanit semibold.
- **Do** show which way money goes with words and an ink amount, never with a sign colour.
- **Do** keep each member on one tint for the whole trip, assigned by join order.
- **Do** use dashed edges for pending, solid for settled, and strikethrough for cancelled.
- **Do** keep to the four type steps (14, 16, 22, 34) and build rank with weight first.
- **Do** keep every touch target at least 48px (buttons, icon buttons, segments, standalone links).
- **Do** keep PromptPay's own navy (#1b3f73) on the QR panel.

### Don't:
- **Don't** use red for anything except serial numbers; errors and destructive actions use the owe tokens.
- **Don't** colour balances green and red like a bank ledger.
- **Don't** set readable text below 14px.
- **Don't** use pill-shaped buttons, chips or badges.
- **Don't** lift coupons on hover or give them anything heavier than the paper contact shadow.
- **Don't** build a fintech dashboard of white cards, a green accent and charts.
