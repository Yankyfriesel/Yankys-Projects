# Design and UI conventions

Short rules so every screen looks and behaves the same. The owner can review every token and component on `/design` (owner only, not in the menu).

## The idea

A calm, classic look, organized: warm paper, a dark menu, thin accent hairlines, the brand colour kept for actions, and a serif face for titles and numbers. Nothing shouts. Things settle into place. The user should feel at ease within a second of logging in.

This is deliberately **not** a copy of the previous system (dark navy, bright pink-red, very round cards). It keeps what worked there (a side menu at the reading start, cards, pop-ups in the middle of the screen) and changes the character.

### Tokens (`src/app/globals.css`)

| Token                    | Value                 | Use                                                                               |
| ------------------------ | --------------------- | --------------------------------------------------------------------------------- |
| `--background`           | `#f6f1e9`             | Page canvas (warm paper)                                                          |
| `--card`                 | `#fffefb`             | Cards, pop-ups, inputs                                                            |
| `--foreground`           | `#1e1b18`             | Text (warm charcoal)                                                              |
| `--muted-foreground`     | `#756b5f`             | Secondary text                                                                    |
| `--border` / `--input`   | `#e4dacb` / `#dcd0be` | Hairlines, fields                                                                 |
| `--primary`              | `#1f6f78`             | Main actions, focus ring (brand colour)                                               |
| `--sidebar`              | `#25221f`             | Side menu, phone bar, welcome panel (warm charcoal, formerly bottle green)        |
| `--sidebar-primary`      | `#e2b866`             | Accent on the green: active marker, icons                                          |
| `--gold` / `--gold-soft` | `#b8862b` / `#f7edd8` | Accent on paper: labels, icon rings, ornaments                                     |
| `--brand`                | `#1a5f68`             | The logo's own colour                                                                |
| `--success` / `-soft`    | `#2f6f4e` / `#e8f2ea` | In date, connected, OK                                                            |
| `--warning` / `-soft`    | `#a8620a` / `#fcf1dc` | Expiring soon                                                                     |
| `--destructive`          | `#d92d20`             | Expired, errors                                                                   |
| `--info` / `-soft`       | `#2d5b86` / `#e8f0f7` | Neutral information                                                               |
| `--radius`               | `0.625rem`            | Base. Cards `rounded-2xl`, pop-ups `rounded-3xl`, buttons and inputs `rounded-lg` |

The brand primary and the expiry red are different reds on purpose, and **every status carries an icon and a label**, never colour alone. Use the `Badge` variants `success`, `warning`, `destructive`, `info`, `soft`.

### Type

- **Frank Ruhl Libre** (serif, Hebrew and Latin) for page titles, card titles, pop-up titles and the big numbers: `font-serif`, and `font-heading` already maps to it.
- **Heebo** for everything people read and type: forms, tables, buttons, menu.
- **Geist Mono** for barcodes and codes. Numbers use `tabular-nums`.
- Small accent labels (eyebrows, menu section names) are 11px, semibold, wide letter spacing.

### Motion

Calm and short. Page headers, stat tiles and cards use `.rise` (a 10px fade-up, 0.6s) with `style={{ "--i": n }}` to stagger them 80ms apart. `prefers-reduced-motion` turns it off. Colours and the menu width transition at 200ms. No bouncing, no spinners except while refreshing.

### Sizes

Buttons are sized for a touch screen on the factory floor: 40px by default, 48px (`size="lg"`) for the main action of a screen or pop-up, 36px small. Inputs are 44px. These are the sizes at full scale (phones and tablets).

**Desktop scale:** from 1024px width up, `html` is set to 80% (`globals.css`), so every `rem` size shrinks together, as if the browser were zoomed to 80%, and the layout still spreads across the full width (so a default button is about 32px there). The owner asked for this after comparing the app at 100% and 80% browser zoom. Keep sizes in `rem` (never `px`, except hairlines and shadows) so new screens follow the scale; the page width limit is `max-w-[117rem]` for the same reason. To make the whole app larger or smaller, change that one percentage.

## App shell

`src/components/shell`. Every screen after login is inside it.

- **Desktop (1024px and up):** a fixed dark menu at the reading start (right in Hebrew, left in English), 288px wide, collapsible to a 96px icon rail with a round handle on its edge, remembered in a cookie. The light logo on top, the screens in two labelled sections (**Operations**: dashboard, catalog, receiving, vendor receiving, inventory; **System**: settings, administration), and the user card (monogram, name, job title or "Owner", language, sign out) at the bottom. The active entry has a soft lighter background, a accent marker at its start edge and a accent icon.
- **Phone and tablet:** a green top bar with a menu button, the logo mark and the company name in serif. The same menu slides in from the reading start.
- The menu is built from the user's permissions, so a screen with no permission is not in it. Sections with no visible screen disappear.
- Page content sits in a `max-w-[1500px]` container with `space-y-6`. Pages return a fragment, never their own `<main>`.

## Page anatomy

1. `PageHeader`: optional accent-ringed icon, a small accent label above the title, the serif title, a one-line description, the screen's main actions at the far end, and a fine rule with a diamond underneath. No box around it.
2. Content in white cards on the paper canvas.
3. Pop-up windows for anything that is not the main task: pick a category, print settings, item details, confirmations.

Pop-ups use `Dialog` with `DialogTitleBlock` (accent-ringed icon, serif title, description) at the top and `DialogFooter` at the bottom. They sit in the middle of the screen over a blurred green-tinted backdrop. In the footer the **secondary action comes first in the code and the primary last**, so the primary sits at the end of the row in both languages.

### Dashboard

The first screen after login. A greeting by time of day in the user's language with the long date as the label, the refresh button and update time at the far end, four `StatTile`s (total weight, boxes, different items, need attention), then one `WarehouseCard` per warehouse from Priority: name and code, the weight in large serif numerals, box and item chips, a segmented bar (in date, expiring soon, expired) with a legend, and the items that need attention grouped with their box counts. The window for "expiring soon" is `DEFAULT_ALERT_DAYS` (7) until step 9 adds the per-category setting.

### Administration

One page, two tabs under the header (accent underline on the active one): **Users** and **Activity log**. A tab shows only to people holding its permissions.

- **Users:** one card with the title, the count and the "New user" button, then a table: monogram in a green circle, name and email, job title, status badges (owner, active or disabled, must change password, each with an icon), last sign-in, and a three-dot menu (edit and permissions, reset password, disable or enable, delete). On a phone the badges move under the name so the menu always fits. Each entry opens a pop-up; reset, disable and delete ask first, and a new or reset password is shown once in a accent-framed pop-up with a copy button.
- **Permission editor** (inside the user pop-up): one row per screen with a three-way control (no access, view only, everything). The arrow opens the single actions; ticking an action also ticks "view", and an in-between state reads "Custom, n of m allowed". Devices are two switches. On a phone each row stacks, name on top and the control full width below.
- **Activity log:** a filter card (user, action, from, to; plain GET form so a filtered view can be bookmarked), then the table newest first, 25 per page with previous and next. Dates read left to right (`DD/MM/YYYY HH:MM`) even inside Hebrew. Entries are read only.

### Settings

A stack of cards, each shown only to people with its permission. **Company logo:** three tiles (light logo on green, dark logo on paper, the mark) each with an Original or Replaced badge, "Upload new" and "Restore original"; the page reloads after a change so the menu and login show it. **Priority connection:** a definition list (mode badge, address, user, password saved or not), the note that the live connection arrives in phase 6, a "Test connection" button with an inline result and an "Edit connection" pop-up. **Stand-in control:** three option tiles (Normal, Slow, Not answering) with a accent border on the chosen one, and chips with how much sample data the stand-in holds. **When Priority does not answer**, a screen shows a calm warning card (cloud-off icon, plain sentence, a retry button), never an error page; the dashboard is the model. **Coming next:** dashed, muted cards for sections later phases build, each with a "Phase n" badge. Use `SectionCard` for any new placeholder.

### Welcome (login)

One box, the same on every device. From the top: a dark band with a faint diamond lattice (`.lattice`), a double accent frame and the light logo; the language button at the reading end; the form card; the app name in small type. On a phone the box fills the screen. On a larger screen the identical box (27rem wide, rounded `3xl`, soft shadow) sits in the middle of the page on a slightly darker paper tone. It is never stretched across the width and never split into halves. The same box serves login and change password.

## Language and direction

- The UI is fully Hebrew (RTL) or fully English (LTR), never mixed. The language comes from the user's saved choice (cookie before login) and is applied once on the `<html>` element as `lang` and `dir`, plus Base UI's `DirectionProvider`.
- Every visible string goes through next-intl: `useTranslations()` in client components, `getTranslations()` in server components. Messages live in `messages/he.json` and `messages/en.json`; both files always have the same keys and TypeScript checks them against `en.json`.
- ESLint fails on text literals inside JSX (`react/jsx-no-literals`). Punctuation and symbols are allowed. The English-only `/design` page is exempt.
- Data from Priority (item names, warehouse names, categories) and label content are rendered exactly as received and are never translated or reshaped.

## Logical CSS only

The layout mirrors by itself, so physical sides are banned in `src/` (ESLint rule `no-restricted-syntax`, with `src/components/ui` exempt):

| Instead of                   | Use                           |
| ---------------------------- | ----------------------------- |
| `ml-*`, `mr-*`               | `ms-*`, `me-*`                |
| `pl-*`, `pr-*`               | `ps-*`, `pe-*`                |
| `left-*`, `right-*`          | `start-*`, `end-*`            |
| `text-left`, `text-right`    | `text-start`, `text-end`      |
| `rounded-l-*`, `rounded-r-*` | `rounded-s-*`, `rounded-e-*`  |
| `border-l-*`, `border-r-*`   | `border-s-*`, `border-e-*`    |
| `space-x-*`                  | `gap-*` on a flex/grid parent |

Icons that imply direction get `rtl:-scale-x-100` / `rtl:rotate-180`. `Sheet` takes `side="start"` or `"end"`. Gradients that run along the reading direction use `bg-linear-to-r rtl:bg-linear-to-l`.

## Formats

The same in both languages, from `src/lib/i18n/format.ts`:

- Dates `DD/MM/YYYY`, times `HH:MM` (24h), both in `Asia/Jerusalem`. The only dates written out in words are the dashboard greeting's long date.
- Latin digits everywhere. Weights with two decimals (`14.02`), integers with thousands separators (`1,402`).
- Native `<input type="date">` follows the browser's locale, so it can show `MM/DD/YYYY`. Phase 2 replaces it with a date field that always shows `DD/MM/YYYY`.

## Logo

`public/brand/`: `logo.png` (black and red, for light backgrounds), `logo-light.png` (ivory and coral on transparent, for the green), `logo-mark.png` (the red A, for the collapsed menu and phone bar). They are the factory's own artwork. Step 9 adds the upload in settings that replaces them.

## Components

- shadcn/ui on Base UI with the RTL preset (`components.json` has `rtl: true`). Add components with `pnpm dlx shadcn@latest add <name>`.
- The files in `src/components/ui` **are customised in place** for this design (sizes, radii, colours, the `dark`, `soft`, `success`, `warning`, `info` variants, the blurred pop-up backdrop). Re-adding a component with `--overwrite` would undo that, so review the diff first.
- App components live in `src/components`; screen-specific pieces next to their route under `src/app`.
- Buttons that render a link need `nativeButton={false}` (Base UI warns otherwise).
