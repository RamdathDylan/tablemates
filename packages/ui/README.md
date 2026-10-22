# @tablemates/ui

The TableMates design system: tokens, a theme provider, and React Native components that render on iOS, Android, and web.

To see everything live, run the app in dev and open **Profile → Open style guide** (`/styleguide`). The guide shows every token and component, with a light/dark toggle.

## Rules

1. **Use color roles, never hex values.** Read colors from `useTheme().colors` (`colors.primary`, `colors.textMuted`, and so on). Raw scales live in `palette` only so roles can be built from them.
2. **Use the spacing scale.** Every padding, margin, and gap comes from `space[n]` (a 4pt grid).
3. **Use text variants.** Use `<Text variant="heading">`, not hand-set font sizes. Custom fonts need one family per weight, so `fontWeight` does nothing here.
4. **Run the contrast check after changing colors.** `pnpm --filter @tablemates/ui test` fails if any text/background pair in either theme drops below WCAG AA.

## Tokens

| Token | Values | Notes |
|---|---|---|
| Color roles | `bg`, `surface`, `surfaceSunken`, `border`, `borderStrong`, `borderInput`, `text`, `textMuted`, `textSubtle`, `textInverse`, `primary`(`Pressed`/`Soft`), `onPrimary`(`Soft`), `accent`(`Soft`), `onAccent`(`Soft`), `success`(`Soft`), `danger`(`Pressed`/`Soft`), `info`(`Soft`), `star`, `starEmpty`, `focusRing`, `overlay`, `shadow` | Defined twice, in `lightColors` and `darkColors`. |
| Palette | `tomato` (brand), `saffron` (accent), `stone` (warm neutrals), `basil`, `berry`, `sky` | Don't use these directly in components. |
| Fonts | Inter 400/500/600/700 (UI), Fraunces 600/700 (display) | Loaded in `apps/mobile/src/app/_layout.tsx`. |
| Text variants | `display` 34, `title` 28, `heading` 22, `subheading` 18, `body` 16, `bodyStrong` 16, `caption` 14, `label` 14, `overline` 12 | `display`, `title`, and `heading` get `role="heading"` automatically. |
| Spacing | `space[0,1,2,3,4,5,6,8,10,12,16]` → 0–64px | |
| Radius | `sm` 6, `md` 10, `lg` 16, `full` | |
| Elevation | `elevation(0–3, colors.shadow)` | Returns a CSS `boxShadow` string. |
| Motion | `duration.fast/base/slow` = 120/200/320ms; `easing.standard/decelerate/accelerate` | Skeleton respects reduced motion. |
| Layout | `minTouchTarget` 44, `maxContentWidth` 720, `breakpoints.tablet` 768, `breakpoints.desktop` 1024 | `useBreakpoint()` returns `'phone' \| 'tablet' \| 'desktop'`. |

## Components

Every component reads its colors from the theme, works on web, and shows a visible focus ring for keyboard users on web. App-level pressables should use the exported `focusRing(state, colors)` helper so they match.

### Primitives

| Component | Variants / props | States | Accessibility |
|---|---|---|---|
| `Text` | `variant`, `tone` (default, muted, subtle, primary, danger, success, inverse), `align` | — | Heading variants are announced as headings. |
| `Button` | `variant` primary · secondary · ghost · danger; `size` sm 40 · md 44 · lg 52; `icon`, `fullWidth` | hover/pressed, disabled, `loading` (spinner, keeps width) | `role="button"`; `aria-busy` while loading; the `sm` size gets `hitSlop` up to 44px. |
| `Badge` | `count`, `max` (default 9, shows "9+") | Hidden at 0 | Hidden from screen readers: put the count in the parent's label ("Friends, 2 pending requests"). |
| `IconButton` | `variant` ghost · secondary · primary; `size` | hover/pressed, disabled | `accessibilityLabel` is **required**. |
| `Input` / `TextArea` | `label`, `helperText`, `error`, `icon`, `hideLabel` | focus (2px blue), error (2px red with message), disabled | The label is announced even when hidden; the error message has `role="alert"`. |
| `Avatar` | `size` sm 32 · md 40 · lg 56 · xl 88; `uri`, `ring`, `decorative` | Image, or initials on a tint chosen from the name | Use `decorative` when the name is shown next to the avatar. |
| `Chip` | `tone` neutral · primary · accent · success; `icon`; `onPress` + `selected` makes it a toggle | selected, hover/pressed | Toggle chips expose `aria-pressed`. |
| `Rating` | display: `value` (half stars OK), `showValue`; input: `onChange`; `size` | — | Display mode is `role="img"`, "Rated 4 out of 5"; input mode is a radio group with a named label per star. |
| `Card` | `padding`, `elevated`, `onPress` | hover/pressed raises the elevation | When pressable, give it a summary `accessibilityLabel`. |
| `Divider` | `inset`, `spacing` | — | Hidden from screen readers. |
| `Skeleton` | `width`, `height`, `radius` | Pulses; static when reduced motion is on | Hidden from screen readers. |
| `EmptyState` | `icon`, `title`, `message`, `action` | — | — |
| `Sheet` | `title`, `footer` | Bottom sheet on phones, centered dialog on wide web | `role="dialog"`; Escape and tapping the backdrop close it. |
| `ToastProvider` / `useToast()` | `toast(message, tone)` where tone is neutral · success · danger | Auto-dismisses after about 3s | Live region on web and Android; explicit announcement on iOS. |

### TableMates components

| Component | Use for |
|---|---|
| `ReviewCard` | A friend's review in the feed or on a restaurant page. Omit `restaurantName` on the restaurant's own page. Pass `saved` and `onToggleSave` to show a want-to-try bookmark. |
| `PhotoViewer` | A full-screen photo lightbox with previous and next buttons, a counter, an optional caption, and a close button. Escape or tapping the backdrop closes it. |
| `RestaurantCard` | Search results, and restaurants with a friends summary (`friendStats`). Optional `you` (your rating) and `distanceKm`. |
| `ColumnChart` | Vertical bars for one series over categories (e.g. visits by month): 4px rounded tops, 2px gaps, a direct label on the peak only, and an accessible label listing every value. |
| `RankedBars` | Horizontal bars, longest first, each with its label and value (e.g. top cuisines). Each row is a list item with a spoken summary. |
| `RatingTrend` | One place's ratings over time (2+ rated visits): a 2px line with 10px dots, 1★/5★ guides, and first and last dates. It's a single series, so there's no legend. Its accessible label lists every point, and it should sit beside a visit list as the table view. |
| `MapPin` | A marker on the friends map: a pill with the average stars. `kind` is `mine` (tomato), `friends` (saffron), `both` (tomato with a saffron ring), or `saved` (dark, with a bookmark: on your list, not visited yet). `saved` on a visited place adds a bookmark icon. Shows a thumbs-up when `recommended`, a 👑 when `crowned` (you're mayor there), and enlarges when `selected`. The map supplies its accessible label. |
| `FriendRow` | A person, with the action that matches their `status`: `none` → Add, `incoming` → Accept/Decline, `outgoing` → Requested (tap to cancel), `friends` → badge. |
| `VisitListItem` | A compact row in a profile's visit history. `subtitle` replaces the date line (e.g. "Saved Oct 21"). |

## Do and don't

| Do | Don't |
|---|---|
| Use one primary `Button` per screen for the main action. | Put two primary buttons side by side. Make one `secondary`. |
| Write button labels as verbs ("Share with friends", "Log a visit"). | Use "OK" or "Submit". |
| Show the number next to `Rating` (the default). | Rely on star color alone to show the rating. |
| Use `EmptyState` with an action that fixes the empty state. | Leave a blank list. |
| Add a new color role in both themes, then run the contrast check. | Add a hex value inside a component. |

## Adding a component

1. Build it in `src/components/` from tokens and existing primitives.
2. Export it from `src/index.ts`.
3. Add it to `apps/mobile/src/app/(dev)/styleguide.tsx` with every variant and state.
4. Add a row to the tables above.
