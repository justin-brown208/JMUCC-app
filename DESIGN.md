# JMUCC App — Design Language

The whole system is deliberately minimal: **one surface recipe, one accent, two
type roles, a 9px radius, and a navy→black gradient** — recombined by size and
outline color to cover input, selection, navigation, announcement, and reference.

---

## 1. Tokens

### Color (semantic)
| Token | Value | Role |
|---|---|---|
| `surface` | rgb(33, 57, 87) — navy | Primary fill for every surface (fields, chips, buttons, cards) + gradient top |
| `surface-raised` | rgb(49, 87, 130) | Fill for large content boxes that need to lift off the gradient (paired with an outline) |
| `accent` | rgb(226, 199, 140) — gold | The sole accent: titles, active outlines, list tick-bars, dividers, dropdown carets |
| `text` | #FFFFFF | Primary body copy and values on blue |
| `text-muted` | rgb(171, 171, 171) | Labels, placeholders, inactive controls, and inactive outlines |
| `gradient-end` | #000000 | Gradient terminus only — never a fill on its own |

**Signature surface:** a full-bleed vertical gradient
`linear-gradient(180deg, var(--surface) 0%, var(--gradient-end) 100%)`, pinned to
the viewport so it fills the screen and survives scroll. *(Already implemented in
[app/src/index.css](app/src/index.css).)*

### Type — two families, never mixed within a role
- **Montserrat** (Regular/Medium) → all body: content, values, labels, chips, timestamps, fine print.
- **TradeGothic LT CondEighteen Bold** → all display: screen titles, button & card-header labels, and the calendar hero. Uppercase for titles and buttons.

| Step | Size | Family / treatment | Use |
|---|---|---|---|
| hero | 48 | display · white | Calendar widget's featured (current/next) event |
| title | 24 | display · gold · uppercase | Screen title / eyebrow |
| action | 16 | display · uppercase | Buttons, card headers |
| label | 15 | Montserrat · muted | Field labels |
| body | 13 | Montserrat · white | Content, values, chip text |
| meta | 12 | Montserrat · muted | Timestamps, secondary attributes, fine print |

> Sizes are a rationalized scale, not sacred Figma pixels — adjust the steps, keep the roles.
> The display font is licensed; source a webfont or pick a condensed-bold fallback (e.g. Oswald / Barlow Semi Condensed) if it isn't available.

### Geometry
- **Radius:** `radius` = 9px on every interactive surface; `radius-sm` = 2px on the accent tick-bar.
- **Outline:** a 1px inset outline carries state — **gold** = active/important/editable/selected, **muted** = inactive/secondary/unselected. *(Implement as an inset outline so it never shifts layout.)*
- **Spacing:** 4px base unit → 4 / 8 / 12 / 16 / 24 / 32 / 48.
- **Layout:** one centered, responsive column (max-width on phones, fluid below) — no fixed canvas size.

---

## 2. Components

**A. Surface — the universal primitive.** `surface` fill + 9px radius + 1px inset
outline. Resized, it *becomes* an input, a chip, a button, or a card — consistency
from the recipe, hierarchy from the outline color (gold = important, muted =
passive). Large content boxes swap the fill to `surface-raised` to stand off the gradient.

**B. Selector chip strip.** Small surfaces (~28px tall, muted outline, centered
body text) in a horizontally-scrolling row. For multi-value pickers where every
option shows at once: recipient roles, Division (1–6), Team Letter (A–D).

**C. Full-width action button.** A surface at full column width (~48px tall) with
a centered display label. Muted outline = navigation / "open the full record" /
send — e.g. Competition Rules, Previous Messages, Full Rulebook, Full FAQ, Send,
Reset. Stacked vertically.

**D. Labeled input field.** Muted-outline surface (tall for multiline, short for
single-line) under a muted label. White text, muted placeholder. A **dropdown**
variant adds a gold caret. Used for the notification body, the Competition Rules
question box, and the school dropdown.

**E. Reference card with accent bar.** A 4px-wide, 2px-radius gold vertical bar at
the left edge marks a content block: display/white title + Montserrat body. For
read-only scrollable lists — rulebook sections, FAQ entries, past messages. The
gold bar is the recurring "entry marker."

**F. Screen title & hero.** Title: display, gold, uppercase, centered — the fixed
identity line of every screen. Hero: the calendar widget's featured event in
display/white at the large step, sitting over the gold title as its eyebrow.

**G. Meta / timestamp text.** Muted Montserrat, right-aligned against event rows —
schedule times and attributes that must recede behind titles.

**H. Status / position indicator.** A compact state marker for request tickets,
following the same outline-not-fill logic: a small pill (9px radius, 1px outline,
no fill) whose *outline + label color* encode state — **gold** for the live/active
state a user is waiting on ("You're #3", claimed/"on it"), **muted** for settled
or passive states (resolved, canceled). The position number itself is display-face
so it reads as the salient figure. No new colors — reuses `accent` / `text-muted`.
Request rows are otherwise built from **E** (accent-bar card) + **G** (meta) with
**C**-style inline actions (Claim / Resolve / Cancel).

---

## 3. Grammar (composition rules)

- **One accent, used sparingly.** Gold only for titles, active outlines, list
  bars, carets, and dividers. Passive-but-functional = muted; readable-and-primary
  = white. **Blue is structure, never emphasis.**
- **State = outline swap, not fill swap.** Selection/importance trades a muted
  outline for a gold one on the *same* surface. No hover fills, no color washes.
- **Hierarchy = typeface + case, not size alone.** Condensed uppercase = a heading
  or button; sentence-case Montserrat = content; muted Montserrat = a label or an
  inactive control.
- **Two blues.** `surface` for most things; `surface-raised` to lift large content
  boxes off the gradient.
- **Dividers are hairlines:** gold under groups, translucent white inside fields.
- **Layout is centered and stacked** on a single responsive column — labels
  left-aligned, titles and buttons centered, option chips in horizontal strips.

---

## 4. When to reach for what
- Need input? → **D** (label + muted-outline box).
- Need a set of picks visible at once? → **B** chips in a strip.
- Need to send / navigate / open a full record? → **C** full-width button.
- Need to flag the important selectable item or the live draft? → same surface, **gold** outline (**A**).
- Serving read-only reference entries? → **E** cards with the gold accent bar.
- Featuring the current event? → **F** hero, white, over a gold eyebrow.
- Marking a ticket's state / queue position? → **H** gold pill when live/waiting, muted when settled.
