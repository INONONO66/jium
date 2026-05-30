import { listContractGadgets, HOOK_NAME_RE, STDLIB_GADGETS } from '@ggui-ai/protocol';
import 'esbuild';
import '@ggui-ai/protocol/content-hash';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

// src/design-system-docs.ts
var DEFAULT_DESIGN_SYSTEM_DOCS = `# Design System - Default Light Theme

**IMPORTANT:** Always use CSS variables (var(--ggui-*)) for styling to ensure components respect the app theme.

## Colors

### Primary
- var(--ggui-color-primary-50) - #f0f9ff
- var(--ggui-color-primary-100) - #e0f2fe
- var(--ggui-color-primary-200) - #bae6fd
- var(--ggui-color-primary-300) - #7dd3fc
- var(--ggui-color-primary-400) - #38bdf8
- var(--ggui-color-primary-500) - #0ea5e9
- var(--ggui-color-primary-600) - #0284c7 (main action color)
- var(--ggui-color-primary-700) - #0369a1
- var(--ggui-color-primary-800) - #075985
- var(--ggui-color-primary-900) - #0c4a6e

### Semantic Surface & Text Colors (REQUIRED for theme compatibility)
These tokens adapt automatically to any theme (light, dark, branded). **ALWAYS use these for surfaces and text \u2014 never use raw neutral-* scale values.**

| Token | CSS Variable | Default | Role |
|-------|-------------|---------|------|
| surface | var(--ggui-color-surface) | Main content background |
| onSurface | var(--ggui-color-onSurface) | Primary text on surface |
| surfaceVariant | var(--ggui-color-surfaceVariant) | Card/panel background |
| onSurfaceVariant | var(--ggui-color-onSurfaceVariant) | Muted/secondary text |
| container | var(--ggui-color-container) | Primary-branded containers |
| onContainer | var(--ggui-color-onContainer) | Text on branded containers |
| outline | var(--ggui-color-outline) | Borders, dividers |
| outlineVariant | var(--ggui-color-outlineVariant) | Subtle borders |

**Usage pattern:**
- Page/section background \u2192 \`var(--ggui-color-surface)\`
- Body text \u2192 \`var(--ggui-color-onSurface)\`
- Card/panel background \u2192 \`var(--ggui-color-surfaceVariant)\`
- Secondary/muted text \u2192 \`var(--ggui-color-onSurfaceVariant)\`
- Branded section/header \u2192 \`var(--ggui-color-container)\` bg + \`var(--ggui-color-onContainer)\` text
- Borders/dividers \u2192 \`var(--ggui-color-outline)\` or \`var(--ggui-color-outlineVariant)\`

### State Colors
- var(--ggui-color-success) \u2014 success states
- var(--ggui-color-warning) \u2014 warning states
- var(--ggui-color-error) \u2014 error states, destructive actions
- var(--ggui-color-info) \u2014 informational

### IMPORTANT: Color Rules
- **NEVER** use hardcoded hex colors. ONLY use var(--ggui-color-*) tokens.
- **NEVER** use rgba(), hsl(), or other CSS color functions with hardcoded values.
- **NEVER** use raw neutral-* or gray-* scale tokens (neutral-50, neutral-900, etc.) \u2014 these are internal to the theme and break in dark mode.
- **ALWAYS** use semantic tokens for text and backgrounds:
  - Text: \`var(--ggui-color-onSurface)\` or \`var(--ggui-color-onSurfaceVariant)\`
  - Backgrounds: \`var(--ggui-color-surface)\` or \`var(--ggui-color-surfaceVariant)\`
  - Borders: \`var(--ggui-color-outline)\` or \`var(--ggui-color-outlineVariant)\`
- For branded elements use \`var(--ggui-color-primary-*)\` scale tokens \u2014 these ARE safe because primary adapts per theme.
- For card backgrounds use \`var(--ggui-color-surfaceVariant)\` or \`var(--ggui-color-primary-50)\`

## Spacing

Use \`var(--ggui-spacing-N)\` for all padding, gap, and margin values. **Never use raw numbers** like \`padding={16}\` \u2014 always use the token: \`padding="var(--ggui-spacing-4)"\`.

| Token | Value | Common use |
|-------|-------|------------|
| var(--ggui-spacing-1) | 4px | Icon gaps, tight spacing |
| var(--ggui-spacing-2) | 8px | Button padding, small gaps |
| var(--ggui-spacing-3) | 12px | List item spacing, form gaps |
| var(--ggui-spacing-4) | 16px | Card padding, section gaps |
| var(--ggui-spacing-5) | 20px | Medium padding |
| var(--ggui-spacing-6) | 24px | Container padding, large gaps |
| var(--ggui-spacing-8) | 32px | Section spacing |
| var(--ggui-spacing-10) | 40px | Page margins |
| var(--ggui-spacing-12) | 48px | Hero/large section spacing |

**Quick lookup (px \u2192 token):** 4\u21921, 8\u21922, 12\u21923, 16\u21924, 20\u21925, 24\u21926, 28\u21927, 32\u21928, 36\u21929, 40\u219210, 48\u219212

**Usage on primitives:**
\`\`\`tsx
<Container padding="var(--ggui-spacing-6)">
  <Stack gap="var(--ggui-spacing-4)">
    <Card padding="var(--ggui-spacing-4)">
      <Row gap="var(--ggui-spacing-2)">...</Row>
    </Card>
  </Stack>
</Container>
\`\`\`

## Typography

### Font Sizes
- var(--ggui-font-size-xs) - 12px
- var(--ggui-font-size-sm) - 14px
- var(--ggui-font-size-base) - 16px
- var(--ggui-font-size-lg) - 18px
- var(--ggui-font-size-xl) - 20px
- var(--ggui-font-size-2xl) - 24px
- var(--ggui-font-size-3xl) - 30px
- var(--ggui-font-size-4xl) - 36px

### Font Weights
- var(--ggui-font-weight-normal) - 400
- var(--ggui-font-weight-medium) - 500
- var(--ggui-font-weight-semibold) - 600
- var(--ggui-font-weight-bold) - 700

## Border Radius
- var(--ggui-shape-radius-sm) - 4px
- var(--ggui-shape-radius-md) - 8px
- var(--ggui-shape-radius-lg) - 12px
- var(--ggui-shape-radius-xl) - 16px
- var(--ggui-shape-radius-full) - 9999px

## Shadows
- var(--ggui-shape-shadow-sm) - 0 1px 2px rgba(0,0,0,0.05)
- var(--ggui-shape-shadow-md) - 0 4px 6px -1px rgba(0,0,0,0.1)
- var(--ggui-shape-shadow-lg) - 0 10px 15px -3px rgba(0,0,0,0.1)
- var(--ggui-shape-shadow-xl) - 0 20px 25px -5px rgba(0,0,0,0.1)

## Usage Examples (always use ggui primitives \u2014 never raw <div>, <button>, <input>)

### Branded section header
\`\`\`tsx
<Box padding="var(--ggui-spacing-4)" surface="accent">
  <Heading level={2} tone="emphasized">Contact Us</Heading>
  <Text tone="emphasized">We'd love to hear from you</Text>
</Box>
\`\`\`

### Form input
\`\`\`tsx
<Input label="Email" placeholder="you@example.com" />
\`\`\`

### Buttons
\`\`\`tsx
<Button variant="primary">Submit</Button>
<Button variant="outline">Cancel</Button>
<Button variant="ghost">Skip</Button>
\`\`\`

### Card with spacing tokens
\`\`\`tsx
<Card padding="var(--ggui-spacing-4)" shadow="md">
  <Stack gap="var(--ggui-spacing-3)">
    <Heading level={3}>Title</Heading>
    <Text tone="muted">Description</Text>
  </Stack>
</Card>
\`\`\`

### Color usage guide
- **Semantic roles** (surface, onSurface, container, outline): Use for all surface/text/border decisions \u2014 these adapt to any theme
- **primary-50/100**: Section backgrounds, highlight strips, card headers
- **primary-200/300**: Borders, dividers, focus rings, input outlines
- **primary-500/600**: Icons, links, labels, badges, buttons, CTAs
- **primary-700/800/900**: Headings and text on light primary backgrounds
- **neutral-***: Only when you need a specific shade that semantic tokens don't cover

The primary palette is the app's brand \u2014 use it throughout (headers, accents, borders, interactive elements), not just on the submit button.

**Note:** Do NOT add fallback values to var() (e.g., var(--ggui-color-surface, #fafafa)). Just use var(--ggui-color-surface) \u2014 the theme provides all values.

## Motion & Animation

### Duration Scale
- \`instant\`: 0ms
- \`fast\`: 100ms
- \`normal\`: 200ms
- \`slow\`: 300ms
- \`slower\`: 500ms

### Easing Curves
- \`linear\`: linear
- \`easeIn\`: cubic-bezier(0.4, 0, 1, 1)
- \`easeOut\`: cubic-bezier(0, 0, 0.2, 1)
- \`easeInOut\`: cubic-bezier(0.4, 0, 0.2, 1)
- \`spring\`: cubic-bezier(0.175, 0.885, 0.32, 1.275)

### Transition Presets (import from '@ggui-ai/design/tokens')
\`\`\`tsx
import { duration, easing, transition } from '@ggui-ai/design/tokens';
// transition.fast    \u2192 "100ms cubic-bezier(0.4, 0, 0.2, 1)"
// transition.normal  \u2192 "200ms cubic-bezier(0.4, 0, 0.2, 1)"
// transition.slow    \u2192 "300ms cubic-bezier(0.4, 0, 0.2, 1)"
// transition.colors  \u2192 color + background-color + border-color (200ms each)
// transition.opacity \u2192 opacity 200ms
// transition.transform \u2192 transform 200ms
\`\`\`

### Animation Keyframes
Use \`<MotionKeyframes />\` once in your component to inject all keyframes, then reference by name.

**Entrance / exit** (GPU-composited, transform + opacity):
- \`ggui-fadeIn\` / \`ggui-fadeOut\`
- \`ggui-slideInUp\` / \`ggui-slideInDown\`
- \`ggui-scaleIn\` / \`ggui-scaleOut\`

**State feedback** (color-based, for data-change highlights):
- \`ggui-flash\` \u2014 background-color highlight that fades out. Set \`--ggui-flash-color\` on the element (default: \`var(--ggui-color-primary-100)\`)
- \`ggui-pulse\` \u2014 gentle opacity breathing (infinite, for "live" indicators)
- \`ggui-bounce\` \u2014 subtle scale overshoot (one-shot, for confirmations)

\`\`\`tsx
import { MotionKeyframes, useMotion, useAnimationKey } from '@ggui-ai/design';
import { animation } from '@ggui-ai/design/tokens';

function MyComponent() {
  const { motionEnabled } = useMotion(); // respects prefers-reduced-motion
  return (
    <>
      <MotionKeyframes />
      {/* Entrance animation */}
      <div style={{ animation: motionEnabled ? animation.slideInUp : 'none' }}>
        Content slides in
      </div>
    </>
  );
}
\`\`\`

### Retriggering Animations on Data Changes
When data updates (e.g., stock price from a stream), CSS animations don't replay automatically.
Use \`useAnimationKey(dep)\` \u2014 returns a key that increments when \`dep\` changes, causing React to remount the element and replay the animation.

\`\`\`tsx
import { MotionKeyframes, useAnimationKey } from '@ggui-ai/design';
import { animation } from '@ggui-ai/design/tokens';

// Flash a stock card green/red when the price changes
const priceKey = useAnimationKey(stock.price);
<div
  key={priceKey}
  style={{
    animation: animation.flash,
    '--ggui-flash-color': stock.change > 0
      ? 'var(--ggui-color-success-100)'
      : 'var(--ggui-color-error-100)',
  } as React.CSSProperties}
>
  {stock.price}
</div>
\`\`\`

## Chart / Data Visualization Colors
Semantic chart tokens for data visualizations:
- \`var(--ggui-color-primary-600)\` \u2014 primary series
- \`var(--ggui-color-success-500)\` \u2014 positive / success
- \`var(--ggui-color-error-500)\` \u2014 negative / error
- \`var(--ggui-color-warning-500)\` \u2014 warning / caution
- \`var(--ggui-color-info-500)\` \u2014 informational
- \`var(--ggui-color-neutral-400)\` \u2014 neutral series
- \`var(--ggui-color-neutral-200)\` \u2014 light background series
- \`var(--ggui-color-neutral-600)\` \u2014 dark series

## Accessibility Tokens

### Focus Ring (for keyboard focus states)
- Color: \`var(--ggui-color-primary-600)\`
- Width: 2px
- Offset: 2px
- Style: solid
\`\`\`tsx
// Apply to focusable elements:
outline: '2px solid var(--ggui-color-primary-600)',
outlineOffset: '2px',
\`\`\`

### Reduced Motion
Use \`useMotion()\` hook to check user preference. If disabled, set animation/transition to \`none\`.

## Elevation System
Semantic depth levels combining shadow + z-index:
| Level | Shadow | Z-Index | Use For |
|-------|--------|---------|---------|
| 0 | none | 0 | Flat content |
| 1 | sm | auto | Cards, slight lift |
| 2 | md | 1000 | Dropdowns, popovers |
| 3 | lg | 1200 | Banners, sticky bars |
| 4 | xl | 1400 | Modals, dialogs |
| 5 | 2xl | 1800 | Tooltips, toasts |

\`\`\`tsx
import { elevation } from '@ggui-ai/design/tokens';
// elevation.level1 \u2192 { shadow: 'var(--ggui-shape-shadow-sm)', zIndex: 'auto' }
// elevation.level2 \u2192 { shadow: 'var(--ggui-shape-shadow-md)', zIndex: 1000 }
<div style={{ boxShadow: elevation.level1.shadow, zIndex: elevation.level1.zIndex }}>
  Card content
</div>
\`\`\`

## Typography Presets

### Heading Styles (import { headingStyles } from '@ggui-ai/design/tokens')
| Level | Size | Weight | Line Height | Letter Spacing |
|-------|------|--------|-------------|----------------|
| h1 | 36px | bold (700) | 1.25 | -0.025em |
| h2 | 30px | bold (700) | 1.25 | -0.025em |
| h3 | 24px | semibold (600) | 1.375 | 0 |
| h4 | 20px | semibold (600) | 1.375 | 0 |
| h5 | 18px | semibold (600) | 1.5 | 0 |
| h6 | 16px | semibold (600) | 1.5 | 0 |

### Text Styles (import { textStyles } from '@ggui-ai/design/tokens')
- \`body\`: 16px / normal / 1.5
- \`bodySmall\`: 14px / normal / 1.5
- \`bodyLarge\`: 18px / normal / 1.625
- \`caption\`: 12px / normal / 1.5
- \`label\`: 14px / medium (500) / 1.5
- \`overline\`: 12px / semibold / 1.5 / 0.05em / UPPERCASE

### Letter Spacing Scale
- \`tighter\`: -0.05em
- \`tight\`: -0.025em
- \`normal\`: 0
- \`wide\`: 0.025em
- \`wider\`: 0.05em
- \`widest\`: 0.1em

### Line Height Scale
- \`none\`: 1
- \`tight\`: 1.25
- \`snug\`: 1.375
- \`normal\`: 1.5
- \`relaxed\`: 1.625
- \`loose\`: 2`;

// src/validation/primitives.ts
var PRIMITIVES_DOCUMENTATION = "# ggui Primitives & Design System Reference\n\n> You are a world-class UI engineer working with ggui's component library for the first time.\n> This reference documents every available component, prop, and convention.\n> Components handle theming automatically via built-in variants \u2014 pick the right variant and the theme does the rest.\n> For custom styling beyond variants, use CSS variables: var(--ggui-*, fallback).\n\n## Primitives\n\nImport: `import { Component } from '@ggui-ai/design'`\n\n### Container\n\nContainer -- Width-constrained wrapper that centers content horizontally.\n\nRenders a `<div>` with `width: 100%` and a `maxWidth` constraint.\nWhen `center` is true (the default), applies `margin: 0 auto`.\nNo background, border, or shadow -- use Card for visual containment.\n\nCSS variables used: none (pure layout primitive).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| maxWidth | `'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl' \\| '3xl' \\| 'full' \\| string` | `'lg'` | Maximum width constraint. Accepts a preset token or any CSS width string. - `'xs'` -- 320px - `'sm'` -- 480px - `'md'` -- 640px - `'lg'` -- 768px - `'xl'` -- 1024px - `'2xl'` -- 1280px - `'3xl'` -- 1536px - `'full'` -- 100%  Custom strings (e.g., `'900px'`, `'60ch'`) are passed through as-is. |\n| center | `boolean` | `true` | Whether to center the container horizontally via `margin: 0 auto`. |\n| padding | `'none' \\| 'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl' \\| number \\| string` | `undefined (no padding)` | Padding applied to all sides. Prefer a spacing-scale name (`'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl'`) \u2014 each resolves to the matching `--ggui-spacing-*` token. A number is treated as pixels; any other string is passed through as a raw CSS value. |\n\n**Example:**\n```tsx\n<Container maxWidth=\"xl\" padding=\"var(--ggui-spacing-6)\">\n  <Stack gap=\"var(--ggui-spacing-4)\">\n    <Heading level={1}>Dashboard</Heading>\n    <Card shadow=\"md\" padding=\"var(--ggui-spacing-5)\">\n      <Text>Welcome back!</Text>\n    </Card>\n  </Stack>\n</Container>\n```\n\n### Card\n\nCard -- Container with background, shadow, and optional border.\n\nRenders a `<div>` with:\n- Background: `var(--ggui-color-surface)`\n- Border (when enabled): `1px solid var(--ggui-color-outlineVariant)`\n- Shadow and radius controlled by design tokens via CSS variables.\n- No built-in transitions.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| padding | `'none' \\| 'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl' \\| number \\| string` | `'lg'` | Padding applied to all sides. Prefer a spacing-scale name (`'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl'`) \u2014 each resolves to the matching `--ggui-spacing-*` token. A number is treated as pixels; any other string is passed through as a raw CSS value. |\n| shadow | `'none' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl'` | `'sm'` | Shadow elevation level. Maps to design tokens: - `'none'` -- no shadow - `'sm'` -- var(--ggui-shape-shadow-sm, 0 1px 2px 0 rgba(0,0,0,0.05)) -- subtle, default - `'md'` -- var(--ggui-shape-shadow-md, 0 4px 6px -1px rgba(0,0,0,0.1)) -- dialogs, emphasized sections - `'lg'` -- var(--ggui-shape-shadow-lg, 0 10px 15px -3px rgba(0,0,0,0.1)) -- floating panels - `'xl'` -- var(--ggui-shape-shadow-xl, 0 20px 25px -5px rgba(0,0,0,0.1)) -- popovers, modals |\n| border | `boolean` | `true` | Whether to render a 1px border using `var(--ggui-color-outlineVariant)`. |\n| radius | `'none' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| number \\| string` | `'lg'` | Corner radius. Prefer a radius-scale name (`'none' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl'`) \u2014 each resolves to the matching `--ggui-shape-radius-*` token. A number is treated as pixels; any other string is passed through as a raw CSS value. |\n| surface | `'default' \\| 'elevated' \\| 'sunken' \\| 'accent' \\| 'inverted' \\| 'transparent'` | `'default'` | Semantic surface slot. Same vocabulary as ; see that prop's docs for the full slot table. Default Card surface is `'default'` (the active theme's `--ggui-color-surface`); pair with `shadow=\"md\"\\|\"lg\"` for elevated cards, or use `'inverted'` for a dark testimonial-style card on a light theme. |\n\n**Example:**\n```tsx\n<Card shadow=\"md\" padding=\"lg\" radius=\"lg\">\n  <Stack gap=\"md\">\n    <Text variant=\"label\">Settings</Text>\n    <Input label=\"Name\" value={name} onChange={setName} />\n    <Button variant=\"primary\">Save</Button>\n  </Stack>\n</Card>\n```\n\n### Stack\n\nStack -- Flexbox layout primitive for arranging children along a single axis.\n\nRenders a `<div>` with `display: flex`. Default layout is vertical (column).\nAll flex shorthand values (`align`, `justify`, `wrap`) are abstracted into\nsemantic prop names.\n\nCSS variables used: none (pure layout primitive).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| direction | `'vertical' \\| 'horizontal'` | `'vertical'` | Main axis direction. - `'vertical'` -- `flex-direction: column` - `'horizontal'` -- `flex-direction: row` |\n| gap | `'none' \\| 'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl' \\| number \\| string` | `'sm'` | Gap between children. Prefer a spacing-scale name (`'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl'`) \u2014 each resolves to the matching `--ggui-spacing-*` token. A number is treated as pixels; any other string is passed through as a raw CSS value. |\n| align | `'start' \\| 'center' \\| 'end' \\| 'stretch'` | `'stretch'` | Cross-axis alignment (maps to `align-items`). - `'start'` -- flex-start - `'center'` -- center - `'end'` -- flex-end - `'stretch'` -- stretch (children fill cross-axis) |\n| justify | `'start' \\| 'center' \\| 'end' \\| 'between' \\| 'around' \\| 'evenly'` | `'start'` | Main-axis content distribution (maps to `justify-content`). - `'start'` -- flex-start - `'center'` -- center - `'end'` -- flex-end - `'between'` -- space-between - `'around'` -- space-around - `'evenly'` -- space-evenly |\n| wrap | `boolean` | `false` | Whether children wrap to the next line when they overflow. Maps to `flex-wrap: wrap` when true. |\n\n**Example:**\n```tsx\n<Stack gap=\"lg\" align=\"center\">\n  <Heading level={2}>Profile</Heading>\n  <Text variant=\"body\">Edit your account details below.</Text>\n  <Stack direction=\"horizontal\" gap=\"sm\" justify=\"end\">\n    <Button variant=\"ghost\">Cancel</Button>\n    <Button variant=\"primary\">Save</Button>\n  </Stack>\n</Stack>\n```\n\n### Grid\n\nGrid -- 2-D layout primitive. Arranges children into rows AND\ncolumns; reach for it when Stack/Row's single-axis flow isn't\nenough (card galleries, dashboards, stat grids).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| columns | `number \\| ResponsiveColumns` | `2` | Column count. Three forms: - a number \u2014 that many equal columns at every width (`columns={3}`); - a  map \u2014 explicit counts per breakpoint   (`columns={{ base: 1, md: 3 }}` = 1 column on mobile, 3 from `md`).   Use this when the request names exact per-breakpoint counts   (\"3 per row on desktop, 1 on mobile\"). Ignored entirely when `minColumnWidth` is set. |\n| gap | `'none' \\| 'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl' \\| number \\| string` | `'md'` | Gap between cells. Prefer a spacing-scale name (`'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl'`); a number is pixels. |\n| minColumnWidth | `number \\| string` | `undefined (use `columns`)` | When set, the grid becomes responsive \u2014 it fits as many equal columns as possible, each at least this wide, and `columns` is ignored. A number is treated as pixels. |\n\n**Example:**\n```tsx\n<Grid columns={3} gap=\"md\">\n  {items.map((it) => <Card key={it.id}>{it.name}</Card>)}\n</Grid>\n```\n\n### Skeleton\n\nSkeleton -- a pulsing placeholder for content that has not loaded\nyet. ggui UIs are agent-driven (props arrive late, streams start\nempty), so a loading frame is the rule \u2014 render `Skeleton` instead\nof a blank screen or a hand-rolled pulsing `<div>`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| variant | `'rect' \\| 'text' \\| 'circle'` | `'rect'` | Shape preset. - `'rect'` -- a block (default); pair with `width` / `height`. - `'text'` -- a single text line (height ~1em). - `'circle'` -- equal width/height, fully rounded (avatar slot). |\n| width | `number \\| string` | - | Width. A number is pixels. Defaults to `100%` (`2.5rem` for circle). |\n| height | `number \\| string` | - | Height. A number is pixels. Defaults by variant when unset. |\n| radius | `'none' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| number \\| string` | `'sm'` | Corner radius. Prefer a radius-scale name. Ignored for `variant=\"circle\"` (always fully round). |\n\n**Example:**\n```tsx\n{user === undefined\n  ? <Skeleton variant=\"text\" width=\"40%\" />\n  : <Text>{user.name}</Text>}\n```\n\n### Box\n\nBox -- Generic container with padding, margin, background, and border-radius.\n\nRenders a plain `<div>`. Unlike Card, Box has no default background, shadow,\nor border -- it is a blank canvas for custom styling. Use it for layout\nspacing, colored sections, or wrapping arbitrary content.\n\nWhen both `paddingX`/`paddingY` and `padding` are provided, the axis-specific\nprops take precedence and `padding` is ignored.\n\nCSS variables used: none (all values are passed through directly).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| padding | `'none' \\| 'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl' \\| number \\| string` | `undefined (no padding)` | Padding applied to all four sides. Prefer a spacing-scale name (`'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl'`) \u2014 each resolves to the matching `--ggui-spacing-*` token. A number is treated as pixels; any other string is passed through as a raw CSS value. Ignored when `paddingX` or `paddingY` is set. |\n| paddingX | `'none' \\| 'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl' \\| number \\| string` | `undefined` | Horizontal (left + right) padding. Accepts a spacing-scale name, a pixel number, or a raw CSS string \u2014 see . When set alongside `paddingY`, they combine into a shorthand `padding: {Y} {X}`. When set without `paddingY`, vertical padding defaults to 0. |\n| paddingY | `'none' \\| 'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl' \\| number \\| string` | `undefined` | Vertical (top + bottom) padding. Accepts a spacing-scale name, a pixel number, or a raw CSS string \u2014 see . When set alongside `paddingX`, they combine into a shorthand `padding: {Y} {X}`. When set without `paddingX`, horizontal padding defaults to 0. |\n| margin | `'none' \\| 'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| '2xl' \\| number \\| string` | `undefined (no margin)` | Margin applied to all four sides. Accepts a spacing-scale name, a pixel number, or a raw CSS string \u2014 see . |\n| surface | `'default' \\| 'elevated' \\| 'sunken' \\| 'accent' \\| 'inverted' \\| 'transparent'` | `undefined (transparent)` | Semantic surface slot. Picks the right `var(--ggui-color-*)` background token from the active theme. The ONLY way to set a theme-tracking background fill on Box.  Available slots: - `'default'` \u2014 base container surface (most common) - `'elevated'` \u2014 same fill, intended to be paired with shadow   (use Card.shadow for actual elevation) - `'sunken'` \u2014 recessed / inset region (`surfaceVariant` token) - `'accent'` \u2014 highlighted / branded fill (`primary-50` token) - `'inverted'` \u2014 dark surface in light mode, light in dark   (testimonials, code-snippet cards). Pair with    `'inverse'` for legible text. - `'transparent'` \u2014 explicit \"no fill\"  For non-theme-mapped brand colors (e.g. a partner's exact brand hex like Stripe purple) use the  escape \u2014 every other hex / rgba on Box is rejected by tier-0 self-check. |\n| assetColor | `string` | `undefined` | Asset color escape \u2014 the typed valve for legitimate non-theme color values (a partner's exact brand hex, a fixed product surface, etc.). Renders as the Box background.  **MUST be paired with .** The semantic name is human-readable documentation of why this color bypasses the theme \u2014 e.g. `\"stripe-brand-purple\"`, `\"slack-aubergine\"`. Tier-0 self-check allows hex / rgba inside `assetColor` ONLY when `assetSemantic` is a non-empty string; one without the other fails the check.  Reach for `surface` first. This escape exists for the small set of cases where the operator's theme MUST NOT override the value (brand identity rendering). |\n| assetSemantic | `string` | `undefined` | Human-readable semantic label that documents why  bypasses the theme. Required when `assetColor` is set; tier-0 self-check rejects empty strings or a missing `assetSemantic` next to a hex `assetColor`.  Examples: `\"stripe-brand-purple\"`, `\"slack-aubergine\"`, `\"partner-logo-orange\"`. Pure documentation \u2014 no rendering effect. |\n| radius | `'none' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| number \\| string` | `undefined (no rounding)` | Corner radius. Prefer a radius-scale name (`'none' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl'`) \u2014 each resolves to the matching `--ggui-shape-radius-*` token. A number is treated as pixels; any other string is passed through as a raw CSS value. |\n\n**Example:**\n```tsx\n<Box paddingX=\"xl\" paddingY=\"lg\" surface=\"accent\" radius=\"lg\">\n  <Text variant=\"bodySmall\" tone=\"emphasized\">\n    Tip: You can customize your theme in Settings.\n  </Text>\n</Box>\n```\n\n### Divider\n\nDivider -- A 1px line to visually separate content sections.\n\nRenders an `<hr>` (horizontal) or `<div>` (vertical) with `role=\"separator\"`.\n- Horizontal: 1px tall, full width, with vertical margin.\n- Vertical: 1px wide, stretches to parent height via `align-self: stretch`,\n  with horizontal margin. Works best inside a horizontal Stack or Row.\n\nDefault color: `var(--ggui-color-outlineVariant)`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| orientation | `'horizontal' \\| 'vertical'` | `'horizontal'` | Line direction. - `'horizontal'` -- renders `<hr>`, full width, 1px height, margin top/bottom - `'vertical'` -- renders `<div>`, 1px width, `align-self: stretch`, margin left/right |\n| margin | `number \\| string` | `16` | Spacing around the divider. Numbers are treated as pixels. Applied as vertical margin for horizontal dividers, horizontal margin for vertical. |\n| tone | `\\| 'default'     \\| 'muted'     \\| 'subtle'     \\| 'emphasized'     \\| 'loud'     \\| 'success'     \\| 'warning'     \\| 'error'     \\| 'info'     \\| 'inverse'     \\| 'inherit'` | `undefined (uses `var(--ggui-color-outlineVariant)`)` | Semantic color slot. Same vocabulary as ; the theme decides what each tone LOOKS like. Defaults to a quiet outline-variant tint when unset (independent of the tone slots). |\n\n**Example:**\n```tsx\n<Stack gap={0}>\n  <Text>Section A</Text>\n  <Divider margin=\"var(--ggui-spacing-3)\" />\n  <Text>Section B</Text>\n</Stack>\n```\n\n### Spacer\n\nSpacer -- Invisible spacing element, either fixed-size or flexible.\n\nRenders an empty `<div>`.\n- Fixed mode (number): sets both `width` and `height` to the given pixel\n  value with `flex-shrink: 0`, creating rigid spacing in any direction.\n- Flex mode (`'flex'`): sets `flex: 1`, expanding to fill remaining space\n  in a flex container. Useful for pushing siblings apart.\n\nCSS variables used: none.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| size | `number \\| 'flex'` | `16` | Spacing amount. - Number: fixed square spacer (width and height in pixels, `flex-shrink: 0`). - `'flex'`: expands to fill available space (`flex: 1`). |\n\n**Example:**\n```tsx\n<Stack direction=\"horizontal\" align=\"center\">\n  <Heading level={3}>Logo</Heading>\n  <Spacer size=\"flex\" />\n  <Button variant=\"ghost\">Login</Button>\n</Stack>\n```\n\n### Text\n\nText -- Versatile typography primitive for body copy, captions, and labels.\n\nRenders as `<p>` by default (configurable via `is`). The `variant` prop\nselects a preset typography style (font size, weight, line height). The\n`size` and `weight` props override the variant values when specified.\n\nDefault text color: `var(--ggui-color-onSurface)`.\nAll text renders with `margin: 0` (no default paragraph spacing).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| variant | `'body' \\| 'bodySmall' \\| 'bodyLarge' \\| 'caption' \\| 'label' \\| 'overline'` | `'body'` | Preset typography style. Each variant maps to a fixed combination of font size, weight, and line height from the typography tokens: - `'body'` -- 16px / 400 / 1.5 line-height - `'bodySmall'` -- 14px / 400 / 1.5 line-height - `'bodyLarge'` -- 18px / 400 / 1.625 line-height (relaxed) - `'caption'` -- 12px / 400 / 1.5 line-height - `'label'` -- 14px / 500 (medium) / 1.5 line-height - `'overline'` -- 12px / 600 (semibold) / 1.5 line-height, uppercase, wider letter-spacing (0.05em) |\n| size | `'xs' \\| 'sm' \\| 'base' \\| 'lg' \\| 'xl' \\| '2xl' \\| '3xl' \\| '4xl'` | `undefined (uses variant's font size)` | Font size override. When set, replaces the variant's font size. Maps to CSS variables with pixel fallbacks: - `'xs'` -- var(--ggui-font-size-xs) - `'sm'` -- var(--ggui-font-size-sm) - `'base'` -- var(--ggui-font-size-base) - `'lg'` -- var(--ggui-font-size-lg) - `'xl'` -- var(--ggui-font-size-xl) - `'2xl'` -- var(--ggui-font-size-2xl) - `'3xl'` -- var(--ggui-font-size-3xl) - `'4xl'` -- var(--ggui-font-size-4xl) |\n| weight | `'normal' \\| 'medium' \\| 'semibold' \\| 'bold'` | `undefined (uses variant's weight)` | Font weight override. When set, replaces the variant's weight. Maps to CSS variables with numeric fallbacks: - `'normal'` -- var(--ggui-font-weight-normal) - `'medium'` -- var(--ggui-font-weight-medium) - `'semibold'` -- var(--ggui-font-weight-semibold) - `'bold'` -- var(--ggui-font-weight-bold) |\n| tone | `\\| 'default'     \\| 'muted'     \\| 'subtle'     \\| 'emphasized'     \\| 'loud'     \\| 'success'     \\| 'warning'     \\| 'error'     \\| 'info'     \\| 'inverse'     \\| 'inherit'` | `'default' (var(--ggui-color-onSurface))` | Semantic color slot. Picks the right `var(--ggui-color-*)` token from the active theme. The theme decides what each tone LOOKS like \u2014 `'muted'` is a quiet warm grey on Claudic, a cool slate on Indigo, dim cyan on Neon-Noir. Components that use `tone` track the operator's theme switch automatically.  Available slots: `'default'` (primary body text), `'muted'` (secondary / metadata), `'subtle'` (very-low-emphasis hint), `'emphasized'` (branded accent), `'loud'` (strongest accent), `'success'` / `'warning'` / `'error'` / `'info'` (status text), `'inverse'` (text on dark surface), `'inherit'` (parent's color).  `tone` is the ONLY way to set a Text color. The legacy `color?: string` escape was retired \u2014 raw color strings bypass theming and silently override the operator's preset. |\n| align | `'left' \\| 'center' \\| 'right'` | `undefined (inherits from parent)` | Horizontal text alignment. Maps directly to `text-align`. |\n| truncate | `boolean` | `false` | When true, clips overflowing text with an ellipsis. Applies `overflow: hidden`, `text-overflow: ellipsis`, and `white-space: nowrap`. |\n| is | `'p' \\| 'span' \\| 'div' \\| 'label'` | `'p'` | HTML element to render. Choose based on semantic context: - `'p'` -- paragraph (default, block-level) - `'span'` -- inline text within a sentence - `'div'` -- generic block container - `'label'` -- form label (pair with `htmlFor`) |\n| id | `string` | - | `id` for the rendered element \u2014 anchor an in-page link, or pair with a form control's `aria-labelledby`. |\n| htmlFor | `string` | - | Associates an `is=\"label\"` element with a form control by the control's `id`. Only meaningful when `is=\"label\"`. |\n\n**Example:**\n```tsx\n<Stack gap=\"var(--ggui-spacing-1)\">\n  <Text variant=\"overline\">ACCOUNT</Text>\n  <Text variant=\"bodyLarge\">Welcome back, Jane.</Text>\n  <Text variant=\"caption\" tone=\"muted\">\n    Last login: 2 hours ago\n  </Text>\n</Stack>\n```\n\n### Heading\n\nHeading -- Semantic heading element (h1-h6) with preset typography styles.\n\nRenders the corresponding `<h1>`-`<h6>` HTML element based on `level`.\nEach level has a preset font size, weight, line height, and letter spacing\nfrom the heading typography tokens:\n- Level 1: 36px / bold / 1.25 line-height / -0.025em tracking\n- Level 2: 30px / bold / 1.25 line-height / -0.025em tracking\n- Level 3: 24px / semibold / 1.375 line-height / 0em tracking\n- Level 4: 20px / semibold / 1.375 line-height / 0em tracking\n- Level 5: 18px / semibold / 1.5 line-height / 0em tracking\n- Level 6: 16px / semibold / 1.5 line-height / 0em tracking\n\nDefault text color: `var(--ggui-color-onSurface)`.\nAll headings render with `margin: 0` (no default heading spacing).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| level | `1 \\| 2 \\| 3 \\| 4 \\| 5 \\| 6` | `2` | Semantic heading level. Determines both the HTML element (`<h1>`-`<h6>`) and the preset typography style. |\n| tone | `\\| 'default'     \\| 'muted'     \\| 'subtle'     \\| 'emphasized'     \\| 'loud'     \\| 'success'     \\| 'warning'     \\| 'error'     \\| 'info'     \\| 'inverse'     \\| 'inherit'` | `'default' (var(--ggui-color-onSurface))` | Semantic color slot. Same vocabulary as ; see that prop's docs for the full slot table. `tone` is the ONLY way to set a Heading color \u2014 the legacy `color?: string` escape was retired so the operator's theme always wins. |\n| align | `'left' \\| 'center' \\| 'right'` | `undefined (inherits from parent)` | Horizontal text alignment. Maps directly to `text-align`. |\n\n**Example:**\n```tsx\n<Stack gap=\"var(--ggui-spacing-2)\">\n  <Heading level={1}>Page Title</Heading>\n  <Heading level={3} tone=\"emphasized\">\n    Subsection\n  </Heading>\n  <Text variant=\"body\">Body content goes here.</Text>\n</Stack>\n```\n\n### Button\n\nButton -- A clickable button primitive with multiple visual variants and sizes.\n\nRenders a native `<button>` element styled with inline CSS derived from design-token\nCSS variables. Supports a loading spinner, left/right icon slots, and a cross-platform\n`onPress` alias for `onClick`.\n\nBase styles applied to every variant:\n- `border-radius: var(--ggui-shape-radius-md)`\n- `font-weight: var(--ggui-font-weight-medium)`\n- `box-shadow: var(--ggui-shape-shadow-sm, 0 1px 2px rgba(0,0,0,0.05))`\n- `gap: var(--ggui-spacing-2)` between icon and text\n- Transitions: background-color, box-shadow, opacity at 200ms ease-in-out\n\nDisabled or loading: `opacity: 0.5`, `cursor: not-allowed`, click handler suppressed.\n\nAlso extends native `ButtonHTMLAttributes` (except `style`/`className`), so props\nlike `type`, `form`, `aria-*`, and `data-*` are forwarded to the `<button>` element.\nThe `type` prop defaults to `'button'` (not `'submit'`), preventing accidental form\nsubmissions.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| variant | `'primary' \\| 'secondary' \\| 'outline' \\| 'ghost' \\| 'danger'` | `'primary'` | Visual style. Maps to CSS variables: - `'primary'` -- `var(--ggui-color-primary-600)` background, white text, no border - `'secondary'` -- `var(--ggui-color-surfaceVariant)` background, `var(--ggui-color-onSurfaceVariant)` text, no border - `'outline'` -- transparent background, `1px solid var(--ggui-color-primary-600)` border, primary-600 text - `'ghost'` -- transparent background, `var(--ggui-color-onSurfaceVariant)` text, no border - `'danger'` -- `var(--ggui-color-error-600)` background, white text, no border |\n| size | `'xs' \\| 'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls padding, font size, and minimum height: - `'xs'` -- padding `4px 8px`, font `var(--ggui-font-size-xs)`, min-height 24px - `'sm'` -- padding `6px 12px`, font `var(--ggui-font-size-sm)`, min-height 32px - `'md'` -- padding `10px 16px`, font `var(--ggui-font-size-sm)`, min-height 40px - `'lg'` -- padding `12px 24px`, font `var(--ggui-font-size-base)`, min-height 48px |\n| fullWidth | `boolean` | `false` | When true, sets `width: 100%` so the button fills its container. |\n| loading | `boolean` | `false` | When true, replaces children with a 16px `Spinner` (color: `currentColor`) and disables interaction (same effect as `disabled`). |\n| leftIcon | `ReactNode` | - | ReactNode rendered before children, inside the flex layout with `var(--ggui-spacing-2)` gap. |\n| rightIcon | `ReactNode` | - | ReactNode rendered after children, inside the flex layout with `var(--ggui-spacing-2)` gap. |\n| onPress | `() => void` | - | Alias for `onClick` for cross-platform compatibility (React Native convention). If both `onClick` and `onPress` are provided, `onClick` takes precedence. |\n\n**Example:**\n```tsx\n<Button variant=\"primary\" size=\"md\" leftIcon={<Icon name=\"save\" />} onClick={handleSave}>\n  Save Changes\n</Button>\n```\n\n### Input\n\nInput -- A single-line text input with label, validation, and helper text.\n\nRenders a `<div>` wrapper containing an optional `<label>`, a native `<input>`,\nand an optional message `<span>` for error or helper text.\n\nStyling:\n- Border: `1px solid var(--ggui-color-outline)` (normal),\n  `var(--ggui-color-error-500)` (error)\n- Background: `var(--ggui-color-surface)` (normal),\n  `var(--ggui-color-surface)` (disabled)\n- Text: `var(--ggui-color-onSurface)`\n- Border radius: `var(--ggui-shape-radius-md)`\n- Label: `var(--ggui-font-size-sm)`, `var(--ggui-font-weight-medium)`,\n  `var(--ggui-color-onSurfaceVariant)`\n- Transitions: border-color, box-shadow at 200ms ease-in-out\n\nAccessibility: auto-generated `id` links `<label>` to `<input>` via `htmlFor`.\nWhen `error` is set, `aria-invalid` is true and the message has `role=\"alert\"`.\nWhen `required` is true, a red asterisk is appended to the label.\n\nAlso extends native `InputHTMLAttributes` (except `style`, `className`, `onChange`,\n`size`), so props like `autoFocus`, `name`, `pattern`, `aria-*` are forwarded.\n\n**IMPORTANT:** `onChange` receives the string value directly, NOT a React\n`ChangeEvent`. This differs from native `<input>` behavior.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| label | `string` | - | Label rendered above the input. Linked to the input via auto-generated `htmlFor`/`id`. Styled with `var(--ggui-font-size-sm)` and `var(--ggui-color-onSurfaceVariant)`. |\n| placeholder | `string` | - | Placeholder text shown when the input is empty. |\n| value | `string` | - | Controlled value of the input. |\n| onChange | `(value: string) => void` | - | Change handler. Receives the new string value directly, NOT a React event. |\n| type | `'text' \\| 'email' \\| 'password' \\| 'number' \\| 'tel' \\| 'url' \\| 'search'` | `'text'` | HTML input type. Determines browser behavior (keyboard on mobile, validation, masking). |\n| error | `string` | - | Error message displayed below the input in `var(--ggui-color-error-500)`. When set, the border turns red and the message element gets `role=\"alert\"`. Takes precedence over `helperText`. |\n| helperText | `string` | - | Helper text displayed below the input in `var(--ggui-color-onSurfaceVariant)`. Only shown when `error` is not set. |\n| required | `boolean` | `false` | When true, appends a red asterisk (`*`) to the label and sets the native `required` attribute on the `<input>`. |\n| disabled | `boolean` | `false` | When true, sets the native `disabled` attribute. Background changes to `var(--ggui-color-surface)`. |\n| size | `'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls padding and font size: - `'sm'` -- padding `6px 10px`, font `var(--ggui-font-size-sm)` - `'md'` -- padding `10px 12px`, font `var(--ggui-font-size-sm)` - `'lg'` -- padding `12px 14px`, font `var(--ggui-font-size-base)` |\n\n**Example:**\n```tsx\n<Input label=\"Email\" type=\"email\" value={email} onChange={setEmail} error={emailError} />\n```\n\n### TextArea\n\nTextArea -- A multiline text input with label, validation, character count, and auto-resize.\n\nRenders a `<div>` wrapper containing an optional `<label>`, a native `<textarea>`,\nand a footer row with error/helper text on the left and character count on the right.\n\nStyling:\n- Padding: `10px 12px`, font: `var(--ggui-font-size-sm)`, `font-family: inherit`\n- Border: `1px solid var(--ggui-color-outline)` (normal),\n  `var(--ggui-color-error-500)` (error)\n- Background: `var(--ggui-color-surface)` (normal),\n  `var(--ggui-color-surface)` (disabled)\n- Border radius: `var(--ggui-shape-radius-md)`\n- Resize: `vertical` by default, `none` when `autoResize` is true\n- Transitions: border-color, box-shadow at 200ms ease-in-out\n\nAccessibility: same label/error linking pattern as Input (auto-generated ids,\n`aria-invalid`, `role=\"alert\"` on error message).\n\nAlso extends native `TextareaHTMLAttributes` (except `style`, `className`, `onChange`).\n\n**IMPORTANT:** `onChange` receives the string value directly, NOT a React\n`ChangeEvent`. This differs from native `<textarea>` behavior.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| label | `string` | - | Label rendered above the textarea. Linked via auto-generated `htmlFor`/`id`. Styled with `var(--ggui-font-size-sm)` and `var(--ggui-color-onSurfaceVariant)`. |\n| placeholder | `string` | - | Placeholder text shown when the textarea is empty. |\n| value | `string` | - | Controlled value of the textarea. |\n| onChange | `(value: string) => void` | - | Change handler. Receives the new string value directly, NOT a React event. |\n| rows | `number` | `4` | Number of visible text rows (native `rows` attribute on `<textarea>`). |\n| error | `string` | - | Error message displayed below the textarea in `var(--ggui-color-error-500)`. When set, the border turns red and the message element gets `role=\"alert\"`. Takes precedence over `helperText`. |\n| helperText | `string` | - | Helper text displayed below the textarea in `var(--ggui-color-onSurfaceVariant)`. Only shown when `error` is not set. |\n| required | `boolean` | `false` | When true, appends a red asterisk (`*`) to the label and sets the native `required` attribute on the `<textarea>`. |\n| disabled | `boolean` | `false` | When true, sets the native `disabled` attribute. Background changes to `var(--ggui-color-surface)`. |\n| maxLength | `number` | - | Maximum character length (native `maxLength` attribute). Also used as the denominator in the character count display when `showCount` is true. |\n| showCount | `boolean` | `false` | When true AND `maxLength` is set, displays a `{current}/{max}` character counter in the footer row (right-aligned, `var(--ggui-font-size-xs)`). Has no effect without `maxLength`. |\n| autoResize | `boolean` | `false` | When true, sets CSS `resize: none` on the textarea. The flag disables manual resizing to signal that external logic handles sizing. The component does NOT auto-adjust height based on content in the current implementation. |\n\n**Example:**\n```tsx\n<TextArea label=\"Bio\" value={bio} onChange={setBio} rows={6} maxLength={500} showCount />\n```\n\n### Select\n\nSelect -- A native dropdown selection primitive with label and validation.\n\nRenders a `<div>` wrapper containing an optional `<label>`, a native `<select>`\nwith custom styling, and an optional message `<span>`.\n\nThe native `<select>` has `appearance: none` with a custom chevron SVG rendered\nas a `background-image` (right-aligned, 12px, onSurfaceVariant color). Extra right\npadding (36px) accommodates the chevron.\n\nStyling:\n- Border: `1px solid var(--ggui-color-outline)` (normal),\n  `var(--ggui-color-error-500)` (error)\n- Background: `var(--ggui-color-surface)` (normal),\n  `var(--ggui-color-surface)` (disabled)\n- Text: `var(--ggui-color-onSurface)` when a value is selected,\n  `var(--ggui-color-onSurfaceVariant)` when showing placeholder\n- Border radius: `var(--ggui-shape-radius-md)`\n- Cursor: `pointer` (normal), `not-allowed` (disabled)\n- Transitions: border-color, box-shadow at 200ms ease-in-out\n\nAccessibility: auto-generated `id` links `<label>` to `<select>`.\nWhen `error` is set, `aria-invalid` is true and the message has `role=\"alert\"`.\n\nAlso extends native `SelectHTMLAttributes` (except `style`, `className`,\n`onChange`, `size`).\n\n**IMPORTANT:** `onChange` receives the selected value string directly, NOT a\nReact `ChangeEvent`. This differs from native `<select>` behavior.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| label | `string` | - | Label rendered above the select. Linked via auto-generated `htmlFor`/`id`. Styled with `var(--ggui-font-size-sm)` and `var(--ggui-color-onSurfaceVariant)`. |\n| value | `string` | - | Controlled value. Should match one of the `options[].value` strings. |\n| onChange | `(value: string) => void` | - | Change handler. Receives the selected option's value string directly, NOT a React event. |\n| options | `SelectOption[]` | - | Array of selectable options. Rendered as native `<option>` elements. Must contain at least one option (or use `placeholder` for an empty-state prompt). |\n| placeholder | `string` | - | Placeholder text rendered as a disabled `<option value=\"\">` at the top of the list. Shown when no value is selected. |\n| error | `string` | - | Error message displayed below the select in `var(--ggui-color-error-500)`. When set, the border turns red and the message has `role=\"alert\"`. Takes precedence over `helperText`. |\n| helperText | `string` | - | Helper text displayed below the select in `var(--ggui-color-onSurfaceVariant)`. Only shown when `error` is not set. |\n| required | `boolean` | `false` | When true, appends a red asterisk (`*`) to the label and sets the native `required` attribute. |\n| disabled | `boolean` | `false` | When true, sets the native `disabled` attribute. Background changes to `var(--ggui-color-surface)` and cursor becomes `not-allowed`. |\n| size | `'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls padding and font size: - `'sm'` -- padding `6px 10px`, font `var(--ggui-font-size-sm)` - `'md'` -- padding `10px 12px`, font `var(--ggui-font-size-sm)` - `'lg'` -- padding `12px 14px`, font `var(--ggui-font-size-base)` |\n\n**Example:**\n```tsx\n<Select\n  label=\"Country\"\n  value={country}\n  onChange={setCountry}\n  options={[\n    { value: 'us', label: 'United States' },\n    { value: 'uk', label: 'United Kingdom' },\n  ]}\n  placeholder=\"Select a country\"\n/>\n```\n\n### Checkbox\n\nCheckbox -- A custom-styled checkbox with label and description.\n\nRenders a `<label>` wrapper containing a visually-hidden native `<input type=\"checkbox\">`\noverlaid by a custom 18x18px visual box. Supports checked, unchecked, and indeterminate\nstates, each with a distinct SVG icon (checkmark or horizontal dash).\n\nStyling:\n- Box border: `2px solid var(--ggui-color-primary-600)` (checked/indeterminate),\n  `var(--ggui-color-outline)` (unchecked)\n- Box fill: `var(--ggui-color-primary-600)` (checked/indeterminate),\n  `var(--ggui-color-surface)` (unchecked)\n- Check/dash icon: white SVG, 12x12px\n- Box radius: `var(--ggui-shape-radius-sm)`\n- Transition: all 0.2s\n- Label: `var(--ggui-font-size-sm)`, `var(--ggui-font-weight-medium)`\n- Description: `var(--ggui-font-size-xs)`, `var(--ggui-color-onSurfaceVariant)`\n- Disabled: `opacity: 0.5`, `cursor: not-allowed`\n- Gap between box and text: `var(--ggui-spacing-2)`\n\n**IMPORTANT:** `onChange` receives the boolean checked state directly, NOT a\nReact `ChangeEvent`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| label | `string` | - | Primary label text rendered beside the checkbox box. Styled with `var(--ggui-font-size-sm)` and `var(--ggui-color-onSurfaceVariant)`. |\n| checked | `boolean` | - | Controlled checked state. |\n| onChange | `(checked: boolean) => void` | - | Change handler. Receives the new boolean checked state directly, NOT a React event. |\n| disabled | `boolean` | `false` | When true, sets `opacity: 0.5` and `cursor: not-allowed`. The native input is also disabled, preventing keyboard and click interaction. |\n| description | `string` | - | Secondary description text rendered below the label in smaller, muted type (`var(--ggui-font-size-xs)`, `var(--ggui-color-onSurfaceVariant)`). |\n| indeterminate | `boolean` | `false` | When true, displays a horizontal dash instead of a checkmark. Used for \"select all\" states where some (but not all) children are checked. The `indeterminate` property is set via a ref on the native `<input>`. Visually identical to `checked` in terms of border and fill color. |\n\n**Example:**\n```tsx\n<Checkbox\n  label=\"Accept terms\"\n  description=\"You agree to the Terms of Service and Privacy Policy\"\n  checked={accepted}\n  onChange={setAccepted}\n/>\n```\n\n### Toggle\n\nToggle -- A switch/toggle input rendered as a pill-shaped track with a sliding knob.\n\nRenders a `<label>` wrapper with a `<div role=\"switch\">` track and an animated\ncircular knob. Does NOT use a native `<input>` -- keyboard interaction is handled\nmanually (Space and Enter keys toggle the state). The element is focusable via\n`tabIndex={0}` and shows a focus ring on focus.\n\nStyling:\n- Track (on): `var(--ggui-color-primary-600)`\n- Track (off): `var(--ggui-color-outline)`\n- Knob: white circle with `var(--ggui-shape-shadow-sm)`\n- Focus ring: `0 0 0 3px var(--ggui-color-primary-200)`\n- Transitions: background-color, box-shadow, knob position at 200ms ease-in-out\n- Disabled: `opacity: 0.5`, `cursor: not-allowed`, `tabIndex: -1`\n- Gap between toggle and label: `var(--ggui-spacing-2)`\n\n**IMPORTANT:** `onChange` receives the new boolean state directly (inverted from\ncurrent), NOT a React event.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| label | `string` | - | Label text rendered to the right of the toggle track. Also used as `aria-label` on the switch element. Styled with `var(--ggui-font-size-sm)` and `var(--ggui-color-onSurfaceVariant)`. |\n| checked | `boolean` | - | Controlled checked (on/off) state. |\n| onChange | `(checked: boolean) => void` | - | Change handler. Receives the new boolean state directly (i.e., `!checked`), NOT a React event. |\n| disabled | `boolean` | `false` | When true, sets `opacity: 0.5`, `cursor: not-allowed`, and removes the element from tab order (`tabIndex: -1`). Click and keyboard handlers are suppressed. |\n| size | `'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls track and knob dimensions: - `'sm'` -- track 36x20px, knob 16px diameter - `'md'` -- track 44x24px, knob 20px diameter - `'lg'` -- track 52x28px, knob 24px diameter |\n\n**Example:**\n```tsx\n<Toggle label=\"Enable notifications\" checked={enabled} onChange={setEnabled} size=\"md\" />\n```\n\n### RadioGroup\n\nRadioGroup -- A group of mutually exclusive radio options with optional label and error.\n\nRenders a `<div role=\"radiogroup\">` containing a label span, a flex container of\nradio options, and an optional error message. Each option is a `<label>` with a\nvisually-hidden native `<input type=\"radio\">` and a custom 18px circle indicator.\n\nStyling:\n- Selected circle: `2px solid var(--ggui-color-primary-600)` border with\n  an 8px `var(--ggui-color-primary-600)` filled inner dot\n- Unselected circle: `2px solid var(--ggui-color-outline)` border,\n  `var(--ggui-color-surface)` fill\n- Circle radius: `var(--ggui-shape-radius-full)`\n- Transition: all 0.2s\n- Vertical gap: `var(--ggui-spacing-2)`, horizontal gap: `var(--ggui-spacing-4)`\n- Error: `var(--ggui-font-size-xs)`, `var(--ggui-color-error-500)`,\n  `role=\"alert\"`\n- Disabled options: `opacity: 0.5`, `cursor: not-allowed`\n\nAccessibility: the group has `role=\"radiogroup\"` with `aria-labelledby` pointing\nto the label and `aria-describedby` pointing to the error message (when present).\nAll radio inputs share a common auto-generated `name` attribute.\n\n**IMPORTANT:** `onChange` receives the selected option's value string directly,\nNOT a React `ChangeEvent`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| label | `string` | - | Group label rendered above the options. Used as `aria-labelledby` target on the `role=\"radiogroup\"` container. Styled with `var(--ggui-font-size-sm)` and `var(--ggui-color-onSurfaceVariant)`. |\n| value | `string` | - | Controlled value. Should match one of `options[].value`. |\n| onChange | `(value: string) => void` | - | Change handler. Receives the newly selected option's value string directly, NOT a React event. |\n| options | `RadioOption[]` | - | Array of radio options. Must contain at least two options for meaningful selection. |\n| direction | `'vertical' \\| 'horizontal'` | `'vertical'` | Layout direction for the options container: - `'vertical'` -- column layout, `var(--ggui-spacing-2)` gap - `'horizontal'` -- row layout with `flex-wrap: wrap`, `var(--ggui-spacing-4)` gap |\n| disabled | `boolean` | `false` | When true, disables ALL options (individual `RadioOption.disabled` is additive). Each option gets `opacity: 0.5` and `cursor: not-allowed`. |\n| error | `string` | - | Error message displayed below all options in `var(--ggui-color-error-500)` with `role=\"alert\"`. Linked to the radiogroup via `aria-describedby`. |\n\n**Example:**\n```tsx\n<RadioGroup\n  label=\"Plan\"\n  value={plan}\n  onChange={setPlan}\n  options={[\n    { value: 'free', label: 'Free', description: 'Up to 5 projects' },\n    { value: 'pro', label: 'Pro', description: 'Unlimited projects' },\n  ]}\n/>\n```\n\n### Slider\n\nSlider -- A range input with a custom-styled track, fill, and thumb.\n\nRenders a `<div>` wrapper containing an optional label/value header, and a\ntrack area with three layers: background track, colored fill, and a circular\nthumb. A native `<input type=\"range\">` is overlaid with `opacity: 0` to\nprovide accessible keyboard and pointer interaction.\n\nStyling:\n- Track: 6px tall, `var(--ggui-color-outlineVariant)` background, `border-radius: 3px`\n- Fill: `var(--ggui-color-primary-600)` (normal),\n  `var(--ggui-color-outline)` (disabled)\n- Thumb: 20px white circle with `2px solid var(--ggui-color-primary-600)`,\n  `var(--ggui-shape-shadow-sm)`; disabled border uses outline\n- Value display (when `showValue`): `var(--ggui-color-primary-600)`,\n  `var(--ggui-font-size-sm)`, right-aligned in the header row\n- Fill and thumb transitions: 0.1s for smooth dragging\n\nAccessibility: the native `<input type=\"range\">` carries `aria-valuenow`,\n`aria-valuemin`, `aria-valuemax`, and is linked to the label via `aria-labelledby`.\nFalls back to `aria-label=\"Slider\"` when no label is provided.\n\n**IMPORTANT:** `onChange` receives the numeric value directly, NOT a React\n`ChangeEvent`. The value is coerced via `Number(e.target.value)`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| label | `string` | - | Label rendered above the slider track (left-aligned). Used as `aria-labelledby` target on the native range input. Styled with `var(--ggui-font-size-sm)` and `var(--ggui-color-onSurfaceVariant)`. |\n| value | `number` | `0` | Controlled numeric value. Must be between `min` and `max`. |\n| onChange | `(value: number) => void` | - | Change handler. Receives the new numeric value directly, NOT a React event. |\n| min | `number` | `0` | Minimum allowed value. |\n| max | `number` | `100` | Maximum allowed value. |\n| step | `number` | `1` | Step increment for the slider. Determines the granularity of selectable values. |\n| disabled | `boolean` | `false` | When true, sets `cursor: not-allowed` on the native input. The fill color changes to `var(--ggui-color-outline)` and the thumb border also uses outline. |\n| showValue | `boolean` | `false` | When true, displays the current numeric value right-aligned in the header row (beside the label) in `var(--ggui-color-primary-600)`. |\n\n**Example:**\n```tsx\n<Slider label=\"Volume\" value={volume} onChange={setVolume} min={0} max={100} step={5} showValue />\n```\n\n### Badge\n\nBadge -- Inline label for status indicators, counts, or categories.\n\nRenders a `<span>` with `display: inline-flex`, centered content, and\n`white-space: nowrap`. Semantic variant colors use background/text pairings\nfrom the 100/700 color scale. Pill shape uses `border-radius: 9999px`;\nnon-pill uses `var(--ggui-shape-radius-sm)`.\n\nFont weight: `var(--ggui-font-weight-medium)` across all variants.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| variant | `'default' \\| 'primary' \\| 'secondary' \\| 'success' \\| 'warning' \\| 'error' \\| 'info'` | `'default'` | Visual style. Maps to background/text color pairings: - `'default'` -- bg `var(--ggui-color-surfaceVariant)`, text `var(--ggui-color-onSurfaceVariant)` - `'primary'` -- bg `var(--ggui-color-primary-100)`, text `var(--ggui-color-primary-700)` - `'secondary'` -- bg `var(--ggui-color-outlineVariant)`, text `var(--ggui-color-onSurface)` - `'success'` -- bg `var(--ggui-color-success-100)`, text `var(--ggui-color-success-700)` - `'warning'` -- bg `var(--ggui-color-warning-100)`, text `var(--ggui-color-warning-700)` - `'error'` -- bg `var(--ggui-color-error-100)`, text `var(--ggui-color-error-700)` - `'info'` -- bg `var(--ggui-color-info-100)`, text `var(--ggui-color-info-700)` |\n| size | `'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls padding and font size: - `'sm'` -- padding `2px 6px`, font `var(--ggui-font-size-xs)` - `'md'` -- padding `2px 8px`, font `var(--ggui-font-size-xs)` - `'lg'` -- padding `4px 10px`, font `var(--ggui-font-size-sm)` |\n| pill | `boolean` | `true` | When true, uses fully rounded corners (`border-radius: 9999px`). When false, uses `var(--ggui-shape-radius-sm)`. |\n\n**Example:**\n```tsx\n<Badge variant=\"success\" size=\"sm\">Active</Badge>\n```\n\n### Spinner\n\nSpinner -- Animated SVG loading indicator.\n\nRenders an `<svg>` with `role=\"status\"` and `aria-label=\"Loading\"`.\nThe SVG contains a full outlineVariant background circle and a quarter-arc\nforeground stroke in the spinner color.\n\nAnimation: `ggui-spin 1s linear infinite` (360-degree rotation).\nThe `@keyframes ggui-spin` definition is injected inline via a `<style>` tag.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| size | `number` | `24` | Width and height of the SVG element in pixels. The internal viewBox is always `0 0 24 24`, so this controls rendered size only. |\n| tone | `\\| 'default'     \\| 'muted'     \\| 'subtle'     \\| 'emphasized'     \\| 'loud'     \\| 'success'     \\| 'warning'     \\| 'error'     \\| 'info'     \\| 'inverse'     \\| 'inherit'` | `undefined (uses `var(--ggui-color-primary-600)`)` | Semantic color slot for the animated foreground arc. Same vocabulary as ; the theme decides the resolved value. The background circle always uses `var(--ggui-color-outlineVariant)`.  Use `'inherit'` when the spinner sits inside a colored container (e.g. inside a Button) \u2014 the stroke picks up `currentColor` from the parent so it tracks the container's foreground. |\n\n**Example:**\n```tsx\n<Spinner size={32} tone=\"success\" />\n```\n\n### Avatar\n\nAvatar -- User or entity representation with image or auto-generated initials.\n\nRenders a `<div role=\"img\">` with `overflow: hidden` and `flex-shrink: 0`.\nWhen `src` is provided and loads successfully, renders an `<img>` with\n`object-fit: cover`. On image error (or when no `src`), falls back to\ninitials derived from `name` (up to 2 characters, uppercase).\n\nInitials background: deterministic color from a 5-color palette based on\nname hash (primary-500, success-500, warning-500, error-500, info-500).\nFalls back to `var(--ggui-color-outline)` when no name is given.\nInitials text: white, `font-weight: var(--ggui-font-weight-semibold)`,\n`font-size: resolvedSize * 0.4`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| src | `string` | - | Image URL. When provided and the image loads, it is rendered with `object-fit: cover`. On load error, falls back to initials. |\n| name | `string` | - | Name used for two purposes: 1. Generating initials (splits on spaces, takes first letter of each word, max 2). 2. Deterministic background color selection via character code hash. Also used as `aria-label` on the container. Falls back to `'Avatar'` if omitted. |\n| size | `number \\| 'xs' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl'` | `'md'` | Avatar dimensions. Named sizes map to pixel values: - `'xs'` -- 24px - `'sm'` -- 32px - `'md'` -- 40px - `'lg'` -- 48px - `'xl'` -- 64px  Numeric values are used directly as pixel dimensions. |\n| shape | `'circle' \\| 'square'` | `'circle'` | Container shape. - `'circle'` -- `border-radius: 50%` - `'square'` -- `border-radius: var(--ggui-shape-radius-md)` |\n\n**Example:**\n```tsx\n<Avatar src=\"/photos/jane.jpg\" name=\"Jane Doe\" size=\"lg\" shape=\"circle\" />\n```\n\n### Alert\n\nAlert -- Contextual message box for important information with icon and optional dismiss.\n\nRenders a `<div role=\"alert\">` with flex layout (12px gap), variant-specific\nbackground, border, text color, and a leading icon. Each variant provides a\ndefault SVG icon (info circle, checkmark, warning triangle, or X circle) that\ncan be overridden via the `icon` prop.\n\nLayout: icon (flex-shrink: 0) | content column (title + body) | close button.\nBorder radius: `var(--ggui-shape-radius-lg)`.\nPadding: `12px 16px`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| variant | `'info' \\| 'success' \\| 'warning' \\| 'error'` | `'info'` | Visual style. Maps to background/border/text/icon color sets: - `'info'` -- bg `var(--ggui-color-info-50)`, border `var(--ggui-color-info-200)`, text `var(--ggui-color-info-800)`, icon `var(--ggui-color-info-500)` - `'success'` -- bg `var(--ggui-color-success-50)`, border `var(--ggui-color-success-200)`, text `var(--ggui-color-success-800)`, icon `var(--ggui-color-success-500)` - `'warning'` -- bg `var(--ggui-color-warning-50)`, border `var(--ggui-color-warning-200)`, text `var(--ggui-color-warning-800)`, icon `var(--ggui-color-warning-500)` - `'error'` -- bg `var(--ggui-color-error-50)`, border `var(--ggui-color-error-200)`, text `var(--ggui-color-error-800)`, icon `var(--ggui-color-error-500)` |\n| title | `string` | - | Optional title rendered above the body in semibold (`var(--ggui-font-weight-semibold)`), `var(--ggui-font-size-sm)`. Title and body are separated by `var(--ggui-spacing-1)` gap. |\n| closable | `boolean` | `false` | When true, renders a close button (X icon) in the top-right area. The button has `min-width: 28px`, `min-height: 28px`, and `opacity: 0.7`. Requires `onClose` to be functional. |\n| onClose | `() => void` | - | Callback fired when the close button is clicked. Only relevant when `closable` is true. |\n| icon | `ReactNode` | - | Custom icon ReactNode to replace the default variant icon. Rendered at the leading position with the variant's icon color applied via `color` CSS property. |\n\n**Example:**\n```tsx\n<Alert variant=\"warning\" title=\"Rate limit\" closable onClose={() => setShow(false)}>\n  You have 3 requests remaining this minute.\n</Alert>\n```\n\n### Progress\n\nProgress -- Horizontal progress bar with determinate and indeterminate modes.\n\nRenders a track `<div role=\"progressbar\">` with a colored fill child.\nThe track background is `var(--ggui-color-outlineVariant)` with\npill-shaped corners (border-radius = height / 2).\n\nDeterminate mode: fill width transitions smoothly (`width 0.3s ease`).\nIndeterminate mode: fill is 30% width, animated with\n`ggui-progress-indeterminate 1.5s ease-in-out infinite`\n(translateX from -100% to 400%). The `@keyframes` are injected inline.\n\nAccessibility: `aria-valuenow` is set in determinate mode, omitted in\nindeterminate. `aria-valuemin` is always 0, `aria-valuemax` matches `max`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| value | `number` | - | Current progress value. Clamped to `[0, max]` and converted to a percentage for the fill width: `Math.min(100, Math.max(0, (value / max) * 100))`. |\n| max | `number` | `100` | Maximum value representing 100% progress. |\n| variant | `'default' \\| 'success' \\| 'warning' \\| 'error'` | `'default'` | Fill bar color. Maps to CSS variables: - `'default'` -- `var(--ggui-color-primary-600)` - `'success'` -- `var(--ggui-color-success-500)` - `'warning'` -- `var(--ggui-color-warning-500)` - `'error'` -- `var(--ggui-color-error-500)` |\n| size | `'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls track height in pixels: - `'sm'` -- 4px - `'md'` -- 8px - `'lg'` -- 12px |\n| label | `string` | - | Accessible name describing what this bar measures, e.g. `\"Survey progress\"` or `\"Upload\"`. Becomes the progressbar's `aria-label` and \u2014 when `showLabel` is set \u2014 the visible header text in place of the generic word \"Progress\". Always pass this when the surrounding context does not already make the meaning obvious. |\n| showLabel | `boolean` | `false` | When true, displays a header row above the track with the `label` text (or \"Progress\" if `label` is unset) on the left, and the rounded percentage value on the right. |\n| indeterminate | `boolean` | `false` | When true, ignores `value` for visual width and plays a looping animation instead. The fill bar is 30% width and slides across the track. Animation: `ggui-progress-indeterminate 1.5s ease-in-out infinite`. `aria-valuenow` is omitted from the progressbar element. |\n\n**Example:**\n```tsx\n<Progress value={65} variant=\"success\" size=\"md\" showLabel />\n```\n\n### Image\n\nImage -- An `<img>` element with built-in error handling and fallback support.\n\nRenders a native `<img>` with `display: block`. On load error, either renders\nthe `fallback` ReactNode (if provided) or a default placeholder `<div>` with a\nsurfaceVariant background and a centered image SVG icon in outline.\n\nSize values: numbers are treated as pixels, strings are passed through as-is.\nWhen no `width` is set, defaults to `100%`. When no `height` is set, defaults\nto `auto`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| src | `string` | - | Image source URL. Load failure triggers the fallback state. |\n| alt | `string` | - | Alt text for the image. Used as `aria-label` in the error placeholder too. |\n| width | `number \\| string` | `'100%' (applied at render time, not on the type)` | Image width. Numbers are pixels, strings are CSS values (e.g., `'100%'`, `'50vw'`). |\n| height | `number \\| string` | `'auto' (applied at render time, not on the type)` | Image height. Numbers are pixels, strings are CSS values. |\n| objectFit | `'cover' \\| 'contain' \\| 'fill' \\| 'none' \\| 'scale-down'` | `'cover'` | CSS `object-fit` value controlling how the image fills its box. |\n| radius | `'none' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| number \\| string` | - | Corner radius applied to both the image and the error placeholder. Prefer a radius-scale name (`'none' \\| 'sm' \\| 'md' \\| 'lg' \\| 'xl'`) \u2014 each resolves to the matching `--ggui-shape-radius-*` token. A number is treated as pixels; any other string is passed through. |\n| fallback | `ReactNode` | - | Custom ReactNode rendered when the image fails to load. When provided, completely replaces the default error placeholder (no wrapper div). When omitted, a surfaceVariant background div with an image icon is shown. |\n\n**Example:**\n```tsx\n<Image src=\"/hero.jpg\" alt=\"Hero banner\" width=\"100%\" height={400} objectFit=\"cover\" radius=\"md\" />\n```\n\n### Icon\n\nIcon -- 185 Lucide icons + emoji passthrough.\n\nThree resolution layers:\n1. **Lucide icon:** pass any common Lucide icon name (e.g. `sun`, `cloud-rain`, `heart`, `shopping-cart`).\n   Accepts kebab-case, camelCase, or PascalCase. Renders as stroke SVG.\n2. **Emoji:** pass emoji/unicode directly (e.g. `\u2600\uFE0F`, `\u{1F327}\uFE0F`). Rendered as text.\n3. **Custom SVG:** pass children (`<svg>` element) for full control.\n\nContainer: `<span>` with `display: inline-flex`, centered content.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| name | `string` | - | Lucide icon name (kebab-case, camelCase, or PascalCase all work). Also accepts emoji/unicode characters directly. |\n| size | `number` | `24` | Icon dimensions in pixels (applied to both width and height of the wrapper and the inner SVG element). |\n| tone | `\\| 'default'     \\| 'muted'     \\| 'subtle'     \\| 'emphasized'     \\| 'loud'     \\| 'success'     \\| 'warning'     \\| 'error'     \\| 'info'     \\| 'inverse'     \\| 'inherit'` | `undefined (icon uses `currentColor`)` | Semantic color slot. Same vocabulary as ; the theme decides what each tone LOOKS like. Resolves to a CSS `color` on the wrapper which the inner SVG inherits via `currentColor`. Use `'inherit'` (the default behavior when unset) for icons that should pick up the parent's foreground color. |\n| children | `ReactNode` | - | Custom SVG children. When provided, `name` is ignored and children are rendered inside a sized `<span>` wrapper. |\n| 'aria-label' | `string` | - | Accessible name for a standalone, meaning-bearing icon. When set, the icon exposes `role=\"img\"` + this label. When omitted (the default) the icon is decorative and hidden from screen readers (`aria-hidden`) \u2014 the right choice for an icon next to a text label. |\n\n**Example:**\n```tsx\n<Icon name=\"search\" size={20} tone=\"muted\" />\n<Icon name=\"cloud-rain\" size={32} />\n<Icon name=\"\u2600\uFE0F\" size={24} />\n```\n\n### Link\n\nLink -- Styled anchor element with external link support.\n\nRenders a native `<a>` element. When `external` is true, sets\n`target=\"_blank\"` and `rel=\"noopener noreferrer\"`, and appends a small\n(12px) external-link SVG icon after the children.\n\nTransition: `color 0.2s`.\nUnderline behavior is controlled via mouseEnter/mouseLeave event handlers\n(for the `'hover'` mode).\n\nAlso extends native `AnchorHTMLAttributes` (except `style`/`className`),\nso props like `aria-*`, `data-*`, `title`, etc. are forwarded to the `<a>`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | children |\n| href | `string` | - | Destination URL. Passed directly to the `<a href>` attribute. |\n| external | `boolean` | `false` | When true, opens link in a new tab (`target=\"_blank\"`, `rel=\"noopener noreferrer\"`) and appends a 12px external-link icon after children. |\n| tone | `\\| 'default'     \\| 'muted'     \\| 'subtle'     \\| 'emphasized'     \\| 'loud'     \\| 'success'     \\| 'warning'     \\| 'error'     \\| 'info'     \\| 'inverse'     \\| 'inherit'` | `undefined (uses `var(--ggui-color-primary-600)`)` | Semantic color slot for the link text. Same vocabulary as ; the theme decides what each tone LOOKS like. Defaults to a primary-tinted accent (`'loud'`-ish) when unset. |\n| underline | `'always' \\| 'hover' \\| 'none'` | `'hover'` | Underline behavior: - `'always'` -- `text-decoration: underline` at all times - `'hover'` -- underline appears on mouse enter, removed on mouse leave - `'none'` -- no underline ever |\n\n**Example:**\n```tsx\n<Link href=\"https://docs.ggui.ai\" external>Documentation</Link>\n```\n\n### Tooltip\n\nTooltip -- Hoverable information popup positioned relative to a trigger element.\n\nWraps `children` in a `<div>` trigger (display: inline-block) and renders\na fixed-position tooltip `<div role=\"tooltip\">` when visible.\n\nTooltip appearance:\n- Background: `var(--ggui-color-onSurface)`\n- Text: white, `var(--ggui-font-size-xs)`\n- Padding: `6px 10px`, border-radius: `var(--ggui-shape-radius-md)`\n- Max width: 200px, `white-space: nowrap`, `pointer-events: none`\n- Z-index: `zIndex.tooltip` (1800)\n\nShow/hide: triggered by mouseEnter/mouseLeave AND focus/blur on the\ntrigger element. Uses `position: fixed` with coordinates calculated from\n`getBoundingClientRect()` and an 8px offset from the trigger edge.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | Trigger element. Wrapped in a `<div>` with mouseEnter/mouseLeave and focus/blur handlers. |\n| content | `ReactNode` | - | Tooltip content. Can be text or any ReactNode. |\n| position | `'top' \\| 'bottom' \\| 'left' \\| 'right'` | `'top'` | Tooltip placement relative to the trigger element: - `'top'` -- above, centered horizontally, transformed `translateX(-50%) translateY(-100%)` - `'bottom'` -- below, centered horizontally, transformed `translateX(-50%)` - `'left'` -- to the left, centered vertically, transformed `translateX(-100%) translateY(-50%)` - `'right'` -- to the right, centered vertically, transformed `translateY(-50%)` |\n| delay | `number` | `200` | Delay in milliseconds before the tooltip becomes visible after hover/focus. Hiding is immediate (no delay). |\n\n**Example:**\n```tsx\n<Tooltip content=\"Copy to clipboard\" position=\"top\">\n  <Button variant=\"ghost\"><Icon name=\"copy\" /></Button>\n</Tooltip>\n```\n\n### Table\n\nTable -- Data table with sortable columns, striped rows, and hover highlights.\n\nRenders a scrollable wrapper `<div>` containing a native `<table>` with\n`border-collapse: collapse` and `width: 100%`. The wrapper has\n`overflow-x: auto` for horizontal scrolling on narrow viewports.\n\nHeader row: 2px bottom border (`var(--ggui-color-outlineVariant)`).\nData rows: 1px bottom border (`var(--ggui-color-surfaceVariant)`).\nHover: `var(--ggui-color-surface)` background with 150ms ease transition.\nStriped: alternating rows (odd index) get `var(--ggui-color-surface)`.\n\nSort behavior: clicking a sortable column header calls `onSort(key, direction)`.\nIf the same column is clicked again while ascending, it toggles to descending.\nThe component does NOT sort data internally -- the parent must sort `data` and\npass updated `sortKey`/`sortDirection`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| columns | `TableColumn<T>[]` | - | Array of column definitions controlling header labels, data keys, and rendering. |\n| data | `T[]` | - | Array of row data objects. Each object's keys should match the column `key` values. |\n| sortKey | `string` | - | The `key` of the currently sorted column. Used to highlight the active sort indicator and determine toggle direction on next click. |\n| sortDirection | `SortDirection` | `'asc'` | Current sort direction for the column identified by `sortKey`. Controls which triangle indicator is highlighted in the header. |\n| onSort | `(key: string, direction: SortDirection) => void` | - | Sort change handler. Called when a sortable column header is clicked. Receives the column `key` and the new `SortDirection`. The component does NOT sort data internally -- you must sort `data` in your state and pass updated `sortKey`/`sortDirection`. |\n| striped | `boolean` | `false` | When true, alternating rows (odd index) get a `var(--ggui-color-surface)` background. |\n| hoverable | `boolean` | `true` | When true, rows highlight with `var(--ggui-color-surface)` on mouse enter, with a 150ms ease background-color transition. |\n| compact | `boolean` | `false` | When true, reduces cell padding: - Compact: `var(--ggui-spacing-1) var(--ggui-spacing-2)` - Normal: `var(--ggui-spacing-2) var(--ggui-spacing-4)` |\n| bordered | `boolean` | `false` | When true, adds a 1px border around the table wrapper and between cells. Wrapper border: `1px solid var(--ggui-color-outlineVariant)`. Cell borders: `1px solid var(--ggui-color-surfaceVariant)`. Wrapper border-radius: `var(--ggui-shape-radius-lg)`. |\n| caption | `string` | - | Accessible table caption. Rendered as a `<caption>` element with `caption-side: top`, `var(--ggui-font-size-sm)`, `var(--ggui-color-onSurfaceVariant)`. |\n\n**Example:**\n```tsx\n<Table\n  columns={[\n    { key: 'name', header: 'Name', sortable: true },\n    { key: 'role', header: 'Role' },\n    { key: 'status', header: 'Status', render: (v) => <Badge variant={v as string}>{v as string}</Badge> },\n  ]}\n  data={users}\n  sortKey={sortKey}\n  sortDirection={sortDir}\n  onSort={(key, dir) => { setSortKey(key); setSortDir(dir); }}\n  striped\n/>\n```\n\n### Tabs\n\nTabs -- Accessible tab navigation with panels and keyboard support.\n\nRenders a `<div role=\"tablist\">` with `<button role=\"tab\">` elements and a\n`<div role=\"tabpanel\">` for the active tab's content. Supports controlled\n(`activeKey` + `onChange`) and uncontrolled (internal state) modes.\n\nKeyboard navigation: ArrowLeft/ArrowRight (and ArrowUp/ArrowDown) cycle\nthrough enabled tabs. Home/End jump to first/last. Focus follows selection.\nDisabled tabs are skipped during keyboard navigation.\n\n**IMPORTANT:** `onChange` receives the tab's `key` string directly, NOT a\nReact event.\n\nTab panel padding: `var(--ggui-spacing-4) 0` (top/bottom only).\nTransitions: color, background-color, border-color at 200ms ease-in-out.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| items | `TabItem[]` | - | Array of tab definitions. Must contain at least one item. |\n| activeKey | `string` | - | Controlled active tab key. When provided, the component is controlled and will not manage its own state. Must match one of `items[].key`. When omitted, defaults to the first item's key (uncontrolled mode). |\n| onChange | `(key: string) => void` | - | Tab change handler. Receives the selected tab's `key` string directly, NOT a React event. In controlled mode, you must update `activeKey` in response to this callback. |\n| variant | `'line' \\| 'pills' \\| 'enclosed'` | `'line'` | Visual style of the tab bar: - `'line'` -- underline indicator (2px solid primary-600 on active), border-bottom on tab list - `'pills'` -- filled pill buttons (primary-600 bg, white text on active), surfaceVariant container with radius-lg - `'enclosed'` -- bordered tab buttons with open bottom (card-style), border-bottom on tab list |\n| size | `'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls tab button padding and font size: - `'sm'` -- padding `var(--ggui-spacing-1) var(--ggui-spacing-2)`, font `var(--ggui-font-size-xs)` - `'md'` -- padding `var(--ggui-spacing-2) var(--ggui-spacing-4)`, font `var(--ggui-font-size-sm)` - `'lg'` -- padding `var(--ggui-spacing-4) var(--ggui-spacing-6)`, font `var(--ggui-font-size-base)` |\n| fullWidth | `boolean` | `false` | When true, tab buttons expand equally to fill the container width (`flex: 1`, `justify-content: center` on each button). |\n\n**Example:**\n```tsx\n<Tabs\n  variant=\"pills\"\n  items={[\n    { key: 'overview', label: 'Overview', content: <Overview /> },\n    { key: 'settings', label: 'Settings', content: <Settings /> },\n  ]}\n  activeKey={tab}\n  onChange={setTab}\n/>\n```\n\n### Toast\n\nToast -- Notification banner with auto-dismiss and slide-in animation.\n\nRenders a `<div role=\"alert\" aria-live=\"assertive\">` with a variant-specific\nicon, optional title, message body, and optional close button.\n\nAnimation: `ggui-slideInUp 200ms ease-out both` on mount (from the motion\ntoken system). The keyframes are provided by the MotionKeyframes provider.\n\nAuto-dismiss: when `onClose` is provided and `duration > 0`, a timer calls\n`onClose` after `duration` ms. Setting `duration` to `0` disables auto-dismiss.\nThe timer resets if `visible`, `duration`, or `onClose` changes.\n\nDimensions: `min-width: 280px`, `max-width: 420px`.\nShadow: `var(--ggui-shape-shadow-lg, 0 10px 15px -3px rgba(0,0,0,0.1))`.\nBorder radius: `var(--ggui-shape-radius-lg)`.\n\nWhen `visible` is false, renders nothing (returns `null`).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| message | `ReactNode` | - | Message body content. Can be text or any ReactNode. |\n| variant | `'info' \\| 'success' \\| 'warning' \\| 'error'` | `'info'` | Visual style. Maps to background/border/text/icon color sets (same palette as Alert): - `'info'` -- bg `var(--ggui-color-info-50)`, border `var(--ggui-color-info-200)`, text `var(--ggui-color-info-800)` - `'success'` -- bg `var(--ggui-color-success-50)`, border `var(--ggui-color-success-200)`, text `var(--ggui-color-success-800)` - `'warning'` -- bg `var(--ggui-color-warning-50)`, border `var(--ggui-color-warning-200)`, text `var(--ggui-color-warning-800)` - `'error'` -- bg `var(--ggui-color-error-50)`, border `var(--ggui-color-error-200)`, text `var(--ggui-color-error-800)` |\n| title | `string` | - | Optional title rendered above the message in semibold (`var(--ggui-font-weight-semibold)`, `var(--ggui-font-size-sm)`). |\n| duration | `number` | `5000` | Auto-dismiss delay in milliseconds. After this duration, `onClose` is called automatically. Set to `0` to disable auto-dismiss (toast stays until manually closed). The timer is only active when both `visible` is true and `onClose` is provided. |\n| onClose | `() => void` | - | Callback fired on auto-dismiss timeout or when the close button is clicked. When provided, a close button (X icon, 16px) is rendered in the top-right area. When omitted, no close button is shown and auto-dismiss is disabled. |\n| visible | `boolean` | `true` | Controls rendering. When false, the component returns `null`. Toggling from false to true triggers the slide-in animation. |\n| position | `'top-right' \\| 'top-left' \\| 'bottom-right' \\| 'bottom-left' \\| 'top-center' \\| 'bottom-center'` | - | Intended screen position. This prop is defined on the interface but is NOT implemented by the Toast component itself -- positioning must be handled by a parent container or toast manager. |\n\n**Example:**\n```tsx\n<Toast variant=\"success\" title=\"Saved\" message=\"Your changes have been saved.\" onClose={() => setShow(false)} />\n```\n\n### Accordion\n\nAccordion -- Collapsible content sections with chevron rotation animation.\n\nRenders a vertical list of items, each with a `<button>` header (inside `<h3>`)\nand a `<div role=\"region\">` panel. Supports controlled (`expandedKeys` + `onChange`)\nand uncontrolled (internal state) modes.\n\nChevron animation: the trailing chevron icon rotates from 0deg (collapsed) to\n180deg (expanded) with `transition: transform 200ms ease-in-out`.\n\nHeader button: full-width flex layout (`justify-content: space-between`),\n`var(--ggui-font-size-sm)`, `var(--ggui-font-weight-medium)`,\n`var(--ggui-color-onSurface)`.\nHeader padding: `var(--ggui-spacing-2) var(--ggui-spacing-4)`.\nBackground transition: `background-color 100ms ease-in-out`.\n\n**IMPORTANT:** `onChange` receives the full array of currently expanded keys,\nNOT a single key or a React event. In single mode (`multiple: false`), this\narray will have at most one element.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| items | `AccordionItem[]` | - | Array of collapsible section definitions. |\n| expandedKeys | `string[]` | - | Controlled expanded state. Array of item `key` values that should be open. When provided, the component is controlled and will not manage its own expansion state. When omitted, defaults to `[]` (all collapsed, uncontrolled mode). |\n| onChange | `(expandedKeys: string[]) => void` | - | Expand/collapse handler. Receives the complete array of expanded keys after a toggle. In controlled mode, you must update `expandedKeys` in response to this callback. |\n| multiple | `boolean` | `false` | When true, multiple items can be open simultaneously. When false, opening one item closes any other open item (single-expand mode). |\n| variant | `'default' \\| 'bordered' \\| 'separated'` | `'default'` | Visual style controlling borders and spacing: - `'default'` -- top border on first item, bottom border on all items (`var(--ggui-color-outlineVariant)`), no gap between items - `'bordered'` -- connected card style with left/right/bottom borders on all items, top border on first, shared rounded corners (radius-lg on first/last) - `'separated'` -- each item is an independent card with full border (`1px solid var(--ggui-color-outlineVariant)`), `var(--ggui-shape-radius-lg)` radius, `var(--ggui-spacing-2)` gap between items |\n\n**Example:**\n```tsx\n<Accordion\n  variant=\"separated\"\n  items={[\n    { key: 'faq1', title: 'How do I get started?', content: 'Sign up and...' },\n    { key: 'faq2', title: 'What is the pricing?', content: 'We offer...' },\n  ]}\n  expandedKeys={expanded}\n  onChange={setExpanded}\n  multiple\n/>\n```\n\n### Support Types\n\n**ResponsiveColumns:**\n\nExplicit column count per viewport breakpoint, mobile-first. `base`\napplies from 0 up; each named key overrides at and above its\nbreakpoint width (`sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px).\nOmit `base` to default to a single column on the narrowest screens.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| base | `number` | Columns below the `sm` breakpoint. |\n| sm | `number` | Columns from 640px up. |\n| md | `number` | Columns from 768px up. |\n| lg | `number` | Columns from 1024px up. |\n| xl | `number` | Columns from 1280px up. |\n\n**SelectOption:**\n\nAn individual option within a `Select` dropdown.\n\nRendered as a native `<option>` element. When `disabled` is true, the option\nis visible but not selectable.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| value | `string` | The value submitted when this option is selected. Must be unique within the options array. |\n| label | `string` | The display text shown in the dropdown. |\n| disabled | `boolean` | When true, the option is visible but cannot be selected (grayed out by the browser). |\n\n**RadioOption:**\n\nAn individual option within a `RadioGroup`.\n\nRendered as a `<label>` containing a visually-hidden `<input type=\"radio\">`\nand a custom 18px circle indicator. Supports an optional description line\nbelow the label text.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| value | `string` | The value emitted via `RadioGroupProps.onChange` when this option is selected. Must be unique. |\n| label | `string` | Display text for this option. Styled with `var(--ggui-font-size-sm)` and `var(--ggui-color-onSurfaceVariant)`. |\n| description | `string` | Optional secondary description rendered below the label in smaller, muted type (`var(--ggui-font-size-xs)`, `var(--ggui-color-onSurfaceVariant)`). |\n| disabled | `boolean` | When true, this individual option is grayed out (`opacity: 0.5`) and cannot be selected, regardless of the group-level `disabled` prop. |\n\n**TableColumn:**\n\nColumn definition for the Table component.\n\nEach column maps a `key` in the row data object to a table column with\na header label, optional sorting, alignment, width, and custom rendering.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| key | `string` | Property key in the row data object. Used to extract cell values via `row[key]`. Must be unique across all columns in a Table. |\n| header | `string` | Column header text. Rendered in uppercase, `var(--ggui-font-size-xs)`, `var(--ggui-font-weight-semibold)`, `var(--ggui-color-onSurfaceVariant)`, with `letter-spacing: 0.05em`. |\n| width | `number \\| string` | Fixed column width. Numbers are pixels, strings are CSS values (e.g., `'200px'`, `'30%'`). When omitted, the column auto-sizes based on content. |\n| align | `'left' \\| 'center' \\| 'right'` | Horizontal text alignment for both the header and data cells. |\n| sortable | `boolean` | When true, the header cell becomes clickable and shows sort direction indicators (ascending/descending triangles). Clicking toggles between `'asc'` and `'desc'`. The header gets `cursor: pointer`, `tabIndex: 0`, and keyboard support (Enter/Space to toggle). |\n| render | `(value: unknown, row: T, index: number) => ReactNode` | Custom cell renderer. When provided, called instead of rendering `row[key]` directly. Receives the cell value, the full row object, and the row index. |\n\n**TabItem:**\n\nDefinition of a single tab within a Tabs component.\n\nEach item provides a unique `key` for identification, a `label` for the\ntab button, and `content` for the associated panel.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| key | `string` | Unique identifier for this tab. Used to match `activeKey` and as the value passed to `onChange`. |\n| label | `ReactNode` | Tab button label. Can be text or any ReactNode. |\n| content | `ReactNode` | Panel content rendered below the tab bar when this tab is active. |\n| disabled | `boolean` | When true, the tab button shows `opacity: 0.5`, `cursor: not-allowed`, and cannot be selected via click or keyboard navigation. |\n| icon | `ReactNode` | Optional icon rendered before the label inside the tab button, with `var(--ggui-spacing-1)` gap between icon and label. |\n\n**AccordionItem:**\n\nDefinition of a single collapsible section within an Accordion.\n\nEach item provides a unique `key`, a clickable `title` for the header button,\nand `content` revealed when expanded.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| key | `string` | Unique identifier for this item. Used in `expandedKeys` and passed to `onChange`. |\n| title | `ReactNode` | Header label rendered inside the toggle button. Can be text or any ReactNode. |\n| content | `ReactNode` | Panel content rendered below the header when expanded. Styled with `var(--ggui-font-size-sm)`, `var(--ggui-color-onSurfaceVariant)`, `line-height: var(--ggui-font-lineHeight-normal, 1.5)`. Padding: `0 var(--ggui-spacing-4) var(--ggui-spacing-4)`. |\n| disabled | `boolean` | When true, the header button shows `opacity: 0.5`, `cursor: not-allowed`, and cannot be toggled. |\n\n\n## Components\n\nImport: `import { Component } from '@ggui-ai/design'`\n\n### SearchField\n\nA text input with a leading search icon and optional submit button.\n\nComposes: `Input` (native `<input type=\"search\">`), `Button`, `Spinner`, `Icon`.\n\nSupports controlled and uncontrolled usage. When `value` is `undefined` the\ncomponent tracks its own state internally. Pressing **Enter** triggers\n`onSearch` with the current value. When `loading` is `true` the search icon\nis replaced by a `Spinner` and the input is disabled.\n\nTokens used: `colors.gray[300]` border, `colors.gray[50]` disabled bg,\n`colors.gray[400]` icon color, `colors.gray[900]` text color.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| value | `string` | - | Current search value. When provided, the component is **controlled** and the caller must update this via `onChange`. When omitted, the component manages its own internal state. |\n| onChange | `(value: string) => void` | - | Called on every keystroke with the new input string (value directly, not a React `ChangeEvent`). |\n| onSearch | `(value: string) => void` | - | Called when the user presses **Enter** or clicks the search button (if `showButton` is `true`). Receives the current value directly. |\n| placeholder | `string` | `'Search...'` | Placeholder text shown when the input is empty. |\n| showButton | `boolean` | `false` | When `true`, renders a `Button` primitive to the right of the input. The button's label is set by `buttonText`. |\n| buttonText | `string` | `'Search'` | Label rendered inside the submit button. Only visible when `showButton` is `true`. |\n| loading | `boolean` | - | When `true`, replaces the search icon with a `Spinner`, disables the input, and disables the submit button. |\n| disabled | `boolean` | - | When `true`, the input and button are visually disabled and do not respond to interaction. The input background changes to `colors.gray[50]`. |\n| size | `'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls input height and font size. - `'sm'` -- 6px vertical padding, 14px font - `'md'` -- 10px vertical padding, 14px font - `'lg'` -- 12px vertical padding, 16px font  The Button size maps `sm`->`sm`, `md`->`md`, `lg`->`md`. |\n\n**Example:**\n```tsx\n```tsx\n<SearchField\n  value={query}\n  onChange={setQuery}\n  onSearch={(q) => fetchResults(q)}\n  placeholder=\"Search products...\"\n  showButton\n  buttonText=\"Go\"\n  size=\"md\"\n/>\n```\n```\n\n### FormField\n\nA wrapper that adds a label, optional description, error message,\nand helper text around any form input passed as `children`.\n\nComposes: no other primitives -- pure layout with semantic `<label>` and\n`<span>` elements.\n\nVisual hierarchy (top to bottom):\n1. **Label** (required) -- `fontSize.sm`, `fontWeight.medium`, `colors.gray[700]`\n2. **Required indicator** -- red asterisk (`colors.error[500]`) appended to label\n3. **Description** -- `fontSize.xs`, `colors.gray[500]`, 4px bottom margin\n4. **Children** -- the form control itself\n5. **Error / Helper text** -- `fontSize.xs`; error in `colors.error[500]`,\n   helper in `colors.gray[500]`. Error takes priority when both are provided.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| label | `string` | - | Text rendered inside the `<label>` element above the input. |\n| children | `ReactNode` | - | The form control (typically an `Input`, `Select`, or `Textarea` primitive) rendered between the label/description and the error/helper row. |\n| error | `string` | - | Error message displayed below `children` in `colors.error[500]`. When present, it takes precedence over `helperText`. |\n| helperText | `string` | - | Neutral guidance text displayed below `children` in `colors.gray[500]`. Hidden when `error` is present. |\n| required | `boolean` | - | When `true`, appends a red asterisk (`*`) after the label text. Does **not** add any HTML validation attributes -- handle that on the child input. |\n| description | `string` | - | Secondary description rendered between the label and the child control in `fontSize.xs` / `colors.gray[500]`. Use for longer guidance that does not belong in `helperText`. |\n\n**Example:**\n```tsx\n```tsx\n<FormField\n  label=\"Email address\"\n  required\n  description=\"We will never share your email.\"\n  error={errors.email}\n>\n  <Input value={email} onChange={setEmail} placeholder=\"you@example.com\" />\n</FormField>\n```\n```\n\n### MenuItem\n\nA full-width clickable row for menus, sidebars, and action lists.\n\nComposes: none -- renders a native `<button>` element.\n\nBuilt-in transition: `background-color 0.15s` on hover.\n\nColor logic:\n- **Normal**: text `colors.gray[700]`, hover bg `colors.gray[100]`\n- **Active**: bg `colors.primary[50]`, text `colors.gray[700]`, `fontWeight.medium`\n- **Danger**: text `colors.error[600]`, hover bg `colors.error[50]`, active bg `colors.error[100]`\n- **Disabled**: text `colors.gray[400]`, `cursor: not-allowed`\n\nLayout: flexbox row with `8px` gap, `8px 12px` padding, `radius.md` border-radius.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| label | `string` | - | Primary text content of the menu item. |\n| icon | `ReactNode` | - | Icon or element rendered to the left of the label. Flex-shrink 0. |\n| rightElement | `ReactNode` | - | Element rendered to the right of the label (e.g., a keyboard shortcut badge or a count). Colored `colors.gray[400]`, flex-shrink 0. |\n| onClick | `() => void` | - | Called when the item is clicked. Suppressed when `disabled` is `true`. |\n| disabled | `boolean` | - | When `true`, the item is non-interactive: `colors.gray[400]` text, `cursor: not-allowed`, click handler suppressed. |\n| active | `boolean` | - | Marks this item as the current selection. Applies a tinted background (`colors.primary[50]`, or `colors.error[100]` when `danger` is also set) and `fontWeight.medium`. |\n| danger | `boolean` | - | Switches the item to destructive styling: `colors.error[600]` text, `colors.error[50]` hover background. |\n\n**Example:**\n```tsx\n```tsx\n<MenuItem\n  label=\"Delete project\"\n  icon={<Icon name=\"trash\" size={16} />}\n  danger\n  onClick={() => confirmDelete(projectId)}\n/>\n```\n```\n\n### Tag\n\nAn inline label for categories, filters, statuses, or selections.\nOptionally dismissable via a close button.\n\nComposes: none -- pure `<span>` with an optional close `<button>`.\n\nEach `variant` maps to a background / text / border color triple from the\ndesign tokens:\n- `'default'`  -- `gray[100]` / `gray[700]` / `gray[200]`\n- `'primary'`  -- `primary[50]` / `primary[700]` / `primary[200]`\n- `'success'`  -- `success[50]` / `success[700]` / `success[200]`\n- `'warning'`  -- `warning[50]` / `warning[700]` / `warning[200]`\n- `'error'`    -- `error[50]` / `error[700]` / `error[200]`\n- `'info'`     -- `info[50]` / `info[700]` / `info[200]`\n\nThe close button renders an inline SVG \"x\" icon (12x12) with `opacity: 0.7`\nand an `aria-label=\"Remove\"`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | Tag content -- typically a short text string. |\n| variant | `'default' \\| 'primary' \\| 'success' \\| 'warning' \\| 'error' \\| 'info'` | `'default'` | Semantic color variant applied to background, text, and border. |\n| size | `'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls padding, font size, and internal gap. - `'sm'` -- 2px/6px padding, `fontSize.xs`, 4px gap - `'md'` -- 4px/8px padding, `fontSize.xs`, 6px gap - `'lg'` -- 6px/10px padding, `fontSize.sm`, 6px gap |\n| closable | `boolean` | - | When `true`, renders a small close (\"x\") button after the content. Clicking it fires `onClose`. |\n| onClose | `() => void` | - | Called when the close button is clicked. Only relevant when `closable` is `true`. |\n| icon | `ReactNode` | - | Icon or element rendered before the text content. |\n\n**Example:**\n```tsx\n```tsx\n<Tag variant=\"success\" size=\"md\" closable onClose={() => removeFilter(id)}>\n  Active\n</Tag>\n```\n```\n\n### Dropdown\n\nA click-triggered menu anchored to a trigger element. Manages its own\nopen/close state internally.\n\nComposes: `MenuItem` for each option.\n\nBehavior:\n- Clicking the trigger toggles the menu open/closed.\n- Selecting an option calls `onChange(option.value)` and closes the menu.\n- Clicking outside the container or pressing **Escape** closes the menu.\n- The currently selected option (matching `value`) is rendered with\n  `MenuItem`'s `active` state.\n\nMenu panel: `colors.white` bg, `colors.gray[200]` border, `radius.lg`\nborder-radius, `shadow.lg`, `zIndex.dropdown`, 160px min-width, 4px padding.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| trigger | `ReactNode` | - | The element the user clicks to open the menu. Receives a wrapping `<div>` with `cursor: pointer` (or `not-allowed` when disabled). |\n| options | `DropdownOption[]` | - | Array of selectable options rendered as `MenuItem` rows. |\n| value | `string` | - | The `value` of the currently selected option. The matching `MenuItem` is rendered with `active` styling. |\n| onChange | `(value: string) => void` | - | Called with the `value` string of the selected option (not the full `DropdownOption` object). The menu closes immediately after. |\n| placement | `'bottom-start' \\| 'bottom-end' \\| 'top-start' \\| 'top-end'` | `'bottom-start'` | Where to anchor the menu panel relative to the trigger. - `'bottom-start'` -- below, aligned to left edge - `'bottom-end'`   -- below, aligned to right edge - `'top-start'`    -- above, aligned to left edge - `'top-end'`      -- above, aligned to right edge |\n| disabled | `boolean` | - | When `true`, the trigger shows `cursor: not-allowed` and clicking it does not open the menu. |\n\n**Example:**\n```tsx\n```tsx\n<Dropdown\n  trigger={<Button variant=\"outline\">Sort by</Button>}\n  options={[\n    { value: 'name', label: 'Name' },\n    { value: 'date', label: 'Date created' },\n    { value: 'delete', label: 'Delete', danger: true },\n  ]}\n  value={sortBy}\n  onChange={setSortBy}\n  placement=\"bottom-end\"\n/>\n```\n```\n\n### Autocomplete\n\nA text input with a filterable suggestion dropdown, keyboard navigation,\nand loading/empty states.\n\nComposes: `Input` primitive (with `label`, `error`, `placeholder` forwarded),\n`Spinner` (loading state).\n\nFiltering: options are filtered client-side by case-insensitive substring\nmatch against both `option.label` and `option.value`.\n\nKeyboard support:\n- **ArrowDown / ArrowUp** -- move highlight through filtered options\n  (opens dropdown if closed)\n- **Enter** -- selects the highlighted option\n- **Escape** -- closes the dropdown\n\nOn selection, `onChange` is called with `option.label` (the display text)\nand `onSelect` is called with the full `AutocompleteOption` object.\n\nDropdown panel: `colors.white` bg, `colors.gray[200]` border, `radius.lg`\nborder-radius, `shadow.lg`, `zIndex.dropdown`, max-height 240px with\noverflow scroll.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| value | `string` | `''` | Current text in the input field. On selection, this is set to the selected option's `label`. |\n| onChange | `(value: string) => void` | - | Called on every keystroke with the new input string (value directly, not a React event). Also called on selection with `option.label`. |\n| onSelect | `(option: AutocompleteOption) => void` | - | Called when the user selects an option (click or Enter on highlighted item). Receives the full `AutocompleteOption` object, not just the value string. |\n| options | `AutocompleteOption[]` | - | The full list of available options. Filtering is handled internally via case-insensitive substring match on `label` and `value`. |\n| placeholder | `string` | - | Placeholder text forwarded to the inner `Input` primitive. |\n| label | `string` | - | Label text forwarded to the inner `Input` primitive. |\n| loading | `boolean` | - | When `true`, the dropdown shows a centered `Spinner` instead of the option list. The input remains interactive. |\n| disabled | `boolean` | - | When `true`, the inner `Input` is disabled and the dropdown does not open. |\n| error | `string` | - | Error message forwarded to the inner `Input` primitive. |\n| noResultsText | `string` | `'No results found'` | Text shown in the dropdown when filtering produces zero matches. Rendered centered in `colors.gray[500]` / `fontSize.sm`. |\n\n**Example:**\n```tsx\n```tsx\n<Autocomplete\n  label=\"Country\"\n  value={country}\n  onChange={setCountry}\n  onSelect={(opt) => setCountryCode(opt.value)}\n  options={countries}\n  placeholder=\"Type to search...\"\n  noResultsText=\"No countries found\"\n/>\n```\n```\n\n### Breadcrumb\n\nA horizontal navigation trail showing the user's location within a\nhierarchy. Renders a `<nav aria-label=\"Breadcrumb\">`.\n\nComposes: `Link` primitive (for items with `href`).\n\nRendering rules per item:\n- **Last item**: static `<span>` with `colors.gray[900]`, `fontWeight: 500`,\n  and `aria-current=\"page\"`.\n- **Non-last with `href`**: `Link` in `colors.gray[500]` with\n  `underline=\"hover\"`. If `onItemClick` is provided, `e.preventDefault()`\n  is called and the handler fires instead of navigating.\n- **Non-last without `href`**: unstyled `<button>` in `colors.gray[500]`.\n\nLayout: flexbox row, `8px` gap, `fontSize.sm`.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| items | `BreadcrumbItem[]` | - | Ordered array of breadcrumb segments from root to current page. |\n| separator | `ReactNode` | `'/'` | Separator rendered between each pair of items. Can be a string (e.g., `\"/\"`, `\">\"`) or a ReactNode (e.g., an `Icon`). Rendered in `colors.gray[400]`. |\n| onItemClick | `(item: BreadcrumbItem, index: number) => void` | - | Called when a non-last item is clicked. Receives the `BreadcrumbItem` and its zero-based `index`. When provided on items that have `href`, the default navigation is prevented via `e.preventDefault()`. |\n\n**Example:**\n```tsx\n```tsx\n<Breadcrumb\n  items={[\n    { label: 'Home', href: '/' },\n    { label: 'Projects', href: '/projects' },\n    { label: 'ggui' },\n  ]}\n  separator=\"/\"\n  onItemClick={(item) => router.push(item.href!)}\n/>\n```\n```\n\n### Pagination\n\nPage navigation controls with previous/next arrows, numbered page buttons,\nand optional first/last jumps. Renders a `<nav aria-label=\"Pagination\">`.\n\nComposes: `Button` (ghost variant for prev/next/first/last arrows),\n`Icon` (`chevron-left`, `chevron-right`).\n\nBuilt-in transition: `all 0.15s` on page number buttons.\n\nPage windowing: when `totalPages > maxVisible`, the component shows the\nfirst page, last page, a window of pages around `currentPage`, and\nellipsis (\"...\") markers for gaps. The window adjusts when near the\nstart or end of the range.\n\nActive page button: `colors.primary[600]` bg, `colors.white` text,\n`fontWeight.medium`. Inactive: transparent bg, `colors.gray[700]` text.\n\nArrow buttons are automatically disabled at boundary pages (first/last).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| currentPage | `number` | - | Current active page. **1-indexed** (first page is `1`). |\n| totalPages | `number` | - | Total number of pages. Determines when last-page / next-page buttons disable. |\n| onPageChange | `(page: number) => void` | - | Called when the user clicks a page number, arrow, or first/last button. Receives the target page number (1-indexed) directly. |\n| showFirstLast | `boolean` | `true` | When `true`, renders double-chevron buttons for jumping to the first and last page. These buttons are disabled when already on the respective boundary. |\n| maxVisible | `number` | `5` | Maximum number of page buttons visible at once (including the first and last page, but excluding ellipsis markers). When `totalPages` exceeds this value, ellipsis gaps appear. |\n| size | `'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls button dimensions and icon sizes. - `'sm'` -- 28px buttons, 14px icons, Button size `xs` - `'md'` -- 32px buttons, 16px icons, Button size `sm` - `'lg'` -- 40px buttons, 20px icons, Button size `md` |\n| disabled | `boolean` | - | When `true`, all page buttons and arrows are visually dimmed (`opacity: 0.5`) and clicks are suppressed. |\n\n**Example:**\n```tsx\n```tsx\n<Pagination\n  currentPage={page}\n  totalPages={20}\n  onPageChange={setPage}\n  maxVisible={7}\n  size=\"md\"\n/>\n```\n```\n\n### EmptyState\n\nEmptyState -- placeholder for a region with no data: empty lists,\nzero search results, an error fallback. Render it instead of\nnothing whenever a data array could be empty \u2014 a list that shows\nnothing when empty looks broken.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| icon | `string \\| ReactNode` | - | A Lucide icon name (kebab-case), rendered large and subtle above the title, or a custom node. Omit for a text-only empty state. |\n| title | `string` | - | The headline, e.g. \"No results found\". |\n| description | `string` | - | Optional supporting line below the title. |\n| action | `ReactNode` | - | Optional call-to-action, typically a `<Button>`. |\n\n**Example:**\n```tsx\n{results.length === 0\n  ? <EmptyState icon=\"search-x\" title=\"No matches\" description=\"Try a broader query.\" />\n  : results.map((r) => <Row key={r.id}>\u2026</Row>)}\n```\n\n### Stat\n\nStat -- a single KPI / metric: a label, a large value, an optional\ntrend-coloured delta and icon. Reach for it whenever the UI is\n\"show a number\" \u2014 dashboards, weather and price cards, analytics\ntiles. Drop several into a `<Grid>` for a stat grid.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| label | `string` | - | The metric name, e.g. \"Revenue\". Rendered small and uppercase above the value. |\n| value | `string \\| number` | - | The headline value \u2014 the big number. A number, or a pre-formatted string (`\"$48.2k\"`, `\"18\xB0C\"`). |\n| delta | `string` | - | Optional change indicator, pre-formatted, e.g. `\"+12.5%\"` or `\"-3\"`. |\n| trend | `'up' \\| 'down' \\| 'neutral'` | `'neutral'` | Direction of `delta` \u2014 colours it: `'up'` success, `'down'` error, `'neutral'` muted. |\n| icon | `string \\| ReactNode` | - | Optional Lucide icon name (kebab-case) or custom node, shown next to the label. |\n\n**Example:**\n```tsx\n<Stat label=\"Revenue\" value=\"$48.2k\" delta=\"+12.5%\" trend=\"up\" icon=\"trending-up\" />\n```\n\n### Support Types\n\n**DropdownOption:**\n\nA single option inside a `Dropdown`. Each option maps to one `MenuItem`\ninternally.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| value | `string` | Unique identifier returned to `onChange` when this option is selected. |\n| label | `string` | Human-readable text shown in the menu row. |\n| icon | `ReactNode` | Optional icon rendered to the left of the label via `MenuItem.icon`. |\n| disabled | `boolean` | When `true`, the option is visible but non-interactive. |\n| danger | `boolean` | When `true`, the option uses destructive (red) styling via `MenuItem.danger`. |\n\n**AutocompleteOption:**\n\nA single option in the `Autocomplete` suggestion list.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| value | `string` | Unique identifier for this option. Also used for case-insensitive filtering against the input value. |\n| label | `string` | Primary display text. Also used for case-insensitive filtering and is written into the input on selection. |\n| description | `string` | Secondary description rendered below the label in `fontSize.xs` / `colors.gray[500]`. |\n| icon | `ReactNode` | Icon rendered to the left of the label/description block. Flex-shrink 0. |\n| disabled | `boolean` | When `true`, the option is visible but non-interactive (`cursor: not-allowed`, `colors.gray[400]` text). |\n\n**BreadcrumbItem:**\n\nA single segment in a `Breadcrumb` trail. Items with `href` render as\n`Link` primitives; items without render as plain `<button>` elements.\nThe last item in the array is always rendered as static text with\n`aria-current=\"page\"`.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| label | `string` | Display text for this breadcrumb segment. |\n| href | `string` | URL for this segment. When provided (and this is not the last item), the segment renders as a `Link` primitive with `underline=\"hover\"`. When omitted, it renders as a `<button>`. |\n| icon | `ReactNode` | Icon rendered immediately before the label. Its color follows the segment's text color: `colors.gray[500]` for navigable items, `colors.gray[900]` for the current (last) item. |\n\n\n## Compositions\n\nImport: `import { Component } from '@ggui-ai/design'`\n\n### Header\n\nProps for the `Header` composition.\n\nA horizontal page header that arranges a logo, navigation, and action slots\nin a flex row (`justify-content: space-between`). Internally renders a `<header>` element;\ndoes not compose other ggui primitives.\n\nWhen `sticky` is true the header gets `position: sticky; top: 0` with `zIndex.sticky`\nand a `shadow.sm` box-shadow.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| logo | `ReactNode` | - | Logo or brand element rendered at the start (flex-shrink: 0). |\n| navigation | `ReactNode` | - | Navigation content rendered in a `<nav>` element with `flex: 1` and a 32 px left margin. |\n| actions | `ReactNode` | - | Right-side action elements (buttons, avatar, etc.) rendered with a 12 px gap. |\n| sticky | `boolean` | `false` | When true, the header becomes `position: sticky` at the top of its scroll container with `zIndex.sticky` and `shadow.sm`. |\n| background | `string` | `colors.white` | Background color of the header. |\n| bordered | `boolean` | `true` | When true, renders a 1 px bottom border in `colors.gray[200]`. |\n\n**Example:**\n```tsx\n```tsx\n<Header\n  logo={<img src=\"/logo.svg\" alt=\"Acme\" />}\n  navigation={<a href=\"/docs\">Docs</a>}\n  actions={<Button size=\"sm\">Sign In</Button>}\n  sticky\n  bordered\n/>\n```\n```\n\n### Sidebar\n\nProps for the `Sidebar` composition.\n\nA vertical navigation panel that composes the `Icon` primitive for chevron indicators.\nItems are rendered as `<button>` elements inside a scrollable `<nav>`. Nested items\nare indented 16 px per depth level. The sidebar animates width changes with a 200 ms\nCSS transition. Active items are highlighted with `colors.primary[50]` background\nand `colors.primary[700]` text.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| items | `SidebarItem[]` | - | Array of navigation items to render. |\n| activeId | `string` | - | ID of the currently active item. Matched items get a highlighted background and bold text. |\n| onItemClick | `(item: SidebarItem) => void` | - | Called when any item (including parent items with children) is clicked. |\n| collapsed | `boolean` | `false` | When true, hides labels and badges; only icons remain visible, centered in the collapsed width. Nested children are hidden entirely. |\n| header | `ReactNode` | - | Content rendered above the item list, separated by a bottom border. |\n| footer | `ReactNode` | - | Content rendered below the item list, separated by a top border. |\n| width | `number` | `256` | Width in pixels when expanded. |\n| collapsedWidth | `number` | `64` | Width in pixels when collapsed. |\n\n**Example:**\n```tsx\n```tsx\n<Sidebar\n  items={[\n    { id: 'home', label: 'Home', icon: <Icon name=\"home\" /> },\n    { id: 'settings', label: 'Settings', icon: <Icon name=\"settings\" />,\n      children: [\n        { id: 'profile', label: 'Profile' },\n        { id: 'billing', label: 'Billing' },\n      ]},\n  ]}\n  activeId=\"home\"\n  onItemClick={(item) => navigate(item.href)}\n  collapsed={false}\n  width={256}\n/>\n```\n```\n\n### CardGrid\n\nProps for the `CardGrid` composition.\n\nA CSS Grid wrapper that arranges children in equal-width columns. When `columns`\nis a number, it produces `repeat(N, 1fr)`. When it is a responsive object,\nit falls back to `repeat(auto-fit, minmax(280px, 1fr))` for fluid responsive behavior.\n\nDoes not compose any ggui primitives internally \u2014 it is a pure layout container.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| children | `ReactNode` | - | Card elements to arrange in the grid. |\n| columns | `number \\| { sm?: number; md?: number; lg?: number }` | `3` | Number of columns, or a responsive breakpoint map.  - `number` \u2014 fixed column count via `repeat(N, 1fr)`. - `{ sm?, md?, lg? }` \u2014 triggers `repeat(auto-fit, minmax(280px, 1fr))` for fluid layout. |\n| gap | `number` | `16` | Gap between grid items in pixels. |\n\n**Example:**\n```tsx\n```tsx\n<CardGrid columns={3} gap={24}>\n  <Card>A</Card>\n  <Card>B</Card>\n  <Card>C</Card>\n</CardGrid>\n```\n```\n\n### CommentThread\n\nProps for the `CommentThread` composition.\n\nA threaded comment section that composes `Avatar`, `Button`, `TextArea`, and `Spinner`\nprimitives. Comments are rendered recursively with 40 px indentation per nesting level.\nEach comment shows author avatar, name, timestamp, content, reactions, and a \"Reply\" toggle.\nWhen `currentUser` is provided, a new-comment input with avatar and submit button is shown\nabove the thread.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| comments | `Comment[]` | - | Array of top-level comments to render. Replies are nested within each comment. |\n| currentUser | `{     /** Display name for the current user's avatar. */     name: string;     /** Avatar image URL for the current user. */     avatar?: string;   }` | - | Current user info. When provided, a new-comment input area is rendered above the thread. |\n| onAddComment | `(content: string, parentId?: string) => void` | - | Called when the user submits a new top-level comment. |\n| onReply | `(commentId: string, content: string) => void` | - | Called when the user submits a reply to an existing comment. |\n| onReaction | `(commentId: string, emoji: string) => void` | - | Called when the user clicks an emoji reaction on a comment. |\n| loading | `boolean` | - | When true, shows a centered `Spinner` instead of the comment list. |\n\n**Example:**\n```tsx\n```tsx\n<CommentThread\n  comments={[\n    { id: '1', author: { name: 'Alice' }, content: 'Great work!', timestamp: new Date(),\n      replies: [{ id: '2', author: { name: 'Bob' }, content: 'Thanks!', timestamp: new Date() }] }\n  ]}\n  currentUser={{ name: 'Alice', avatar: '/alice.jpg' }}\n  onAddComment={(content) => post(content)}\n  onReply={(commentId, content) => reply(commentId, content)}\n  onReaction={(commentId, emoji) => react(commentId, emoji)}\n/>\n```\n```\n\n### DataTable\n\nProps for the `DataTable` composition.\n\nA sortable, selectable data table that composes `Checkbox`, `Spinner`, and `Icon`\nprimitives. Renders a `<table>` inside a bordered container with 8 px border-radius.\nThe header row has a `colors.gray[50]` background. Sortable columns show a chevron\nicon on click (toggles asc/desc). Selected rows are highlighted with `colors.primary[50]`.\nRow background transitions use a 150 ms ease. The \"select all\" checkbox supports an\nindeterminate state when a subset of rows is selected.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| columns | `DataTableColumn<T>[]` | - | Column definitions that control header, alignment, sorting, and rendering. |\n| data | `T[]` | - | Row data array. Each entry corresponds to one table row. |\n| rowKey | `string \\| ((row: T) => string)` | `'id'` | Property name or function used to derive a unique key for each row. |\n| loading | `boolean` | - | When true, shows a centered `Spinner` instead of table body rows. |\n| emptyText | `string` | `'No data'` | Text shown when `data` is empty and not loading. |\n| onSort | `(key: string, direction: 'asc' \\| 'desc') => void` | - | Called when a sortable column header is clicked. Toggles direction automatically (asc -> desc) if the same column is clicked again. |\n| sortKey | `string` | - | The column key currently being sorted. |\n| sortDirection | `'asc' \\| 'desc'` | - | The current sort direction. |\n| onRowClick | `(row: T, index: number) => void` | - | Called when a row is clicked. Rows get `cursor: pointer` when this handler is provided. |\n| selectable | `boolean` | - | When true, adds a checkbox column at the start of each row. |\n| selectedKeys | `string[]` | `[]` | Array of currently selected row keys. |\n| onSelectionChange | `(keys: string[]) => void` | - | Called when the set of selected row keys changes (via row checkbox or select-all). |\n\n**Example:**\n```tsx\n```tsx\n<DataTable\n  columns={[\n    { key: 'name', header: 'Name', sortable: true },\n    { key: 'email', header: 'Email' },\n    { key: 'role', header: 'Role', render: (v) => <Badge>{v}</Badge> },\n  ]}\n  data={users}\n  rowKey=\"id\"\n  selectable\n  selectedKeys={selected}\n  onSelectionChange={setSelected}\n  onSort={(key, dir) => sort(key, dir)}\n  sortKey=\"name\"\n  sortDirection=\"asc\"\n/>\n```\n```\n\n### ChatWindow\n\nProps for the `ChatWindow` composition.\n\nA messaging interface that composes `Avatar`, `Button`, `Spinner`, and `Icon` primitives.\nLayout is a flex column filling 100% height with a bordered `radius.lg` container.\nMessages from the current user align right with `colors.primary[600]` bubbles and white text.\nOther users' messages align left with `colors.gray[100]` bubbles. The message area\nauto-scrolls to the bottom on new messages via `scrollIntoView({ behavior: 'smooth' })`.\nThe text input sends on Enter (Shift+Enter for newline).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| messages | `ChatMessage[]` | - | Array of chat messages to display in chronological order. |\n| currentUserId | `string` | - | ID of the current user. Messages from this user render right-aligned with a primary color bubble. |\n| onSendMessage | `(content: string) => void` | - | Called when the user submits a message (Enter key or send button). |\n| loading | `boolean` | - | When true, shows a centered `Spinner` instead of the message list. |\n| typing | `{ name: string } \\| null` | - | When non-null, displays a typing indicator below the last message (e.g., \"Alice is typing...\"). |\n| placeholder | `string` | `'Type a message...'` | Placeholder text for the message input field. |\n| header | `ReactNode` | - | Optional header content rendered above the message area, separated by a bottom border. |\n\n**Example:**\n```tsx\n```tsx\n<ChatWindow\n  messages={messages}\n  currentUserId=\"user-1\"\n  onSendMessage={(content) => send(content)}\n  typing={{ name: 'Alice' }}\n  placeholder=\"Type a message...\"\n  header={<h3>Chat with Alice</h3>}\n/>\n```\n```\n\n### NavigationBar\n\nProps for the `NavigationBar` composition.\n\nA horizontal or vertical navigation menu. Does not compose other ggui primitives\n(uses plain `<button>` and `<a>` elements). Active items are styled per variant:\n\n- `'default'` \u2014 active item gets `colors.primary[600]` text and medium font weight.\n- `'pills'` \u2014 active item gets a `radius.full` pill with `colors.primary[100]` background.\n- `'underline'` \u2014 active item gets a 2 px bottom border in `colors.primary[600]`.\n  When horizontal, the entire nav also has a 1 px bottom border.\n\nAll items have a 150 ms transition on all properties.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| items | `NavItem[]` | - | Array of navigation items to render. |\n| activeId | `string` | - | ID of the currently active item. Controls visual highlighting per variant style. |\n| onItemClick | `(item: NavItem) => void` | - | Called when a non-disabled item is clicked. For `<a>` elements, `preventDefault` is called first. |\n| orientation | `'horizontal' \\| 'vertical'` | `'horizontal'` | Layout direction. - `'horizontal'` \u2014 flex-row with 4 px gap. - `'vertical'` \u2014 flex-column with 2 px gap. |\n| variant | `'default' \\| 'pills' \\| 'underline'` | `'default'` | Visual style for active/inactive items. - `'default'` \u2014 text color change only. - `'pills'` \u2014 rounded pill background on active items. - `'underline'` \u2014 bottom border on active items. |\n\n**Example:**\n```tsx\n```tsx\n<NavigationBar\n  items={[\n    { id: 'home', label: 'Home', icon: <Icon name=\"home\" /> },\n    { id: 'about', label: 'About' },\n    { id: 'contact', label: 'Contact' },\n  ]}\n  activeId=\"home\"\n  onItemClick={(item) => navigate(item.id)}\n  orientation=\"horizontal\"\n  variant=\"pills\"\n/>\n```\n```\n\n### FileUploader\n\nProps for the `FileUploader` composition.\n\nA drag-and-drop file upload area that composes `Button`, `Progress`, and `Icon` primitives.\nThe drop zone is a dashed-border container that highlights in `colors.primary[400]`/`colors.primary[50]`\non drag-over. Below the drop zone, each file in `files` is listed with its name, size,\noptional progress bar (for uploading status), and a remove button.\n\nFile validation (max size, max count) is applied client-side before calling `onFilesSelected`.\nFiles exceeding `maxSize` are silently filtered out; files exceeding `maxFiles` are truncated.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| files | `UploadedFile[]` | `[]` | Array of files currently in the upload queue, shown below the drop zone. |\n| onFilesSelected | `(files: File[]) => void` | - | Called when the user selects files via click or drag-and-drop. Receives native `File` objects after client-side filtering (maxSize, maxFiles). |\n| onFileRemove | `(fileId: string) => void` | - | Called when the user clicks the remove button on a file entry. |\n| accept | `string` | - | Accepted file types passed to the hidden `<input type=\"file\" accept=\"...\">`. E.g., `'image/*,.pdf'`. |\n| multiple | `boolean` | `true` | When true, allows selecting multiple files at once. |\n| maxSize | `number` | - | Maximum file size in bytes. Files exceeding this are silently excluded from the selection. |\n| maxFiles | `number` | - | Maximum number of files. Excess files beyond `maxFiles - files.length` are truncated. |\n| disabled | `boolean` | - | When true, the drop zone is visually dimmed (opacity 0.5) and non-interactive. |\n| dragDrop | `boolean` | `true` | When true, enables drag-and-drop on the drop zone. When false, the prompt text changes to \"Click to browse files\". |\n\n**Example:**\n```tsx\n```tsx\n<FileUploader\n  files={uploadedFiles}\n  onFilesSelected={(files) => startUpload(files)}\n  onFileRemove={(id) => removeFile(id)}\n  accept=\"image/*,.pdf\"\n  multiple\n  maxSize={5 * 1024 * 1024}\n  maxFiles={10}\n  dragDrop\n/>\n```\n```\n\n### UserProfileCard\n\nProps for the `UserProfileCard` composition.\n\nA profile display card that composes `Avatar` and `Card` primitives.\nHas two layout modes:\n\n- **Default** \u2014 full card with optional cover image (120 px tall, `background-size: cover`),\n  an XL avatar overlapping the cover by -40 px, centered name, subtitle, bio, stats row\n  (separated by a top border), and action buttons.\n- **Compact** (`compact: true`) \u2014 horizontal layout with a MD avatar, name, subtitle,\n  and inline actions. No cover image, bio, or stats.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| name | `string` | - | User's display name. Rendered as semibold text (lg size in default, sm in compact). |\n| subtitle | `string` | - | Secondary text below the name (e.g., email, job title). |\n| avatar | `string` | - | Avatar image URL passed to the `Avatar` primitive. Falls back to initials if omitted. |\n| coverImage | `string` | - | Cover image URL rendered as a 120 px tall background banner above the avatar. Ignored in compact mode. |\n| bio | `string` | - | Bio or description paragraph shown below the subtitle. Ignored in compact mode. |\n| stats | `{ label: string; value: string \\| number }[]` | - | Key-value stat pairs (e.g., followers, posts) shown in a horizontal row below the bio. Ignored in compact mode. |\n| actions | `ReactNode` | - | Action elements (buttons, links) rendered at the bottom (centered in default, inline in compact). |\n| compact | `boolean` | `false` | When true, renders a horizontal compact layout (avatar + name inline) without cover image, bio, or stats. |\n\n**Example:**\n```tsx\n```tsx\n<UserProfileCard\n  name=\"Jane Doe\"\n  subtitle=\"Product Designer\"\n  avatar=\"/jane.jpg\"\n  coverImage=\"/cover.jpg\"\n  bio=\"Designing interfaces that delight users.\"\n  stats={[\n    { label: 'Followers', value: '1.2k' },\n    { label: 'Posts', value: 48 },\n  ]}\n  actions={<Button>Follow</Button>}\n/>\n```\n```\n\n### NotificationCenter\n\nProps for the `NotificationCenter` composition.\n\nA notification list with a header bar that composes `Button`, `Spinner`, and `Icon`\nprimitives. The header shows a \"Notifications\" title, an unread count badge\n(pill in `colors.primary[100]`), and \"Mark all read\" / \"Clear all\" buttons.\nEach notification item shows a colored status dot, title, message, timestamp,\n\"Mark as read\" link, and optional action. The list is scrollable (`overflowY: auto`).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| notifications | `Notification[]` | - | Array of notifications to display, in the order provided. |\n| onMarkAsRead | `(id: string) => void` | - | Called when the user clicks \"Mark as read\" on an individual notification. |\n| onMarkAllAsRead | `() => void` | - | Called when the user clicks the \"Mark all read\" header button. Only shown when there are unread items. |\n| onDismiss | `(id: string) => void` | - | Called when the user clicks the dismiss (X) button on an individual notification. |\n| onClearAll | `() => void` | - | Called when the user clicks the \"Clear all\" header button. Only shown when there are any notifications. |\n| emptyText | `string` | `'No notifications'` | Text shown when `notifications` is empty and not loading. |\n| loading | `boolean` | - | When true, shows a centered `Spinner` instead of the notification list. |\n\n**Example:**\n```tsx\n```tsx\n<NotificationCenter\n  notifications={[\n    { id: '1', title: 'Deployment complete', type: 'success', timestamp: new Date(), read: false },\n    { id: '2', title: 'Build failed', type: 'error', message: 'Lint errors', timestamp: new Date() },\n  ]}\n  onMarkAsRead={(id) => markRead(id)}\n  onMarkAllAsRead={() => markAllRead()}\n  onDismiss={(id) => dismiss(id)}\n  onClearAll={() => clearAll()}\n/>\n```\n```\n\n### Modal\n\nProps for the `Modal` composition.\n\nA dialog overlay that composes `Button`, `Icon`, and `Heading` primitives.\nThe overlay uses `animation.fadeIn` (`ggui-fadeIn`) and the dialog panel uses\n`animation.scaleIn` (`ggui-scaleIn`) \u2014 both GPU-composited (opacity + transform).\nWhen open, `document.body.style.overflow` is set to `'hidden'` to prevent background\nscrolling, and restored on close. The dialog has `role=\"dialog\"` and `aria-modal=\"true\"`.\n\nSize widths: `sm` = 400 px, `md` = 500 px, `lg` = 640 px, `xl` = 800 px,\n`full` = 100vw (no border-radius, no padding).\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| open | `boolean` | - | Controls modal visibility. When false, the component renders nothing. |\n| onClose | `() => void` | - | Called to close the modal (overlay click, escape key, or close button). |\n| title | `string` | - | Optional title rendered in the modal header via the `Heading` primitive (level 4). |\n| children | `ReactNode` | - | Modal body content rendered in a scrollable area (`overflowY: auto`). |\n| footer | `ReactNode` | - | Footer content rendered below the body, right-aligned with an 8 px gap, separated by a top border. |\n| size | `'sm' \\| 'md' \\| 'lg' \\| 'xl' \\| 'full'` | `'md'` | Controls the width of the modal panel. - `'sm'` \u2014 400 px - `'md'` \u2014 500 px - `'lg'` \u2014 640 px - `'xl'` \u2014 800 px - `'full'` \u2014 100vw, no border-radius, stretches to fill viewport |\n| closeOnOverlayClick | `boolean` | `true` | When true, clicking the semi-transparent overlay behind the modal calls `onClose`. |\n| closeOnEscape | `boolean` | `true` | When true, pressing the Escape key calls `onClose`. |\n| showCloseButton | `boolean` | `true` | When true, renders a ghost close button (X icon) in the modal header. |\n\n**Example:**\n```tsx\n```tsx\n<Modal\n  open={isOpen}\n  onClose={() => setOpen(false)}\n  title=\"Confirm Action\"\n  size=\"md\"\n  footer={\n    <>\n      <Button variant=\"ghost\" onClick={() => setOpen(false)}>Cancel</Button>\n      <Button onClick={handleConfirm}>Confirm</Button>\n    </>\n  }\n>\n  <p>Are you sure you want to proceed?</p>\n</Modal>\n```\n```\n\n### CommandPalette\n\nProps for the `CommandPalette` composition.\n\nA searchable command menu (Cmd+K / Ctrl+K pattern) that composes `Spinner` and `Icon`\nprimitives. Appears as a centered overlay at 15vh from the top. Commands are filtered\nby label and description (case-insensitive substring match). Results are grouped under\nuppercase section headers. Keyboard navigation is fully supported:\nArrow Up/Down to navigate, Enter to select, Escape to close.\n\nWhen `recentIds` are provided and the search query is empty, matching commands appear\nin a \"Recent\" section at the top (deduplicated from their original groups).\n\nThe footer shows navigation hints: \"Up/Down Navigate\", \"Enter Select\", \"Esc Close\".\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| open | `boolean` | - | Controls palette visibility. When false, the component renders nothing. |\n| onClose | `() => void` | - | Called to close the palette (overlay click, Escape key, or after command selection). |\n| commands | `Command[]` | - | Full array of available commands. Filtered client-side by the search query. |\n| onSelect | `(command: Command) => void` | - | Called when a non-disabled command is selected (Enter key or click). The palette auto-closes after selection. |\n| placeholder | `string` | `'Search commands...'` | Placeholder text for the search input. |\n| recentIds | `string[]` | `[]` | IDs of recently used commands. When the query is empty, these appear in a \"Recent\" section at the top of the results. |\n| loading | `boolean` | - | When true, shows a centered `Spinner` instead of the command list. |\n\n**Example:**\n```tsx\n```tsx\n<CommandPalette\n  open={isOpen}\n  onClose={() => setOpen(false)}\n  commands={[\n    { id: 'new', label: 'New File', shortcut: 'Ctrl+N', group: 'File' },\n    { id: 'save', label: 'Save', shortcut: 'Ctrl+S', group: 'File' },\n    { id: 'theme', label: 'Toggle Theme', group: 'Preferences' },\n  ]}\n  onSelect={(cmd) => executeCommand(cmd.id)}\n  recentIds={['save']}\n  placeholder=\"Search commands...\"\n/>\n```\n```\n\n### Footer\n\nProps for the `Footer` composition.\n\nA site footer with `role=\"contentinfo\"` that lays out a brand slot, link columns,\nsocial icons, and a bottom bar. Does not compose other ggui primitives (uses plain\nHTML elements). Content is constrained to `max-width: 1280px` with auto margins.\nLink columns use a responsive flex layout (`flex: 0 1 180px`). The bottom bar\nincludes copyright text, social links, and bottom-bar links separated by a top border.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| brand | `ReactNode` | - | Brand element (logo, tagline) rendered in a flexible column (`flex: 1 1 280px`). |\n| columns | `FooterColumn[]` | - | Array of link columns rendered in a flex-wrap layout with 48 px gap. |\n| socialLinks | `FooterSocialLink[]` | - | Social media icon links rendered in the bottom bar. |\n| bottomText | `string` | - | Text displayed at the start of the bottom bar (e.g., copyright notice). |\n| bottomLinks | `FooterLink[]` | - | Links displayed in the bottom bar after social icons (e.g., Privacy, Terms). |\n| background | `string` | `colors.gray[50]` | Background color of the footer. |\n| bordered | `boolean` | `true` | When true, renders a 1 px top border in `colors.gray[200]`. |\n\n**Example:**\n```tsx\n```tsx\n<Footer\n  brand={<img src=\"/logo.svg\" alt=\"Acme\" />}\n  columns={[\n    { title: 'Product', links: [{ label: 'Features', href: '/features' }] },\n    { title: 'Company', links: [{ label: 'About', href: '/about' }] },\n  ]}\n  socialLinks={[\n    { label: 'Twitter', href: 'https://twitter.com/acme', icon: <TwitterIcon /> },\n  ]}\n  bottomText=\"&copy; 2026 Acme Inc.\"\n  bottomLinks={[{ label: 'Privacy', href: '/privacy' }]}\n  bordered\n/>\n```\n```\n\n### IncidentTimeline\n\nProps for the `IncidentTimeline` composition.\n\nA status-page-style incident timeline. Renders a colored day grid (squares)\nat the top showing the worst severity for each day (green = no incidents,\namber = minor, red = major/critical). Below the grid, incidents are grouped by day\nwith expandable cards showing severity badge, title, status label, affected services,\nand a chronological update log.\n\nUses CSS variables throughout (`--ggui-color-*`, `--ggui-font-size-*`, `--ggui-shape-radius-*`)\nwith hardcoded fallbacks. Does not compose ggui primitives \u2014 uses inline-styled `<div>`,\n`<span>`, and `<svg>` elements. The expand/collapse chevron animates with a 200 ms\ncubic-bezier transition.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| incidents | `Incident[]` | - | Array of incidents to display. Grouped by creation date in the timeline. |\n| days | `number` | `14` | Number of days to show in the uptime grid (counting back from today). |\n| emptyText | `string` | `'All systems operational'` | Message displayed next to a green dot when there are no incidents at all. |\n| compact | `boolean` | `false` | When true, incident cards are non-expandable \u2014 the update log is hidden and the chevron indicator is removed. |\n\n**Example:**\n```tsx\n```tsx\n<IncidentTimeline\n  incidents={[\n    {\n      id: 'inc-1',\n      title: 'API Latency Spike',\n      severity: 'major',\n      status: 'resolved',\n      createdAt: '2026-03-15T10:00:00Z',\n      resolvedAt: '2026-03-15T12:30:00Z',\n      updates: [\n        { id: 'u1', status: 'investigating', message: 'Elevated p99 latency detected', timestamp: '2026-03-15T10:00:00Z' },\n        { id: 'u2', status: 'resolved', message: 'Root cause fixed', timestamp: '2026-03-15T12:30:00Z' },\n      ],\n      affectedServices: ['API', 'Dashboard'],\n    },\n  ]}\n  days={14}\n  emptyText=\"All systems operational\"\n/>\n```\n```\n\n### Hero\n\nProps for the `Hero` composition.\n\nA prominent landing-page hero section that renders heading, description, CTA buttons,\nand an optional media slot. Does not compose other ggui primitives (uses plain HTML\nelements styled with design tokens). Content is constrained to `max-width: 1280px`.\n\nLayout modes:\n- `align='center'` \u2014 single-column centered layout with `max-width: 800px` text area.\n- `align='left'` \u2014 two-column side-by-side layout (50/50 split with media slot).\n\nSize controls vertical padding and font sizes:\n- `'sm'` \u2014 48 px vertical padding, 3xl heading, lg description.\n- `'md'` \u2014 80 px vertical padding, 4xl heading, xl description.\n- `'lg'` \u2014 120 px vertical padding, 5xl heading, xl description.\n\nThe primary action button uses `colors.primary[600]` fill; the secondary action uses\nan outlined style. When `overlay` is true with a `backgroundImage`, text switches to white\nand borders become semi-transparent.\n\n**Props:**\n\n| Prop | Type | Default | Description |\n|------|------|---------|-------------|\n| heading | `string` | - | Main heading text rendered as an `<h1>` with bold weight and tight line-height. |\n| description | `string` | - | Description paragraph rendered below the heading with relaxed line-height. |\n| primaryAction | `HeroAction` | - | Primary CTA button rendered with `colors.primary[600]` background and white text. |\n| secondaryAction | `HeroAction` | - | Secondary CTA button rendered with a transparent background and a 1 px border. |\n| media | `ReactNode` | - | Media element (image, video, illustration) rendered beside or below the text content. |\n| align | `'center' \\| 'left'` | `'center'` | Text and layout alignment. - `'center'` \u2014 centered single-column layout. - `'left'` \u2014 left-aligned text with media in a right column (50/50 split). |\n| size | `'sm' \\| 'md' \\| 'lg'` | `'md'` | Controls vertical padding and heading/description font sizes. - `'sm'` \u2014 compact (48 px padding, 3xl/lg fonts). - `'md'` \u2014 standard (80 px padding, 4xl/xl fonts). - `'lg'` \u2014 spacious (120 px padding, 5xl/xl fonts). |\n| background | `string` | `colors.white (when no backgroundImage is set)` | Background color of the hero section. |\n| backgroundImage | `string` | - | Background image URL applied as `background-size: cover; background-position: center`. |\n| overlay | `boolean` | `false` | When true and `backgroundImage` is set, renders a semi-transparent black overlay (`rgba(0,0,0,0.5)`) and switches text to white/semi-transparent white for contrast. |\n\n**Example:**\n```tsx\n```tsx\n<Hero\n  heading=\"Build Better UIs, Faster\"\n  description=\"The universal interface layer between AI agents and humans.\"\n  primaryAction={{ label: 'Get Started', onClick: () => navigate('/signup') }}\n  secondaryAction={{ label: 'Learn More', href: '/docs' }}\n  media={<img src=\"/hero.png\" alt=\"Hero\" />}\n  align=\"left\"\n  size=\"lg\"\n/>\n```\n```\n\n### Support Types\n\n**SidebarItem:**\n\nA single navigation entry in a `Sidebar`. Supports nested children for\ncollapsible sub-menus and an optional badge slot.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| id | `string` | Unique identifier used for active-state matching and React keys. |\n| label | `string` | Display label for the item. Hidden when the sidebar is collapsed. |\n| icon | `ReactNode` | Leading icon rendered before the label. Remains visible when collapsed. |\n| href | `string` | Optional URL associated with this item (not rendered as a link by default). |\n| badge | `ReactNode` | Trailing badge element (e.g., unread count). Hidden when collapsed. |\n| children | `SidebarItem[]` | Nested child items. When present, the item acts as a collapsible section (chevron indicator shown). |\n| disabled | `boolean` | When true, the item is visually dimmed and non-interactive (`cursor: not-allowed`). |\n\n**Comment:**\n\nA single comment entry in a `CommentThread`. Supports nested replies\nand emoji reactions with counts.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| id | `string` | Unique identifier for this comment. |\n| author | `{     /** Display name of the author. */     name: string;     /** URL for the author's avatar image. Passed to the `Avatar` primitive. */     avatar?: string;   }` | Comment author metadata. |\n| content | `string` | The comment body text. |\n| timestamp | `string \\| Date` | Timestamp of the comment. Rendered via `toLocaleString()` when a `Date` object. |\n| replies | `Comment[]` | Nested reply comments. Each reply is rendered indented 40 px deeper. |\n| reactions | `{ emoji: string; count: number }[]` | Emoji reactions with their aggregated counts (e.g., `{ emoji: \"\u{1F44D}\", count: 3 }`). |\n\n**DataTableColumn:**\n\nColumn definition for a `DataTable`. Controls header text, width, alignment,\nsorting, and custom cell rendering.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| key | `string` | Property key on the row object used to extract cell values. Also serves as the sort key. |\n| header | `string` | Column header text displayed in the `<thead>`. |\n| width | `number \\| string` | Column width as a CSS value (number for pixels, string for any CSS unit). |\n| sortable | `boolean` | When true, the column header is clickable and triggers `onSort`. An arrow icon indicates direction. |\n| render | `(value: unknown, row: T, index: number) => ReactNode` | Custom cell renderer. When omitted, the raw value is stringified via `String()`. |\n| align | `'left' \\| 'center' \\| 'right'` | Text alignment for both header and body cells. |\n\n**ChatMessage:**\n\nA single message in a `ChatWindow`. Includes sender metadata, delivery status,\nand a timestamp.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| id | `string` | Unique identifier for this message. |\n| content | `string` | The message body text. |\n| sender | `{     /** Unique ID of the sender. Compared to `currentUserId` to determine alignment. */     id: string;     /** Display name of the sender. */     name: string;     /** Avatar image URL. Only shown for non-current-user messages (xs size). */     avatar?: string;   }` | Sender metadata used for avatar rendering and alignment. |\n| timestamp | `string \\| Date` | Message timestamp. Rendered as `HH:MM` via `toLocaleTimeString` when a `Date` object. |\n| status | `'sending' \\| 'sent' \\| 'delivered' \\| 'read' \\| 'error'` | Delivery status indicator shown on the current user's messages. - `'sending'` \u2014 shows a dot bullet - `'sent'` \u2014 shows a single checkmark - `'delivered'` \u2014 shows double checkmarks - `'read'` \u2014 shows double checkmarks (same visual as delivered) - `'error'` \u2014 shows an exclamation mark |\n\n**NavItem:**\n\nA single navigation entry in a `NavigationBar`. Supports nested children\nfor sub-menus (rendered by the parent via dropdown, not built-in).\n\n| Property | Type | Description |\n|----------|------|-------------|\n| id | `string` | Unique identifier used for active-state matching and React keys. |\n| label | `string` | Display label for the navigation link. |\n| href | `string` | URL for the item. When provided, renders an `<a>` element instead of `<button>`. |\n| icon | `ReactNode` | Optional icon rendered before the label. |\n| children | `NavItem[]` | Nested child items (for sub-menu structures; rendering is consumer-defined). |\n| disabled | `boolean` | When true, the item is visually dimmed (opacity 0.5) and non-interactive. |\n\n**UploadedFile:**\n\nA file entry in the `FileUploader` composition. Tracks upload progress,\nstatus, and optional error messages.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| id | `string` | Unique identifier for this file entry. Used as a key and for removal callbacks. |\n| name | `string` | Original file name. Rendered with text-overflow ellipsis when too long. |\n| size | `number` | File size in bytes. Formatted as B/KB/MB/GB for display. |\n| type | `string` | MIME type of the file (e.g., `'image/png'`). |\n| progress | `number` | Upload progress as a percentage (0-100). Shown via the `Progress` primitive when status is `'uploading'`. |\n| status | `'pending' \\| 'uploading' \\| 'success' \\| 'error'` | Current upload lifecycle status. - `'pending'` \u2014 file selected but upload not started. - `'uploading'` \u2014 upload in progress; `progress` bar is shown. - `'success'` \u2014 upload completed. - `'error'` \u2014 upload failed; `error` message is shown in `colors.error[500]`. |\n| error | `string` | Error message displayed when status is `'error'`. |\n| url | `string` | The remote URL of the uploaded file after successful upload. |\n\n**Notification:**\n\nA single notification entry in the `NotificationCenter`. Supports semantic type coloring,\nread state, and an optional inline action button.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| id | `string` | Unique identifier for this notification. |\n| title | `string` | Notification title rendered in medium weight. |\n| message | `string` | Optional body text rendered below the title in a smaller font. |\n| timestamp | `string \\| Date` | Timestamp of the notification. Rendered via `toLocaleString()` when a `Date` object. |\n| read | `boolean` | Read state. Unread notifications get a `colors.primary[50]` background and a colored status dot matching the notification type. |\n| type | `'info' \\| 'success' \\| 'warning' \\| 'error'` | Semantic type that controls the status dot color on unread notifications. - `'info'` \u2014 `colors.info[500]` (blue) - `'success'` \u2014 `colors.success[500]` (green) - `'warning'` \u2014 `colors.warning[500]` (amber) - `'error'` \u2014 `colors.error[500]` (red) |\n| icon | `ReactNode` | Optional icon rendered alongside the notification (not used by the default implementation). |\n| action | `{     /** Button label text. */     label: string;     /** Click handler for the action. */     onClick: () => void;   }` | Optional inline action button rendered next to the timestamp. |\n\n**Command:**\n\nA single command entry in a `CommandPalette`. Commands can be grouped,\nhave keyboard shortcuts, and support a disabled state.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| id | `string` | Unique identifier for this command. |\n| label | `string` | Display label for the command. Searchable by the palette's query filter. |\n| description | `string` | Optional description text shown below the label. Also searchable. |\n| icon | `ReactNode` | Icon rendered at the start of the command row. |\n| shortcut | `string` | Keyboard shortcut hint displayed at the end of the row in a `<kbd>` element. |\n| group | `string` | Group name for visual sectioning. Commands with the same group are rendered under a shared header. Defaults to `'Commands'` if omitted. |\n| disabled | `boolean` | When true, the command is visually dimmed and cannot be selected. |\n\n**FooterLink:**\n\nA single link entry in a footer column or the bottom bar. Supports both\n`href` navigation and `onClick` handlers (onClick takes precedence via `preventDefault`).\n\n| Property | Type | Description |\n|----------|------|-------------|\n| label | `string` | Display text for the link. |\n| href | `string` | URL for the link. |\n| onClick | `() => void` | Click handler. When provided, `preventDefault` is called on the anchor click. |\n\n**FooterColumn:**\n\nA named column of links in the `Footer` layout. Each column has an optional title\nand a list of links rendered as a vertical stack with 10 px gap.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| title | `string` | Column heading rendered as an `<h4>` with semibold weight. |\n| links | `FooterLink[]` | Links displayed in this column. |\n\n**FooterSocialLink:**\n\nA social media link in the `Footer` bottom bar. Rendered as an icon-only anchor\nwith `aria-label` for accessibility.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| label | `string` | Accessible label for the social link (used as `aria-label`). |\n| href | `string` | URL for the social media profile or page. |\n| icon | `ReactNode` | Icon element rendered inside the anchor (typically an SVG or `Icon` primitive). |\n\n**HeroAction:**\n\nA call-to-action button definition for the `Hero` composition.\nUsed for both the primary (filled) and secondary (outlined) action buttons.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| label | `string` | Button label text. |\n| onClick | `() => void` | Click handler for the button. |\n| href | `string` | Optional URL (not used by the default implementation; available for consumer routing). |\n\n**IncidentUpdate:**\n\nA single status update within an `Incident`. Displayed in the expandable\nupdate log with timestamp, status label, and message.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| id | `string` | Unique identifier for this update entry. |\n| status | `IncidentStatus` | Status at the time of this update. Rendered as a capitalized label. |\n| message | `string` | Description of what changed or was observed. |\n| timestamp | `string \\| Date` | Timestamp of the update. Formatted as `HH:MM AM/PM`. |\n\n**Incident:**\n\nA single incident with its metadata, status updates, and affected services.\nRendered as an expandable card in the `IncidentTimeline`.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| id | `string` | Unique identifier for this incident. |\n| title | `string` | Short incident title displayed in the card header. |\n| severity | `IncidentSeverity` | Severity level controlling the badge color (minor=amber, major=red, critical=dark red). |\n| status | `IncidentStatus` | Current lifecycle status of the incident. |\n| createdAt | `string \\| Date` | When the incident was created. Used to assign it to a day in the timeline grid. |\n| resolvedAt | `string \\| Date` | When the incident was resolved. Omitted for ongoing incidents. |\n| updates | `IncidentUpdate[]` | Chronological list of status updates shown in the expandable detail panel. |\n| affectedServices | `string[]` | List of affected service names displayed as small badges below the incident title. |\n\n\n## System Conventions\n\n### onChange Behavior (CRITICAL)\n\nAll form control onChange handlers receive the VALUE DIRECTLY, not a React event object.\n\n```tsx\n// CORRECT \u2014 onChange receives value directly\n<Input value={name} onChange={setName} />\n<Input value={email} onChange={(value) => setEmail(value)} />\n<Select value={country} onChange={setCountry} options={countries} />\n<Checkbox checked={agreed} onChange={setAgreed} />\n\n// WRONG \u2014 DO NOT use e.target.value!\n<Input value={name} onChange={(e) => setName(e.target.value)} /> // WILL BREAK\n```\n\nApplies to: Input, TextArea, Select, Checkbox, RadioGroup, Slider, Tabs, Accordion.\n\n### Available Motion & Animation\n\nRender `<MotionKeyframes />` once (anywhere in tree) to enable all keyframes.\n\n**Entrance/exit:** fadeIn, fadeOut, slideInUp, slideInDown, scaleIn, scaleOut\n**State feedback:** flash (background-color highlight), pulse (opacity breathing), bounce (scale overshoot)\n**Easing:** linear, easeIn, easeOut, easeInOut, spring (bouncy)\n**Durations:** instant(0ms), fast(100ms), normal(200ms), slow(300ms), slower(500ms)\n\n```tsx\n// Entrance animation on mount\n<div style={{ animation: 'ggui-fadeIn 200ms ease-out' }}>Content</div>\n\n// Stagger list items\n{items.map((item, i) => (\n  <div key={item.id} style={{ animation: \\`ggui-slideInUp 300ms ease-out \\${i * 50}ms both\\` }}>\n    {item.name}\n  </div>\n))}\n\n// Flash highlight when data changes (e.g., stock price update)\n// useAnimationKey returns a key that increments when dep changes \u2192 remounts element \u2192 replays animation\nconst priceKey = useAnimationKey(stock.price);\n<div key={priceKey} style={{\n  animation: animation.flash,\n  '--ggui-flash-color': stock.change > 0 ? 'var(--ggui-color-success-100)' : 'var(--ggui-color-error-100)',\n} as React.CSSProperties}>\n  {stock.price}\n</div>\n\n// Respect reduced-motion preference\nconst { motionEnabled } = useMotion();\n<div style={motionEnabled ? { animation: 'ggui-scaleIn 200ms ease-out' } : undefined}>\n  Content\n</div>\n```\n\n### Elevation System\n\n6 levels mapping shadow intensity to z-index for layering:\n- Level 0: flat (no shadow, z: auto) \u2014 inline content\n- Level 1: sm shadow (z: auto) \u2014 cards, sections\n- Level 2: md shadow (z: 1000) \u2014 dropdowns, popovers\n- Level 3: lg shadow (z: 1200) \u2014 sticky banners\n- Level 4: xl shadow (z: 1400) \u2014 modals, dialogs\n- Level 5: 2xl shadow (z: 1800) \u2014 tooltips, toasts\n\n### Import Constraints\n\nOnly these imports are allowed:\n- `react`\n- `@ggui-ai/design` \u2014 the whole design system (primitives, components, compositions, and the `Clickable` / `Hoverable` / `Pressable` traits) is one import; there are no subpaths\n- `@ggui-ai/wire` (wire hooks)\n\nNo external libraries (lodash, date-fns, etc.). No fetch(). No eval().";

// src/tools/get-wire.ts
var WIRE_DOCUMENTATION = "# ggui Wire Hooks Reference\n\n> Wire hooks connect generated UI components to agent communication.\n> They are pre-imported in the boilerplate \u2014 use them directly.\n> All hooks must be called inside a GguiWireProvider (handled automatically by the renderer).\n\nImport: `import { useAction, useStream } from '@ggui-ai/wire'`\n\n## Communication Hooks\n\n\n\nThese are the wire primitives for component-agent communication. `useWiredTool` retired 2026-05-11 \u2014 agentTools is a catalog the AGENT invokes, not a component hook surface; user gestures use `useAction(name)` and the optional `nextStep` field on the action entry names the tool the agent SHOULD invoke next.\n\n### useAction\n\nFire an action to the agent. Fire-and-forget \u2014 no response, no pending state.\n\nProtocol V4: when the action contract sets `actions[name].tool`, the platform\nroutes the dispatch to that named MCP tool server-side. The component code is\nidentical \u2014 call `useAction(name)(payload)` either way. Treat the tool name\nas informational (use it to inform button labels, icons, copy).\n\nRUNTIME DEDUP (backstop, not a feature). Same-`(name, payload)` calls within\none event-loop task are coalesced \u2014 the first wins, subsequent duplicates\nare suppressed. This is the structural defense against LLM-generated\nnested-interactive components where a Checkbox `onChange` and an outer\n`Card as={Clickable}` `onClick` both wire to the same `useAction` binding;\nthe inner gesture bubbles to the outer handler, so without dedup one user\nclick would fire the action twice (a toggle would run back-to-back and the\nuser's change would disappear). **Do not rely on this as a feature** \u2014 wire\neach `useAction` callback to exactly ONE interactive surface; the dedup\nexists only because the LLM's source code can be wrong in subtle ways and\nthe runtime is the only place that can see the actual event-bubble path.\nSee `dispatch-dedup.ts` for the full failure-mode rationale.\n\nNEVER SILENT. When the dedup fires, a `console.warn` is emitted in BOTH dev\nand prod with the full diagnostic. The suppression is always visible in\nbrowser DevTools; operators investigating a \"the second click does nothing\"\nreport see the warning immediately. Hosts that want structured telemetry\n(Sentry, Datadog, server logs) can additionally set\n on the provided `WireConfig`.\n\n**Signature:** `useAction<T = unknown>(actionName: string): (data: T) => void`\n\n**Parameters:**\n\n| Param | Type | Description |\n|-------|------|-------------|\n| actionName | `string` | Action name from the action contract |\n\n**Returns:** `(data: T) => void`\n\n**Example:**\n```tsx\nconst submitForm = useAction<{name: string; email: string}>('formSubmit');\n\n// In JSX:\n<Button onClick={() => submitForm({ name, email })}>Submit</Button>\n```\n\n\n### useStream\n\nSubscribe to deliveries on a named stream channel.\n\nHonors the channel's per-delivery `mode` ('append' vs 'replace')\nand the optional `complete` terminal marker. Channels declared\n`mode: 'replace'` on the spec typically emit every delivery with\n`mode: 'replace'` \u2014 this hook folds them into a single-latest\nvalue without accumulating history.\n\n**Signature:** `useStream<T = unknown>(channelName: string): StreamResult<T>`\n\n**Parameters:**\n\n| Param | Type | Description |\n|-------|------|-------------|\n| channelName | `string` | Channel name from the render's streamSpec |\n\n**Returns:** `StreamResult<T>`\n\n| Property | Type | Description |\n|----------|------|-------------|\n| latest | `T \\| null` | Most recent payload delivered on this channel, or null if none received yet. |\n| all | `T[]` | All payloads accumulated on this channel.  - `mode: 'append'` deliveries are pushed to the tail (continuous stream). - `mode: 'replace'` deliveries collapse `all` to a single-element array   containing the latest payload \u2014 matching the channel's   \"full replacement\" semantics. |\n| isComplete | `boolean` | Truthy after the channel has delivered an envelope with `complete: true`. Subscribers flip into a \"channel closed\" rendering state based on this signal; further deliveries on a completed channel are still accumulated, since the underlying wire doesn't enforce quiescence. |\n\n**Example:**\n```tsx\nconst progress = useStream<{ percent: number; message: string }>('progress');\n\n// In JSX:\n{progress.latest && (\n  <Progress value={progress.latest.percent} />\n)}\n<Text>{progress.all.length} updates received</Text>\n```\n\n\n## Context Hooks\n\n\n\nRead-only access to render, app, and auth context.\n\n### useAuth\n\nRead-only auth context. Token excluded \u2014 auth is added server-side.\n\n**Signature:** `useAuth(): AuthInfo`\n\n**Returns:** `AuthInfo`\n\n| Property | Type | Description |\n|----------|------|-------------|\n| userId | `string` | userId |\n| isAuthenticated | `boolean` | isAuthenticated |\n\n**Example:**\n```tsx\nconst auth = useAuth();\n\n// In JSX:\n{auth.isAuthenticated\n  ? <Text>Welcome, user {auth.userId}</Text>\n  : <Text>Please sign in</Text>\n}\n```\n\n\n### useApp\n\nRead-only app metadata.\n\n**Signature:** `useApp(): AppInfo`\n\n**Returns:** `AppInfo`\n\n| Property | Type | Description |\n|----------|------|-------------|\n| appId | `string` | appId |\n| appName | `string` | appName |\n| appDescription | `string` | appDescription |\n| appIcon | `string` | appIcon |\n\n**Example:**\n```tsx\nconst app = useApp();\n\n// In JSX:\n<Heading>{app.appName}</Heading>\n{app.appDescription && <Text>{app.appDescription}</Text>}\n```\n\n\n### useRender\n\nRead-only render context with connection status.\n\n**Signature:** `useRender(): RenderInfo`\n\n**Returns:** `RenderInfo`\n\n| Property | Type | Description |\n|----------|------|-------------|\n| renderId | `string` | renderId |\n| isConnected | `boolean` | isConnected |\n\n**Example:**\n```tsx\nconst render = useRender();\n\n// In JSX:\n<Badge variant={render.isConnected ? 'success' : 'error'}>\n  {render.isConnected ? 'Connected' : 'Disconnected'}\n</Badge>\n```\n\n\n## Provider\n\n\n\nThe provider is set up automatically by the renderer. Generated components do not need to wrap themselves in a provider.\n\n### GguiWireProvider\n\nReact context provider that injects WireConfig for all wire hooks.\n\n**Props:**\n\n| Prop | Type | Description |\n|------|------|-------------|\n| config | `WireConfig` | config |\n| children | `ReactNode` | children |\n\n**Example:**\n```tsx\n<GguiWireProvider config={wireConfig}>\n  <YourComponent />\n</GguiWireProvider>\n```\n\n\n## Internal: WireConfig\n\n\n\nThis is the configuration object passed to GguiWireProvider. Generated components do not interact with this directly \u2014 it is provided by the renderer.\n\n### WireConfig\n\nConfiguration injected by the provider \u2014 the renderer inside the\niframe.\n\nEvery method is typed against the contract generic `T` so typed\ncallers get compile-time enforcement:\n  - `dispatch(name, data)` \u2014 `name` MUST be a declared actionSpec\n    key; `data` MUST satisfy that action's schema.\n  - `subscribe(channel, handler)` \u2014 same discipline for streamSpec.\n\nUntyped callers (`T = DataContract` default) degrade to the broad\nshape via the conditional `WireDispatchData` / `WireStreamPayload`\naliases \u2014 no call-site break.\n\nThe contract's `agentTools` catalog declares tools the AGENT\ninvokes (not the component); user gestures fire via\n`dispatch(name, data)` and the optional `nextStep` field on the\naction entry names the tool the agent SHOULD invoke next.\n\nThe renderer mounts exactly ONE render per iframe \u2014 `render.renderId`\nis the stable identity the WireProvider was constructed with. No\nper-item scoping factory; with a one-render-per-mount lifecycle,\n\"scope\" collapses to identity.\n\n| Property | Type | Description |\n|----------|------|-------------|\n| app | `{     readonly appId: string;     readonly appName: string;     readonly appDescription?: string;     readonly appIcon?: string;   }` | app |\n| render | `{     readonly renderId: string;     readonly isConnected: boolean;   }` | render |\n| auth | `{     readonly userId?: string;     readonly isAuthenticated: boolean;   }` | auth |\n| dispatch | `<N extends string>(     actionName: N,     data: WireDispatchData<T, N>,   ) => void` | Fire an action to the agent (fire-and-forget over WS). Typed callers get compile-time checked `name` + `data`; untyped callers (`T = DataContract`) keep the broad shape. |\n| subscribe | `<N extends string>(     channelName: N,     handler: (delivery: StreamDelivery<WireStreamPayload<T, N>>) => void,   ) => () => void` | Subscribe to deliveries on a named stream channel. |\n| onDispatchSuppressed | `(info: DispatchSuppressedInfo) => void` | Optional structured observability for `useAction`'s task-scoped duplicate-dispatch suppression. Fires alongside the always-on `console.warn` whenever the runtime coalesces a same-(name, payload) re-dispatch within one event-loop task \u2014 the nested- interactive double-fire backstop. Hosts can route this to telemetry sinks (Sentry, Datadog, server-side log) for ops dashboards; absent \u2192 only the dev-console signal fires. |\n";

// src/harness/pitfalls.ts
var PITFALLS = [
  {
    id: "stack-row-padding",
    rule: '`Stack`/`Row` do NOT accept `padding` \u2014 wrap the children in `<Box padding="...">`.',
    why: "Stack and Row are flex containers; padding would violate the gap-based spacing model.",
    foundIn: "pre-#61 baseline"
  },
  {
    id: "align-enum",
    rule: "`align` accepts only `'start' | 'center' | 'end' | 'stretch'` (NEVER `flex-end`/`flex-start`).",
    why: "Components use semantic enums, not raw CSS flex values.",
    foundIn: "pre-#61 baseline"
  },
  {
    id: "justify-enum",
    rule: "`justify` accepts only `'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'`.",
    why: "Semantic enum, not raw CSS flex values.",
    foundIn: "pre-#61 baseline"
  },
  {
    id: "badge-variant",
    rule: "`Badge variant` accepts `'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'`.",
    why: "Badge has a fixed enum \u2014 LLMs sometimes invent variants like 'danger' or 'red'.",
    foundIn: "pre-#61 baseline"
  },
  {
    id: "imports-preimported",
    rule: "All design-system primitives are pre-imported by the boilerplate \u2014 do NOT add imports unless absolutely needed.",
    why: "Duplicate imports cause TS errors; the boilerplate already resolves the full primitive surface.",
    foundIn: "pre-#61 baseline"
  }
  // ─── Provisional pitfalls considered + retired by exp66 n=6 factorial ───
  //
  // The 3 "new" pitfalls below were added in exp61 after OpenAI kanban
  // error mining: useState typing, stream null-guard promotion, null-vs-
  // undefined. Individual smokes suggested they helped, but the rigorous
  // exp66 factorial (n=6, 3×2 pitfalls × batch-fix) showed they REGRESS
  // blended ms by +8.8s (legacy5 29.3s → full8 38.1s, batch-off).
  //
  // Mechanism: attention dilution. Each added rule shifts LLM attention
  // away from the 5 legacy pitfalls that catch the real error classes.
  // Plus, "ALWAYS type useState" is too categorical — LLMs over-annotate
  // in contexts that didn't need it.
  //
  // Retired from default. Kept as dormant comments so the next person
  // investigating the same error classes knows this path was tried.
  //
  //   usestate-type-annotation: "ALWAYS type useState: useState<T[]>([])..."
  //   stream-latest-null-guard: "useStream().latest is T|null — always null-guard..."
  //   null-vs-undefined:         "Use undefined for optional props, not null..."
  //
  // If a future bench mines a new provider/fixture combination that
  // reliably violates one of these, revisit with a targeted profile,
  // not a global rule.
];
function renderPitfallsBlock() {
  const disableAll = typeof process !== "undefined" && process.env?.GGUI_PITFALLS === "off";
  if (disableAll) return "";
  const disableNew = typeof process !== "undefined" && process.env?.GGUI_NEW_PITFALLS === "off";
  const LEGACY_IDS = /* @__PURE__ */ new Set([
    // Pre-exp61: original Common Pitfalls (5 rules)
    "stack-row-padding",
    "align-enum",
    "justify-enum",
    "badge-variant",
    "imports-preimported"
  ]);
  const entries = [...PITFALLS].filter((p) => !disableNew || LEGACY_IDS.has(p.id)).sort((a, b) => a.id.localeCompare(b.id));
  const bullets = entries.map((p) => `- ${p.rule}`).join("\n");
  return `## Common Pitfalls (each costs an iteration \u2014 avoid them up front)
${bullets}`;
}
var __dirname$1 = dirname(fileURLToPath(import.meta.url));
var TEMPLATE_DIRS = [
  resolve(__dirname$1, "templates"),
  resolve(__dirname$1, "..", "src", "boilerplate", "templates"),
  resolve(__dirname$1, "..", "..", "src", "boilerplate", "templates"),
  resolve(__dirname$1, "..", "..", "..", "src", "boilerplate", "templates"),
  resolve(__dirname$1, "..", "..", "..", "..", "src", "boilerplate", "templates")
];
var baseCache = null;
var layoutCache = /* @__PURE__ */ new Map();
function loadBase() {
  if (baseCache) return baseCache;
  for (const dir of TEMPLATE_DIRS) {
    try {
      baseCache = readFileSync(resolve(dir, "base.tsx.tmpl"), "utf-8");
      return baseCache;
    } catch {
      continue;
    }
  }
  throw new Error("No base.tsx.tmpl found");
}
function loadLayout(shellType, screen) {
  const key = `${shellType}-${screen}`;
  if (layoutCache.has(key)) return layoutCache.get(key);
  const candidates = [
    `${shellType}-${screen}.tsx.tmpl`,
    `${shellType}-universal.tsx.tmpl`,
    `fullscreen-universal.tsx.tmpl`
    // final fallback
  ];
  for (const filename of candidates) {
    for (const dir of TEMPLATE_DIRS) {
      try {
        const content = readFileSync(resolve(dir, "layouts", filename), "utf-8");
        layoutCache.set(key, content);
        return content;
      } catch {
        continue;
      }
    }
  }
  throw new Error(`No layout found for ${key}`);
}
function renderBoilerplate(shellType, screen, markers) {
  let template = loadBase();
  const layout = loadLayout(shellType, screen);
  template = template.replace("{{LAYOUT}}", layout);
  for (const [key, value] of Object.entries(markers)) {
    template = template.replaceAll(`{{${key}}}`, value);
  }
  return template;
}

// src/boilerplate/json-schema-ts.ts
function jsonSchemaTypeToTs(schema) {
  const unionMembers = schema.oneOf ?? schema.anyOf;
  if (unionMembers?.length) {
    const types = [...new Set(unionMembers.map((s) => jsonSchemaTypeToTs(s)))];
    return types.length === 1 ? types[0] : types.join(" | ");
  }
  if (schema.const !== void 0) {
    return typeof schema.const === "string" ? `'${schema.const}'` : String(schema.const);
  }
  if (schema.enum?.length) {
    return schema.enum.map((v) => typeof v === "string" ? `'${v}'` : String(v)).join(" | ");
  }
  let result;
  switch (schema.type) {
    case "string":
      result = "string";
      break;
    case "number":
    case "integer":
      result = "number";
      break;
    case "boolean":
      result = "boolean";
      break;
    case "null":
      return "null";
    case "array": {
      if (schema.items) {
        const itemType = jsonSchemaTypeToTs(schema.items);
        result = schema.items.type === "object" && schema.items.properties ? `Array<${itemType}>` : itemType.includes("|") ? `(${itemType})[]` : `${itemType}[]`;
      } else {
        result = "unknown[]";
      }
      break;
    }
    case "object": {
      if (schema.properties) {
        const required = schema.required ?? [];
        const fields = Object.entries(schema.properties).map(([key, prop]) => {
          const opt = !required.includes(key);
          return `${key}${opt ? "?" : ""}: ${jsonSchemaTypeToTs(prop)}`;
        }).join("; ");
        result = `{ ${fields} }`;
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        result = `Record<string, ${jsonSchemaTypeToTs(schema.additionalProperties)}>`;
      } else {
        result = "Record<string, unknown>";
      }
      break;
    }
    default:
      result = "unknown";
  }
  if (schema.nullable && result !== "unknown") {
    return `${result} | null`;
  }
  return result;
}

// src/boilerplate/generate.ts
var ALL_PRIMITIVES = [
  "Container",
  "Card",
  "Stack",
  "Row",
  "Grid",
  "Box",
  "Divider",
  "Spacer",
  "Text",
  "Heading",
  "Button",
  "Input",
  "TextArea",
  "Select",
  "Checkbox",
  "Toggle",
  "RadioGroup",
  "Slider",
  "Badge",
  "Spinner",
  "Skeleton",
  "Avatar",
  "Alert",
  "Progress",
  "Image",
  "Icon",
  "Link",
  "Tooltip",
  "Table",
  "Tabs",
  "Toast",
  "Accordion",
  "MotionKeyframes",
  "useMotion",
  "useAnimationKey"
].join(", ");
var ALL_COMPONENTS = [
  "SearchField",
  "FormField",
  "MenuItem",
  "Tag",
  "Dropdown",
  "Autocomplete",
  "Breadcrumb",
  "Pagination",
  "EmptyState",
  "Stat"
].join(", ");
var ALL_COMPOSITIONS = [
  "Header",
  "Sidebar",
  "CardGrid",
  "CommentThread",
  "DataTable",
  "ChatWindow",
  "NavigationBar",
  "FileUploader",
  "UserProfileCard",
  "NotificationCenter",
  "Modal",
  "CommandPalette",
  "Footer",
  "Hero",
  "IncidentTimeline",
  "MakeTabLayout",
  "MarketingHero",
  "MarketingCTA",
  "MarketingFeatures"
].join(", ");
var ALL_INTERACT = ["Clickable", "Hoverable", "Pressable"].join(", ");
var ALL_DESIGN = [
  ALL_PRIMITIVES,
  ALL_COMPONENTS,
  ALL_COMPOSITIONS,
  ALL_INTERACT
].join(", ");
function inferTypeFromExample(example) {
  const fields = [];
  for (const [k, v] of Object.entries(example)) {
    let t;
    if (v === null || v === void 0) t = "unknown";
    else if (typeof v === "string") t = "string";
    else if (typeof v === "number") t = "number";
    else if (typeof v === "boolean") t = "boolean";
    else if (Array.isArray(v)) {
      if (v.length === 0) t = "unknown[]";
      else if (typeof v[0] === "string") t = "string[]";
      else if (typeof v[0] === "number") t = "number[]";
      else if (typeof v[0] === "object" && v[0] !== null)
        t = `Array<${inferTypeFromExample(v[0])}>`;
      else t = "unknown[]";
    } else if (typeof v === "object") {
      t = inferTypeFromExample(v);
    } else {
      t = "unknown";
    }
    fields.push(`${k}: ${t}`);
  }
  return `{ ${fields.join("; ")} }`;
}
function generateBoilerplate(_userPrompt, contract, shellType, screen, composedSections, appGadgets) {
  const propsFields = [];
  const propsData = contract?.propsSpec;
  const propsProperties = propsData?.properties ?? propsData ?? {};
  for (const [key, value] of Object.entries(propsProperties)) {
    if (typeof value === "object" && value !== null) {
      const spec = value;
      const schema = spec.schema;
      const required = spec.required !== false;
      const nullable = schema?.nullable === true;
      const tsType = schema ? jsonSchemaTypeToTs(schema) : "unknown";
      const fullType = nullable ? `${tsType} | null` : tsType;
      const parts = [];
      if (spec.description) parts.push(String(spec.description));
      if (spec.default !== void 0) parts.push(`(default: ${JSON.stringify(spec.default)})`);
      const desc = parts.length > 0 ? ` // ${parts.join(" ")}` : "";
      propsFields.push(`  ${key}${required ? "" : "?"}: ${fullType};${desc}`);
    } else {
      propsFields.push(`  ${key}: ${typeof value === "string" ? value : "unknown"};`);
    }
  }
  const actionTypeAliases = [];
  const actionHookCalls = [];
  const actionsMap = contract?.actionSpec ?? {};
  for (const [key, entry] of Object.entries(actionsMap)) {
    const label = entry.label ?? key;
    const desc = entry.description ?? "";
    const tool = entry.nextStep ?? "";
    const typeName = `Action${key.charAt(0).toUpperCase()}${key.slice(1)}Payload`;
    let tsType = "void";
    if (entry.schema) {
      tsType = jsonSchemaTypeToTs(entry.schema);
    } else if (entry.example && typeof entry.example === "object" && !Array.isArray(entry.example)) {
      tsType = inferTypeFromExample(entry.example);
    }
    const toolNote = tool ? ` (label "${label}", nextStep hint \u2192 ${tool})` : "";
    actionTypeAliases.push(
      `/** Action payload: ${desc || label}${toolNote} */
type ${typeName} = ${tsType};`
    );
    const callSig = tsType === "void" ? "() => void \u2014 fire and forget" : `(data: ${tsType}) => void`;
    const toolHint = tool ? ` \u2192 nextStep: ${tool}` : "";
    actionHookCalls.push(`  const ${key} = useAction<${typeName}>('${key}'); // ${callSig}${toolHint}`);
  }
  const streamChannels = contract?.streamSpec ?? {};
  const streamChannelEntries = Object.entries(streamChannels);
  const streamTypeAliases = [];
  const streamHookCalls = [];
  for (const [channelName, entry] of streamChannelEntries) {
    const desc = entry.description ?? "";
    const typeName = `Stream${channelName.charAt(0).toUpperCase()}${channelName.slice(1)}`;
    const tsType = entry.schema ? jsonSchemaTypeToTs(entry.schema) : "unknown";
    streamTypeAliases.push(`/** Stream channel: ${desc} */
type ${typeName} = ${tsType};`);
    streamHookCalls.push(
      `  const ${channelName} = useStream<${typeName}>('${channelName}'); // .latest: ${typeName} | null, .all: ${typeName}[]`
    );
  }
  const gadgetUses = contract ? listContractGadgets(contract) : [];
  const gadgetCatalog = /* @__PURE__ */ new Map();
  for (const descriptor of appGadgets ?? []) {
    for (const exp of descriptor.exports) {
      if (exp.hook === void 0) continue;
      gadgetCatalog.set(exp.hook, {
        description: exp.description,
        usage: exp.usage,
        example: exp.example
      });
    }
  }
  const gadgetImportsByPackage = /* @__PURE__ */ new Map();
  const gadgetHookCalls = [];
  for (const use of gadgetUses) {
    const exportName = use.name;
    const pkgExports = gadgetImportsByPackage.get(use.package);
    if (pkgExports !== void 0) pkgExports.add(exportName);
    else gadgetImportsByPackage.set(use.package, /* @__PURE__ */ new Set([exportName]));
    if (!HOOK_NAME_RE.test(exportName)) continue;
    const hook = exportName;
    const contractDesc = use.description;
    const contractUsage = use.usage;
    const catalog = gadgetCatalog.get(hook) ?? {};
    const desc = contractDesc ?? catalog.description ?? hook;
    const usage = contractUsage ?? catalog.usage;
    const example = catalog.example;
    let callArgs = "";
    let exampleComment = "";
    if (example !== void 0 && example !== null) {
      const callLine = typeof example === "object" && !Array.isArray(example) && typeof example.call === "string" ? example.call : void 0;
      if (callLine !== void 0) {
        exampleComment = `
  // EXAMPLE: ${callLine.trim()}`;
      } else {
        callArgs = JSON.stringify(example);
      }
    }
    const usageNote = usage ? ` USE: ${usage}` : "";
    const bindingName = hook.length > 3 ? hook.charAt(3).toLowerCase() + hook.slice(4) : hook;
    gadgetHookCalls.push(
      `  const ${bindingName} = ${hook}(${callArgs}); // ${desc}${usageNote}${exampleComment}`
    );
  }
  const gadgetImportLine = gadgetImportsByPackage.size > 0 ? "// DO NOT EDIT \u2014 gadget imports. Each export is resolved by the iframe runtime; keep every import line and export name. self_check fails with gadget_preservation:<export> if a gadget import is removed.\n" + Array.from(gadgetImportsByPackage.entries()).sort(([a], [b]) => a.localeCompare(b)).map(
    ([pkg, hooks]) => `import { ${Array.from(hooks).sort().join(", ")} } from '${pkg}';`
  ).join("\n") : "";
  const propsInterface = propsFields.length > 0 ? `// DO NOT EDIT \u2014 generated from data contract. Changing this will fail validation.
interface Props {
${propsFields.join("\n")}
}` : `// DO NOT EDIT \u2014 generated from data contract.
interface Props {
  [key: string]: string | number | boolean | null | object;
}`;
  const contextSpec = contract?.contextSpec ?? {};
  const contextSpecEntries = Object.entries(contextSpec);
  let contextHooks = "";
  if (contextSpecEntries.length > 0) {
    const hookLines = [];
    for (const [slotKey, entry] of contextSpecEntries) {
      const valueType = entry.schema ? jsonSchemaTypeToTs(entry.schema) : "unknown";
      const setterName = `set${slotKey.charAt(0).toUpperCase()}${slotKey.slice(1)}`;
      hookLines.push(
        `  const [${slotKey}, ${setterName}] = useGguiContext<${valueType}>('${slotKey}');`
      );
    }
    contextHooks = `  // DO NOT EDIT \u2014 auto-generated per contextSpec slot.
  // Read \`<slotKey>\` to render, write via \`set<SlotKey>\` to
  // surface the change to the agent's LLM context (debounced).
  // The runtime owns the underlying useState + Provider; you
  // write plain JSX, no wrap.
${hookLines.join("\n")}
`;
  }
  const hasActions = actionHookCalls.length > 0;
  const hasStream = streamHookCalls.length > 0;
  const hasGadgetHookCalls = gadgetHookCalls.length > 0;
  const hasContext = contextSpecEntries.length > 0;
  const hasAnyHook = hasActions || hasStream || hasContext || hasGadgetHookCalls;
  const hasAnyWireFromWire = hasActions || hasStream || hasContext;
  const wireHooks = [];
  if (hasActions) wireHooks.push("useAction");
  if (hasStream) wireHooks.push("useStream");
  if (hasContext) wireHooks.push("useGguiContext");
  const wireImport = hasAnyWireFromWire ? `import { ${wireHooks.join(", ")} } from '@ggui-ai/wire';
` : "";
  const gadgetImport = gadgetImportLine.length > 0 ? `${gadgetImportLine}
` : "";
  const reactHooks = ["useState", "useCallback", "useMemo", "useEffect", "useRef"];
  const reactImport = `import React, { ${reactHooks.join(", ")} } from 'react';`;
  const hookParts = [];
  if (hasActions) {
    hookParts.push("  // \u2500\u2500 Actions (contract-typed, fire-and-forget to agent) \u2500\u2500");
    hookParts.push("  // Call these to send user interactions to the agent. Types are enforced by the compiler.");
    hookParts.push(...actionHookCalls);
  }
  if (hasStream) {
    hookParts.push("");
    hookParts.push("  // \u2500\u2500 Streams (contract-typed, real-time from agent) \u2500\u2500");
    hookParts.push("  // .latest is the most recent event (or null). .all is the full history array.");
    hookParts.push(...streamHookCalls);
  }
  if (hasGadgetHookCalls) {
    hookParts.push("");
    hookParts.push("  // \u2500\u2500 Gadgets (browser-capability hooks; UI-owned lifecycle) \u2500\u2500");
    hookParts.push("  // Read .value / .status; call .start() to invoke. Surface .value through");
    hookParts.push("  // an actionSpec payload or contextSpec slot if the agent needs to observe it.");
    hookParts.push(...gadgetHookCalls);
  }
  const hookBody = hasAnyHook ? `  // DO NOT EDIT wire hooks \u2014 auto-generated from the data contract
${hookParts.join("\n")}
` : "";
  const wrapTypes = (label, body) => `
/* eslint-disable no-unused-vars */
// DO NOT EDIT \u2014 ${label}
${body}
/* eslint-enable no-unused-vars */
`;
  const actionTypesBlock = actionTypeAliases.length > 0 ? wrapTypes("action payload types generated from action contract.", actionTypeAliases.join("\n\n")) : "";
  const streamTypesBlock = streamTypeAliases.length > 0 ? wrapTypes("stream event types generated from stream contract.", streamTypeAliases.join("\n\n")) : "";
  const wiredToolTypesBlock = "";
  const clientToolTypesBlock = "";
  return renderBoilerplate(shellType ?? "fullscreen", screen ?? "universal", {
    REACT_IMPORT: reactImport,
    ALL_DESIGN,
    WIRE_IMPORT: wireImport + gadgetImport,
    PROPS_INTERFACE: propsInterface,
    ACTION_TYPES: actionTypesBlock,
    STREAM_TYPES: streamTypesBlock,
    WIRED_TOOL_TYPES: wiredToolTypesBlock,
    CLIENT_TOOL_TYPES: clientToolTypesBlock,
    CONTEXT_HOOKS: contextHooks,
    WIRE_HOOKS: hookBody,
    AXIS_SECTIONS: composedSections ?? ""
  });
}

// src/evaluation/types-public.ts
var CRITERIA = [
  // ── P0: Correctness (must satisfy — failure = broken component) ──
  {
    id: "compile",
    name: "Compile & type-check",
    priority: "P0",
    tier: 0,
    failOutcome: "fail",
    codingGuidance: "Code must compile. The typed Props and wire hook generics are enforced by the compiler.",
    evalInstruction: "Checked automatically by esbuild + TypeScript. No LLM evaluation needed."
  },
  {
    id: "render-props",
    name: "Render all Props fields",
    priority: "P0",
    tier: 0,
    failOutcome: "warn",
    codingGuidance: "Render every Props field in JSX. Access via props.fieldName.",
    evalInstruction: "Check that every field from interface Props appears as props.fieldName in the function body."
  },
  {
    id: "wire-hooks",
    name: "Wire all contract hooks",
    priority: "P0",
    tier: 0,
    failOutcome: "warn",
    codingGuidance: "Wire every useAction/useStream and every clientCapabilities.gadgets hook (e.g., useGeolocation) to a UI element. `agentCapabilities.tools` is a catalog the AGENT invokes \u2014 NOT a component hook surface.",
    evalInstruction: "Check that every hook variable from the boilerplate appears in the JSX or an effect."
  },
  {
    id: "imports",
    name: "Valid imports only",
    priority: "P0",
    tier: 0,
    failOutcome: "fail",
    codingGuidance: "Only import from react, @ggui-ai/design/*, and @ggui-ai/wire.",
    evalInstruction: "Flag any import from a package not in the allowlist."
  },
  {
    id: "security",
    name: "No eval/fetch/window",
    priority: "P0",
    tier: 0,
    failOutcome: "fail",
    codingGuidance: "Never use eval(), fetch(), or window. Data comes from props and hooks.",
    evalInstruction: "Flag any call to eval(), fetch(), or window access."
  },
  // ── P1: Safety (should satisfy — failure = crash or bad UX) ──
  {
    id: "functionality",
    name: "All features implemented",
    priority: "P1",
    tier: 1,
    failOutcome: "fail",
    codingGuidance: "Implement ALL features from the request AND the data contract.",
    evalInstruction: `Evaluate FUNCTIONALITY: Does this component implement ALL features from the request AND the data contract?

Check against BOTH sources:
1. Original request \u2014 each feature must be coded AND rendered in JSX
2. Data contract (if present) \u2014 verify:
   - Props fields are rendered in the UI. EXCEPTION: pure identifier fields (\`id\`, \`*Id\`, keys) that exist only to be echoed back inside an action payload do NOT need to be visibly rendered.
   - ALL useAction hooks are wired to clickable UI elements
   - ALL useStream hooks are consumed \u2014 the streamed data must reach the UI. Merging stream events into rendered state (a list, a counter, the displayed records) COUNTS as consuming the stream; it need not be a literal \`.latest\` render.
   - ALL clientCapabilities gadgets are used. \`clientCapabilities.gadgets\` is keyed by npm package: built-in browser capabilities (useGeolocation / useCamera / \u2026) import from @ggui-ai/gadgets; registered third-party gadgets (e.g. useChartTheme) import from their OWN package. Any gadget the contract declares IS a contract feature \u2014 NEVER flag it as "not part of the contract".
   - \`agentCapabilities.tools\` is a catalog declaration only; do NOT flag missing component-side calls for it

A contract hook that is declared but never used at all is a MISSING feature.

CRITICAL: The "issues" array must ONLY contain features you are CERTAIN are missing or broken \u2014 never an implemented feature. (See "Issue-array discipline" above: no speculative, self-negating, or "verify that\u2026" entries.)`
  },
  {
    id: "crash",
    name: "No crash scenarios",
    priority: "P1",
    tier: 1,
    failOutcome: "fail",
    codingGuidance: "Guard optional props (props.field?.x). stream.latest is T|null \u2014 always null-guard. .all is always an array.",
    evalInstruction: `Evaluate CRASH SAFETY: Are there ACTUAL runtime crash scenarios?

WILL crash (include in issues):
- .map()/.filter()/.length on an uninitialized variable
- Accessing property of undefined without guard
- useStream().latest.field WITHOUT null guard \u2014 .latest is T | null
- Optional Props field accessed as props.field.x without guard
- Array item optional field: items.map(item => item.priority.toUpperCase()) when priority is optional

SAFE (do NOT include):
- Optional chaining: props.items?.map() \u2014 SAFE
- Fallback: items || [] \u2014 SAFE
- useState initializer: useState([]) \u2014 SAFE
- Null check: items && items.map() \u2014 SAFE
- stream.latest && stream.latest.field \u2014 SAFE, guarded
- stream.all.map(...) \u2014 SAFE, .all is always an array
- stream.all.length \u2014 SAFE, always a number

The "issues" array is ONLY for a specific line that WILL throw at runtime. NEVER put a line you have determined is safe into the issues array \u2014 not even to note that it is safe ("\u2026so this is safely guarded", "\u2026so there is no crash"). If you cannot name a concrete line that will throw, the answer is {"pass": true} \u2014 return that and an empty issues array.`
  },
  {
    id: "tokens",
    name: "Design system tokens",
    priority: "P1",
    tier: 0,
    failOutcome: "warn",
    codingGuidance: 'Use CSS variables for colors (var(--ggui-color-*)); use the spacing scale for gap/padding/margin (gap="md", padding="lg").',
    evalInstruction: 'Flag hardcoded hex colors, rgba/hsl functions, and numeric or raw-CSS-length spacing props. A t-shirt-scale spacing name (gap="md") IS a token \u2014 never flag it.'
  },
  // ── P2: Quality (nice to have — failure = lower score, not broken) ──
  {
    id: "interactivity",
    name: "Sufficient interactive elements",
    priority: "P2",
    tier: 2,
    failOutcome: "warn",
    codingGuidance: "Add appropriate interactive elements for the component purpose.",
    evalInstruction: `Evaluate INTERACTIVITY: Does this component have sufficient interactive elements?

Consider: forms need submit buttons, lists need selection, editable content needs save/cancel.
Contract actions (if present): every useAction hook should be triggered by a visible UI element.

Only list MISSING interactive elements. Use 'fail' only for issues blocking core purpose.`
  },
  {
    id: "accessibility",
    name: "Accessible markup",
    priority: "P2",
    tier: 2,
    failOutcome: "warn",
    codingGuidance: "Add labels on form inputs, alt text on images, semantic HTML.",
    evalInstruction: `Evaluate ACCESSIBILITY: missing labels, alt text, semantic HTML, keyboard support.

ggui primitives bake in their own ARIA \u2014 see "Primitive Accessibility" in the Design System context above. NEVER flag a ggui primitive (Input/Select/TextArea, RadioGroup, Checkbox, Toggle, Progress, Slider, Spinner, Skeleton, Tabs, Accordion, Alert, Toast, Tooltip, Clickable, Icon) for a missing role / aria-* / label / keyboard handler \u2014 it is already there and not visible in the source you are reading.

Flag ONLY real gaps: a raw div/span used as an interactive control; an image with no alt text; an Input/Select/TextArea with no \`label\` prop; an icon-only Button with no aria-label; live/streaming data not wrapped in an aria-live region; inverted heading hierarchy.

Only list MISSING accessibility features. Use 'fail' only if it blocks delivery.`
  },
  {
    id: "layout",
    name: "Clean layout",
    priority: "P2",
    tier: 2,
    failOutcome: "warn",
    codingGuidance: "Use proper spacing and visual grouping.",
    evalInstruction: `Evaluate LAYOUT: Check spacing, alignment, visual grouping, and composition.

Only list ACTUAL layout problems. Use 'fail' only for fundamentally broken layouts.`
  },
  {
    id: "loading",
    name: "Loading/empty/error states",
    priority: "P2",
    tier: 2,
    failOutcome: "warn",
    codingGuidance: "Handle async data, empty collections, and error cases.",
    evalInstruction: `Evaluate LOADING/EMPTY/ERROR STATES: Does the component handle async data and edge cases?

Contract-specific: useStream should handle pre-data state. clientCapabilities hooks may return undefined / permission-denied \u2014 defensive guards expected before threading values into JSX.
Props-only components (no async, no streams, no client capabilities) do NOT need loading states \u2014 return pass.

Only list MISSING states.`
  },
  {
    id: "visual",
    name: "Design system consistency",
    priority: "P2",
    tier: 2,
    failOutcome: "warn",
    codingGuidance: "Use design system tokens consistently.",
    evalInstruction: `Evaluate VISUAL CONSISTENCY: Is the component using the design system correctly?

Flag: hardcoded colors instead of CSS variables, numeric or raw-CSS-length spacing instead of the t-shirt scale, style objects bypassing design system.
A t-shirt-scale spacing name (gap="md", padding="lg") IS correct token usage \u2014 never flag it.
Intentional custom colors (status indicators) are acceptable when no semantic token fits.

Only list ACTUAL violations. Use 'fail' only for pervasive violations.`
  }
];
function getCriteriaByPriority(priority) {
  return CRITERIA.filter((c) => c.priority === priority);
}
function buildCodingCriteriaSummary() {
  const lines = ["## Priority (P0 first, then P1, then P2)", ""];
  for (const priority of ["P0", "P1", "P2"]) {
    const label = priority === "P0" ? "Must (compile + complete)" : priority === "P1" ? "Should (safety)" : "Nice (quality)";
    const criteria = getCriteriaByPriority(priority);
    lines.push(`**${priority} \u2014 ${label}:**`);
    for (const c of criteria) {
      lines.push(`- ${c.codingGuidance}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
var VIRTUAL_DTS_PATH = "/__gadget__.d.ts";
var EXTRACTOR_COMPILER_OPTIONS = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowJs: false,
  jsx: ts.JsxEmit.ReactJSX,
  noEmit: true,
  esModuleInterop: true,
  // skipLibCheck so an unresolvable wrapper-internal import (the
  // sandbox doesn't carry the wrapper's transitive deps) doesn't abort
  // the program before we can read the symbol's callable signature.
  skipLibCheck: true,
  strict: true
};
var callSignatureCache = /* @__PURE__ */ new Map();
var componentPropsCache = /* @__PURE__ */ new Map();
function buildExtractorContext(dtsContent, names) {
  const sourceFile = ts.createSourceFile(
    VIRTUAL_DTS_PATH,
    dtsContent,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */
    true,
    ts.ScriptKind.TS
  );
  const defaultLibName = ts.getDefaultLibFileName(EXTRACTOR_COMPILER_OPTIONS);
  const host = {
    getSourceFile(fileName) {
      if (fileName === VIRTUAL_DTS_PATH) return sourceFile;
      const libContent = ts.sys.readFile(
        ts.getDefaultLibFilePath(EXTRACTOR_COMPILER_OPTIONS).replace(
          /[^/\\]+$/,
          fileName
        )
      );
      if (libContent !== void 0) {
        return ts.createSourceFile(
          fileName,
          libContent,
          ts.ScriptTarget.ESNext,
          true,
          ts.ScriptKind.TS
        );
      }
      return void 0;
    },
    getDefaultLibFileName() {
      return defaultLibName;
    },
    writeFile() {
    },
    getCurrentDirectory() {
      return "/";
    },
    getCanonicalFileName(f) {
      return f;
    },
    useCaseSensitiveFileNames() {
      return true;
    },
    getNewLine() {
      return "\n";
    },
    fileExists(f) {
      if (f === VIRTUAL_DTS_PATH) return true;
      return ts.sys.fileExists(f);
    },
    readFile(f) {
      if (f === VIRTUAL_DTS_PATH) return dtsContent;
      return ts.sys.readFile(f);
    }
  };
  const program = ts.createProgram(
    [VIRTUAL_DTS_PATH],
    EXTRACTOR_COMPILER_OPTIONS,
    host
  );
  const checker = program.getTypeChecker();
  const parsed = program.getSourceFile(VIRTUAL_DTS_PATH);
  if (parsed === void 0) {
    return void 0;
  }
  const requested = new Set(names);
  function isWrapperLocal(symbol) {
    const decls = symbol?.getDeclarations();
    if (decls === void 0) return false;
    return decls.some((d) => d.getSourceFile().fileName === VIRTUAL_DTS_PATH);
  }
  const MAX_DEPTH = 4;
  function renderType(t, depth) {
    const plain = () => checker.typeToString(t, void 0, ts.TypeFormatFlags.NoTruncation);
    if (depth >= MAX_DEPTH) return plain();
    if ((t.getFlags() & ts.TypeFlags.Boolean) !== 0) return "boolean";
    if (t.isUnion()) {
      return t.types.map((member) => renderType(member, depth)).join(" | ");
    }
    if (t.isIntersection()) {
      return t.types.map((member) => renderType(member, depth)).join(" & ");
    }
    const symbol = t.getSymbol() ?? t.aliasSymbol;
    const callSigs = t.getCallSignatures();
    if (callSigs.length > 0) {
      const cs = callSigs[0];
      const params = cs.getParameters().map((p) => {
        const decl = p.valueDeclaration ?? p.declarations?.[0];
        const pType = decl !== void 0 ? checker.getTypeOfSymbolAtLocation(p, decl) : checker.getDeclaredTypeOfSymbol(p);
        const optional = decl !== void 0 && ts.isParameter(decl) && (decl.questionToken !== void 0 || decl.initializer !== void 0);
        return `${p.getName()}${optional ? "?" : ""}: ${renderType(pType, depth + 1)}`;
      }).join(", ");
      const ret = renderType(cs.getReturnType(), depth + 1);
      return `(${params}) => ${ret}`;
    }
    const isObject = (t.getFlags() & ts.TypeFlags.Object) !== 0;
    const isArrayOrTuple = checker.isArrayType(t) || checker.isTupleType(t);
    const typeArgs = t.typeArguments;
    if (symbol !== void 0 && isObject && !isArrayOrTuple && !isWrapperLocal(symbol) && typeArgs !== void 0 && typeArgs.length > 0) {
      const args = typeArgs.map((a) => renderType(a, depth + 1)).join(", ");
      return `${symbol.getName()}<${args}>`;
    }
    if (symbol !== void 0 && isObject && !isArrayOrTuple && isWrapperLocal(symbol)) {
      const props = checker.getPropertiesOfType(t);
      if (props.length > 0) {
        const body = props.map((p) => {
          const decl = p.valueDeclaration ?? p.declarations?.[0];
          const pType = decl !== void 0 ? checker.getTypeOfSymbolAtLocation(p, decl) : checker.getDeclaredTypeOfSymbol(p);
          const optional = (p.getFlags() & ts.SymbolFlags.Optional) !== 0;
          return `${p.getName()}${optional ? "?" : ""}: ${renderType(pType, depth + 1)}`;
        }).join("; ");
        return `{ ${body} }`;
      }
    }
    return plain();
  }
  const moduleSymbol = checker.getSymbolAtLocation(parsed);
  const exportSymbols = moduleSymbol !== void 0 ? checker.getExportsOfModule(moduleSymbol) : [];
  const signaturesByName = /* @__PURE__ */ new Map();
  for (const symbol of exportSymbols) {
    const name = symbol.getName();
    if (!requested.has(name)) continue;
    if (signaturesByName.has(name)) continue;
    const resolved = (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
    const declarations = resolved.getDeclarations();
    if (declarations === void 0 || declarations.length === 0) continue;
    const declaration = declarations[0];
    const type = checker.getTypeOfSymbolAtLocation(resolved, declaration);
    const callSignatures = type.getCallSignatures();
    if (callSignatures.length === 0) continue;
    signaturesByName.set(name, callSignatures);
  }
  return { checker, renderType, signaturesByName };
}
function printCallSignature(sig, ctx) {
  const params = sig.getParameters().map((p) => {
    const decl = p.valueDeclaration ?? p.declarations?.[0];
    const pType = decl !== void 0 ? ctx.checker.getTypeOfSymbolAtLocation(p, decl) : ctx.checker.getDeclaredTypeOfSymbol(p);
    const optional = decl !== void 0 && ts.isParameter(decl) && (decl.questionToken !== void 0 || decl.initializer !== void 0);
    return `${p.getName()}${optional ? "?" : ""}: ${ctx.renderType(pType, 0)}`;
  }).join(", ");
  const ret = ctx.renderType(sig.getReturnType(), 0);
  return `(${params}) => ${ret}`.trim();
}
function printComponentProps(sig, ctx) {
  const params = sig.getParameters();
  if (params.length === 0) return "{}";
  const propsParam = params[0];
  const decl = propsParam.valueDeclaration ?? propsParam.declarations?.[0];
  const propsType = decl !== void 0 ? ctx.checker.getTypeOfSymbolAtLocation(propsParam, decl) : ctx.checker.getDeclaredTypeOfSymbol(propsParam);
  const rendered = ctx.renderType(propsType, 0);
  if (rendered.length === 0 || rendered.includes('import("')) return void 0;
  return rendered;
}
function extractCallSignaturesFromDts(dtsContent, hookNames) {
  if (hookNames.length === 0 || dtsContent.trim().length === 0) {
    return {};
  }
  const cacheKey = `${dtsContent}\0${[...hookNames].sort().join(",")}`;
  const cached = callSignatureCache.get(cacheKey);
  if (cached !== void 0) return cached;
  const result = {};
  const ctx = buildExtractorContext(dtsContent, hookNames);
  if (ctx === void 0) {
    callSignatureCache.set(cacheKey, result);
    return result;
  }
  for (const [name, signatures] of ctx.signaturesByName) {
    const printed = signatures.map((sig) => printCallSignature(sig, ctx)).filter((s) => s.length > 0 && !s.includes('import("')).join(" | ");
    if (printed.length > 0) {
      result[name] = printed;
    }
  }
  callSignatureCache.set(cacheKey, result);
  return result;
}
function extractComponentPropsFromDts(dtsContent, componentNames) {
  if (componentNames.length === 0 || dtsContent.trim().length === 0) {
    return {};
  }
  const cacheKey = `${dtsContent}\0${[...componentNames].sort().join(",")}`;
  const cached = componentPropsCache.get(cacheKey);
  if (cached !== void 0) return cached;
  const result = {};
  const ctx = buildExtractorContext(dtsContent, componentNames);
  if (ctx === void 0) {
    componentPropsCache.set(cacheKey, result);
    return result;
  }
  for (const [name, signatures] of ctx.signaturesByName) {
    const first = signatures[0];
    if (first === void 0) continue;
    const props = printComponentProps(first, ctx);
    if (props !== void 0) {
      result[name] = props;
    }
  }
  componentPropsCache.set(cacheKey, result);
  return result;
}

// src/boilerplate/system-prompt.ts
function isHookExport(exp) {
  return "hook" in exp;
}
function isComponentExport(exp) {
  return "component" in exp;
}
var SHELL_DESCRIPTIONS = {
  chat: "inline component inside ChatShell message bubble (~400px wide, compact)",
  fullscreen: "full viewport, responsive layout",
  spatial: "floating AR/VR panel (~600px, touch-friendly)"
};
var SCREEN_DESCRIPTIONS = {
  mobile: "single column, large touch targets",
  tablet: "flexible columns, medium spacing",
  desktop: "multi-column, dense layout",
  universal: "responsive across all breakpoints"
};
function formatGadgetsSection(appGadgets, gadgetTypes) {
  if (appGadgets.length === 0) {
    return [
      "When the contract declares a `clientCapabilities.gadgets` entry,",
      "the hook MUST be one the operator has registered on",
      "`App.gadgets`. The default ggui server seeds the 7",
      "first-party STDLIB hooks; this server has none registered (the",
      "operator's `ggui.json#app.gadgets` is empty). Don't",
      "declare `clientCapabilities.gadgets` until a hook is registered."
    ].join(" ");
  }
  const hookExports = appGadgets.flatMap(
    (descriptor) => descriptor.exports.filter(isHookExport).map((exp) => ({ exp, descriptor }))
  );
  const componentExports = appGadgets.flatMap(
    (descriptor) => descriptor.exports.filter(isComponentExport).map((exp) => ({ exp, descriptor }))
  );
  const header = "When the contract declares a hook gadget on `clientCapabilities.gadgets`, the hook MUST be one of the registered hooks below. The boilerplate has already emitted a direct import per gadget package \u2014 `import { <hook>, \u2026 } from '<package>'` \u2014 above a `// DO NOT EDIT` banner. KEEP those imports exactly; they are the runtime-resolution anchor and self_check rejects the code if one disappears. Import each STDLIB hook from `@ggui-ai/gadgets`; import each third-party hook from the package named in the `Package` column. DO NOT invent your own import paths. Available registered hooks:";
  const tableHead = [
    "| Hook                  | Package (import from here)         | Permission         | What it does                                |",
    "| --------------------- | ---------------------------------- | ------------------ | ------------------------------------------- |"
  ];
  const rows = hookExports.map(({ exp, descriptor }) => {
    const hookCol = `\`${exp.hook}\``.padEnd(21, " ");
    const pkgCol = `\`${descriptor.package}\``.padEnd(34, " ");
    const permCol = exp.permission ? `\`${exp.permission}\``.padEnd(18, " ") : "(none)".padEnd(18, " ");
    const what = (exp.usage ?? exp.description ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    return `| ${hookCol} | ${pkgCol} | ${permCol} | ${what.padEnd(43, " ")} |`;
  });
  const typeLines = [];
  if (gadgetTypes !== void 0) {
    for (const { exp, descriptor } of hookExports) {
      const dts = gadgetTypes[descriptor.package];
      if (dts === void 0) continue;
      const signatures = extractCallSignaturesFromDts(dts, [exp.hook]);
      const sig = signatures[exp.hook];
      if (sig === void 0) continue;
      typeLines.push(`- \`${exp.hook}\`: \`${sig}\``);
    }
  }
  const typeBlock = typeLines.length > 0 ? [
    "",
    "**Type** (third-party gadgets \u2014 call signature from the wrapper's published `.d.ts`):",
    "",
    ...typeLines
  ] : [];
  const hookSection = hookExports.length > 0 ? [header, "", ...tableHead, ...rows, ...typeBlock].join("\n") : "";
  const componentRows = componentExports.map(({ exp, descriptor }) => {
    const compCol = `\`${exp.component}\``.padEnd(21, " ");
    const pkgCol = `\`${descriptor.package}\``.padEnd(34, " ");
    const what = (exp.usage ?? exp.description ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    return `| ${compCol} | ${pkgCol} | ${what.padEnd(53, " ")} |`;
  });
  const componentPropsLines = [];
  if (gadgetTypes !== void 0) {
    for (const { exp, descriptor } of componentExports) {
      const dts = gadgetTypes[descriptor.package];
      if (dts === void 0) continue;
      const propsMap = extractComponentPropsFromDts(dts, [exp.component]);
      const props = propsMap[exp.component];
      if (props === void 0) continue;
      componentPropsLines.push(`- \`${exp.component}\`: \`${props}\``);
    }
  }
  const componentPropsBlock = componentPropsLines.length > 0 ? [
    "",
    "**Props** (third-party component gadgets \u2014 prop shape from the wrapper's published `.d.ts`):",
    "",
    ...componentPropsLines
  ] : [];
  const componentSection = componentExports.length > 0 ? [
    "When the contract declares a component gadget on `clientCapabilities.gadgets`, the export is a COMPONENT \u2014 RENDER it as a JSX element (`<X \u2026 />`) in the tree you return. Do NOT call it like a hook. The boilerplate has already emitted a direct import per gadget package \u2014 `import { <Component>, \u2026 } from '<package>'` \u2014 above a `// DO NOT EDIT` banner. KEEP those imports exactly; they are the runtime-resolution anchor and self_check rejects the code if one disappears. Import each component from the package named in the `Package` column. Available registered components:",
    "",
    "| Component             | Package (import from here)         | What it does                                          |",
    "| --------------------- | ---------------------------------- | ----------------------------------------------------- |",
    ...componentRows,
    ...componentPropsBlock
  ].join("\n") : "";
  return [hookSection, componentSection].filter((section) => section.length > 0).join("\n\n");
}
function buildSystemPrompt(inputs) {
  const shell = inputs.shellType ?? "fullscreen";
  const scr = inputs.screen ?? "universal";
  const shellDesc = SHELL_DESCRIPTIONS[shell] ?? SHELL_DESCRIPTIONS.fullscreen;
  const screenDesc = SCREEN_DESCRIPTIONS[scr] ?? SCREEN_DESCRIPTIONS.universal;
  const criteriaBlock = inputs.criteriaBlock ?? buildCodingCriteriaSummary();
  const pitfallsBlock = inputs.pitfallsBlock ?? "";
  const designSystemDocs = inputs.designSystemDocs ?? "";
  const primitivesDoc = inputs.primitivesDoc ?? "";
  const wireDoc = inputs.wireDoc ?? "";
  const gadgetsSection = formatGadgetsSection(
    inputs.appGadgets ?? STDLIB_GADGETS,
    inputs.gadgetTypes
  );
  const axisSection = inputs.axisDelta && inputs.axisDelta.trim().length > 0 ? `
## Shape Guidance
${inputs.axisDelta}
` : "";
  return `You are ggui's UI builder. You receive a typed boilerplate and fill it in using apply_changes.

## Your Task
${inputs.userRequest}

## Rendering Context
- **Shell**: \`${shell}\` \u2014 ${shellDesc}
- **Screen**: \`${scr}\` \u2014 ${screenDesc}

## How It Works
1. Read the boilerplate \u2014 typed Props, wire hooks, and layout container are pre-configured
2. Respond with one apply_changes call \u2014 add state, helpers, and JSX
3. If compilation or evaluation fails, you'll get errors to fix in the next turn

${criteriaBlock}
${axisSection}
## Protocol Notes
The boilerplate pre-declares every wire hook the contract requires (\`useAction\`, \`useStream\`, \`useGguiContext\`, plus capability hooks from \`@ggui-ai/gadgets\` when the contract declares \`clientCapabilities\`). Three rules:
1. **Do NOT delete any pre-declared hook.** \`self_check\` fails with \`wire_preservation:<kind>:<name>\` if you remove one.
2. **Consume every hook binding** somewhere in the component \u2014 in JSX, a callback, or an effect. Unused bindings fail lint with \`no-unused-vars\`.
3. **Do NOT invent new wire calls.** Every \`useAction('X')\`, \`useStream('X')\`, \`useGguiContext('X')\` etc. MUST correspond to a declared entry on the contract. Calling one that isn't declared fails \`self_check\` with \`wire_undeclared:<kind>:<name>\` because the runtime has no Context/registration for it and would throw at first paint. If you need a new wire surface, that's a contract authoring step the agent owns \u2014 your job is to honor what's declared.

Renaming a binding is fine \u2014 the wiring is the string-literal argument, not the identifier.

## Contract surface \u2014 four specs + two catalogs

A \`DataContract\` declares everything a render exchanges with the outside world. **Four typed specs** for the four data-flow directions, **two reference catalogs** for tool / hook lookups:

| Surface              | Direction                  | Role                                                                 |
| -------------------- | -------------------------- | -------------------------------------------------------------------- |
| \`propsSpec\`         | server \u2192 UI (one-shot)     | Initial render values delivered once at \`ggui_render\`              |
| \`streamSpec\`        | agent \u2192 UI (many)          | Typed channels for live updates via \`ggui_emit\`                    |
| \`actionSpec\`        | UI \u2192 agent (events)        | Discrete events driving the agent's next turn (consumed via \`ggui_consume\`) |
| \`contextSpec\`       | UI \u2192 server (state mirror) | UI state the agent observes between turns                            |
| \`agentCapabilities.tools\`     | catalog                    | Tools the contract references via \`actionSpec[*].nextStep\` and \`streamSpec[*].source.tool\` |
| \`clientCapabilities.gadgets\` | catalog                    | Browser-capability gadget hooks the component code mounts (e.g., \`useGeolocation\`) |

**Placement rule for inbound specs**: actions drive turns; context observes state. There is no third category.

**Data vs behavior**: the contract describes data flow; the component code describes behavior. Scroll, focus, toast, animation, clipboard write \u2014 all component code, never contract fields.

## Defensive coding for absent / late-arriving data

Props arrive via \`ggui_update\` and may be partial on first render. Stream channels start empty and fill over time. Context slots start at their declared default (often \`null\`). **Never assume a field exists before you read it.**

- **Array iteration**: always default to \`[]\` before \`.map\`/\`.filter\`/\`.length\`. Use \`(props.items ?? []).map(...)\` not \`props.items.map(...)\`. Same for stream.history, stream.latest, etc.
- **Object access**: optional-chain through nested fields. \`props.user?.name ?? 'Anonymous'\` not \`props.user.name\`.
- **Number ops**: default before arithmetic. \`(props.count ?? 0) + 1\` not \`props.count + 1\`.
- **Stream latest**: \`useStream\` returns \`{latest: T | undefined, history: T[]}\`. The default \`history\` is \`[]\` so it's safe to map; \`latest\` is undefined until the first frame arrives \u2014 guard before reading \`.foo\`.
- **Stream reconciliation**: when a stream event carries an \`action\` discriminant (e.g. \`create | move | edit | delete\`), the channel is a CRUD feed \u2014 your handler MUST branch on EVERY value: append on \`create\`, drop on \`delete\`, replace-by-id on \`move\` / \`edit\`. Merging only the "edit" case silently loses created and deleted items. Reconcile into the SAME state that seeds from \`props\` (e.g. \`useState(() => props.tasks ?? [])\`) so the seed data and the live feed render as one list \u2014 and handle an event whose id is not yet present (a \`create\` for an unknown item) by inserting it, not ignoring it.
- **Loading state**: while data is still absent, render \`<Skeleton>\` placeholders \u2014 never a blank screen. \`<Skeleton variant="text" />\` for a text line, \`variant="circle"\` for an avatar slot, default \`rect\` for a block.
- **Empty state**: when a list or results array is empty, render \`<EmptyState title="\u2026" description="\u2026" />\` \u2014 a region that renders nothing when empty looks broken to the user.

Unhandled \`Cannot read properties of undefined\` errors trip the iframe error boundary and the user sees "Something went wrong" \u2014 a regression class the runtime can't recover from.

## Picking the right primitive for user gestures

Choose by what the user is DOING, not where the result goes \u2014 the runtime handles the routing.

| Gesture intent | LLM writes | Notes |
| -------------- | ---------- | ----- |
| Fire a server-side action | \`useAction(name)\` + call \`dispatch(name, payload)\` | Every action is agent-routed. The runtime emits an event on \`ggui_consume\`; the agent reacts on its next turn. If the contract entry declares \`nextStep: 'X'\`, that names the tool the agent SHOULD call next \u2014 advisory hint forwarded as event metadata. |
| Surface state to the agent's context | the auto-generated \`setSlotName\` setter (from the boilerplate's \`useGguiContext\` line) | The runtime owns useState + Provider; the boilerplate emits one \`const [slot, setSlot] = useGguiContext<T>('slot')\` line per declared \`contextSpec\` slot. Write plain JSX, no \`useState\`, no Provider wrap. Every value change auto-flows to the host LLM (debounced). One-way client \u2192 agent \u2014 see "Observable state via \`contextSpec\`" below. |
| Use a browser capability (camera, mic, geolocation, clipboard, file picker, notifications) | call the hook the contract declared, e.g., \`const loc = useGeolocation();\` and \`await loc.start()\` | The contract's \`clientCapabilities.gadgets\` declares which gadget exports the UI uses. The hook implementations live in \`@ggui-ai/gadgets\` (or a third-party package named in the \`Package\` column). Read \`status\` ("idle" / "prompting" / "active" / "completed" / "denied" / "error") to gate UI, and thread the resolved \`value\` into a contextSpec slot or actionSpec payload if the agent needs to see it. |
| Open external link | Plain \`<a href="https://...">\` (or \`target="_blank"\`) | External cross-origin clicks are intercepted and routed through the host (security warnings, app-internal navigation, audit). Same-origin links and \`#fragment\` jumps stay native. |
| Toggle fullscreen / chrome | Plain \`el.requestFullscreen()\` / \`document.exitFullscreen()\` | The native browser API is intercepted; the host adjusts iframe chrome accordingly. Returns a resolved promise so \`.then()\` / \`await\` chains don't break. |

Every gesture fires a uniform server-side audit envelope (\`ggui_runtime_submit_action\`) so operators see all three patterns in RenderInspector with the same shape.

**Don't import wire hooks for link / display-mode.** \`useAction\` is the only wire hook for user gestures; links and fullscreen use plain HTML / browser APIs.

**All actions are agent-routed.** Every action emits an event the agent reacts to on its next turn via \`ggui_consume\`. The optional \`nextStep: '<tool>'\` field on an \`actionSpec\` entry is a HINT naming the tool the agent SHOULD call next \u2014 the contract author's recommendation, NOT a binding directive. The agent decides whether to honor it. If you want to declare a tool catalog entry the contract references, add it to \`agentCapabilities.tools[<name>]\` with input/output schemas; the cross-ref linter rejects dangling \`nextStep\` values that don't resolve to a declared catalog entry.

## Making a primitive interactive \u2014 \`as={Trait}\`

Structural primitives (\`Box\`, \`Stack\`, \`Row\`, \`Card\`) have NO \`onClick\` by default. Add interactivity with the \`as\` prop \u2014 a trait, not a wrapper:

\`\`\`tsx
<Card as={Clickable} onClick={() => dispatch('select', { id })}
      hoverStyle={{ boxShadow: 'var(--ggui-shape-shadow-lg)' }}>\u2026</Card>
\`\`\`

- \`as={Clickable}\` \u2192 \`onClick\` + keyboard activation (Enter/Space) + \`role="button"\` + \`hoverStyle\`/\`activeStyle\`/\`cursor\`.
- \`as={Hoverable}\` \u2192 \`hoverStyle\` only (no click). \`as={Pressable}\` \u2192 \`onPress\` + \`pressStyle\`.

\`as={Trait}\` is a PROP \u2014 it does NOT re-nest the JSX. Never write \`<Clickable>\u2026</Clickable>\` around a primitive; put \`as={Clickable}\` on the primitive itself. The trait carries the keyboard + ARIA wiring, so don't hand-write \`onKeyDown\` / \`role\`. Trait components (\`Clickable\`, \`Hoverable\`, \`Pressable\`) import from \`@ggui-ai/design\` like everything else \u2014 the boilerplate already imports them.

**Semantic components are already interactive** \u2014 \`Button\` (\`onClick\`), \`Link\` (\`href\`), \`Input\` / \`Select\` (\`onChange\`). Use their own props; never put \`as\` on them. \`Text\` picks its element with \`is\` (\`<Text is="label">\`), not \`as\`.

**Never nest two interactive elements.** Interactive content MUST NOT contain other interactive content \u2014 a gesture on the inner control bubbles to the outer one and fires BOTH handlers (one user click \u2192 the action dispatched twice). Do NOT put a \`Button\`, \`Checkbox\`, \`Input\`, \`Select\`, \`Link\`, or another \`as={Clickable}\` primitive inside a \`Card\` / \`Box\` / \`Row\` / \`Stack\` that is itself \`as={Clickable}\`. Wire each \`useAction\` callback to exactly ONE surface: EITHER the whole card is the trigger (interactive container, no interactive children) OR an inner control is the trigger (plain container, no \`as={Clickable}\`) \u2014 never both. A row with a checkbox: put the action on the \`Checkbox onChange\` and leave the row plain.

**\`Text\` / \`Heading\` accept NO event handlers and NO \`as\` \u2014 only \`style\` / \`className\` plus their own typed props.** \`onClick\`, \`onDoubleClick\`, \`as={Clickable}\`, \`color\` are all type errors on \`Text\`. When the request says a label is "clickable", "editable", "edit on click / double-click", or "tap to \u2026", do ONE of these \u2014 never put the handler on \`Text\`:

\`\`\`tsx
// Click-to-edit a label: wrap the Text in a Clickable structural primitive.
<Box as={Clickable} onClick={() => setEditingId(task.id)}
     style={{ cursor: 'pointer' }}>
  <Text weight="semibold">{task.title}</Text>
</Box>

// Or pair the label with an explicit edit Button (clearer affordance).
<Row gap="xs" align="center">
  <Text weight="semibold">{task.title}</Text>
  <Button variant="ghost" size="xs" aria-label="Edit title"
          onClick={() => setEditingId(task.id)}>Edit</Button>
</Row>

// In edit mode, swap the Text for an Input.
{editingId === task.id
  ? <Input value={draftTitle} onChange={setDraftTitle} label="Task title" />
  : <Text weight="semibold">{task.title}</Text>}
\`\`\`

## Anti-patterns \u2014 DO NOT WRITE

The following identifiers / shapes are RETIRED from the contract surface as of 2026-05-11. Pre-2026-05-11 examples in your training data may include them; do not reproduce. The linter / CI grep gate rejects:

- \`useWiredTool\`, \`useClientTool\` \u2014 retired hooks. Replace with \`useAction\` (events) and the named hook from \`@ggui-ai/gadgets\` (browser capabilities).
- \`dispatch: { kind: 'tool', tool: '...' }\` / \`dispatch: { kind: 'agent', intendedTool: '...' }\` \u2014 retired discriminated-union. Use the flat optional \`nextStep?: '<tool>'\` instead.
- \`mode: 'host-routed'\` / \`mode: 'tool'\` \u2014 retired \`mode\` field. Same fix: flat \`nextStep?\`.
- \`broadcast: {...}\` on the contract \u2014 retired top-level field. Use \`streamSpec[channel].source: {tool, args?}\` to declare a tool-fed channel.
- \`wiredTools\` / \`agentTools\` (top-level) \u2014 retired catalog names. Use \`agentCapabilities.tools\`.
- \`clientTools\` / \`clientCapabilities.capabilities\` \u2014 retired catalog shapes. Use \`clientCapabilities.gadgets\` (entries declare hooks, not RPC).
- \`@ggui-ai/client-tools\` \u2014 retired package name. Import gadget hooks from \`@ggui-ai/gadgets\`.
- \`intendedTool\` \u2014 retired. Use \`nextStep\` (flat).
- \`props: { properties: {...} }\` as a CONTRACT field \u2014 retired. The contract field is \`propsSpec\` (the wire \`props\` field on push / update still carries VALUES).

## Cross-reference rules

When you declare a reference, also declare the catalog entry it points at:

- \`actionSpec[X].nextStep = 'fetch_inbox'\` \u2192 \`agentCapabilities.tools.fetch_inbox = { inputSchema, outputSchema?, usage?, example? }\` MUST exist. Cross-ref code: \`CTR_REF_NEXT_STEP\`.
- \`streamSpec[X].source.tool = 'list_messages'\` \u2192 \`agentCapabilities.tools.list_messages\` MUST exist. Cross-ref code: \`CTR_REF_STREAM_SOURCE\`.
- The catalog entry's schemas MUST be a superset of the referencing spec's schema. Cross-ref code: \`CTR_SCHEMA_INCOMPAT\`.

## clientCapabilities \u2014 registered catalog

${gadgetsSection}

Each hook conforms to \`GadgetHook<TOutput, TOptions>\`: call \`start(opts?)\` to fire, read \`{value, status, error, stop?}\`. \`status\` walks through \`idle \u2192 prompting \u2192 active|completed\` or routes to \`denied\` / \`error\` on failure.

3rd-party plugins (Leaflet maps, Mapbox, Stripe, Chart.js, \u2026) are registered via \`createGguiGadget\` from \`@ggui-ai/gadgets\` and surface in this same table when the operator has added them to \`App.gadgets\`. Reference any registered hook by name \u2014 render validation rejects hooks not in this catalog with \`gadget_not_registered\`.

## Observable state via \`contextSpec\`

When the contract declares \`contextSpec\`, the boilerplate auto-generates one \`useGguiContext\` call per slot at the top of your component. The runtime owns the underlying \`useState\` and the Provider tree \u2014 **you do NOT write \`useState\` or any \`<Provider>\` wrap yourself**:

\`\`\`tsx
import { useGguiContext } from '@ggui-ai/wire';

export default function Component(props: Props) {
  // AUTO-GENERATED \u2014 do not remove or rename:
  const [currentStep, setCurrentStep] = useGguiContext<number>('currentStep');
  const [draftText, setDraftText] = useGguiContext<string>('draftText');

  // Plain JSX. No Provider wrap. The runtime already wrapped your
  // component in nested SingleSlotProviders before this code ran.
  return (
    <Container>
      <Text>Step {currentStep}</Text>
      <Input value={draftText} onChange={(e) => setDraftText(e.target.value)} />
      <Button onClick={() => setCurrentStep((s) => s + 1)}>Next</Button>
    </Container>
  );
}
\`\`\`

For every declared slot you have **\`slotName\` + \`setSlotName\`** in scope:
- **Read** the value to render: \`<Text>Step {currentStep}</Text>\`
- **Write** via the setter: \`setCurrentStep(s => s + 1)\` (in callbacks, effects, anywhere)

Every value change is mirrored to the host LLM's context automatically (debounced, default 300ms \u2014 adjustable per-slot via \`entry.debounceMs\` in the contract). The agent sees the user's interaction state \u2014 drafts, current step, hover, selection \u2014 without you calling any API.

**When to use the auto-generated state.** Any slot the contract declared. If \`contextSpec.draftText\` exists, bind \`<Input value={draftText} onChange={e => setDraftText(e.target.value)}>\` so the agent sees the typing live. If \`contextSpec.currentStep\` exists, render the step indicator from \`currentStep\` and bump it via \`setCurrentStep\` in your "next" callback.

**When NOT to use it.** Local UI state the contract did NOT declare \u2014 \`isDropdownOpen\`, hover flags, animation phase, ephemeral toggles. For those, use a plain \`useState\` directly. The runtime ignores undeclared state.

**\`contextSpec\` direction is one-way: client \u2192 agent.** The agent uses \`propsSpec\` (via \`ggui_update\`) and \`streamSpec\` (via the live channel) to push state TO the client. Don't try to write to the agent via \`contextSpec\` \u2014 there is no return path.

**Schema mismatches drop silently.** If you set a value that doesn't match the slot's schema (e.g. a string into a \`{type: 'number'}\` slot), the runtime logs a dev \`console.warn\` and skips the post. Make sure your setter calls produce values that match the declared shape.

${pitfallsBlock}

## Reference: Wire Hooks
${wireDoc}

${DESIGN_SYSTEM_GUIDANCE}

### CSS Token Documentation
${designSystemDocs}

### Component Reference
${primitivesDoc}
`;
}
var DESIGN_SYSTEM_GUIDANCE = `## Imports & Component Surface

Import ONLY from: \`react\`, \`@ggui-ai/design\`, \`@ggui-ai/wire\`. The ENTIRE design system \u2014 every primitive, component, composition and trait \u2014 is exported from the single \`@ggui-ai/design\` entry: \`import { Card, Grid, Stack, Modal, Clickable } from '@ggui-ai/design'\`. There are NO subpaths (\`/primitives\`, \`/components\`, \u2026) \u2014 never import from them. Use the design components \u2014 DO NOT use raw HTML elements (\`<button>\`, \`<input>\`, \`<div>\` for layout) or Tailwind classes; those render unstyled in the iframe runtime.

Available primitives (all from \`@ggui-ai/design\`):
- Layout: Box, Container, Stack, Row, Grid, Spacer, Divider
- Typography: Heading, Text, Link
- Form: Button, Input, TextArea, Checkbox, Toggle, RadioGroup, Select, Slider
- Display: Card, Alert, Badge, Avatar, Image, Icon, Progress, Spinner, Skeleton, Tooltip
- Composite: Accordion, Tabs, Table, Toast

Available compound components (all from \`@ggui-ai/design\`):
- Autocomplete, Breadcrumb, Dropdown, EmptyState, FormField, MenuItem, Pagination, SearchField, Stat, Tag

**Choosing between similar components** \u2014 pick by intent, don't guess:
- **Pick from options**: one value from a short fixed list (a form field) \u2192 \`Select\`. Type-to-filter a long list, then pick \u2192 \`Autocomplete\`. A menu of actions off a button (edit / delete / \u2026) \u2192 \`Dropdown\`. A search box that filters displayed content \u2192 \`SearchField\`.
- **Tabular data** \u2192 \`Table\`. Reach for \`DataTable\` ONLY when you need built-in sorting / pagination / row-selection.
- **Messaging**: an inline message in the layout flow \u2192 \`Alert\`. A transient popup \u2192 \`Toast\`. A panel listing many notifications \u2192 \`NotificationCenter\`.
- **Containers**: width-constrain a page region \u2192 \`Container\`. A visually-contained surface (background + shadow + border) \u2192 \`Card\`. Plain grouping / spacing with no chrome \u2192 \`Box\`.

EXACT primitive prop values (other values are silently ignored \u2014 the design system maps them to defaults):
- \`<Text variant="...">\` \u2014 ONLY \`body | bodySmall | bodyLarge | caption | label | overline\`. NEVER \`body-md\`, \`body-sm\`, \`display-lg\`, \`display\`, \`title\`.
- \`<Text size="...">\` \u2014 ONLY \`xs | sm | base | lg | xl | 2xl | 3xl | 4xl\`. For a HUGE number/temperature, use \`<Text size="4xl" weight="bold">\`.
- \`<Text weight="...">\` \u2014 \`normal | medium | semibold | bold\`.
- \`<Text tone="...">\` \u2014 typed semantic slot. \`default | muted | subtle | emphasized | loud | success | warning | error | info | inverse | inherit\`. The theme decides what each tone LOOKS like \u2014 \`muted\` is a quiet warm grey on Claudic, a cool slate on Indigo. \`tone\` is the ONLY way to set Text color; the legacy \`color="..."\` prop has been removed.
- \`<Heading level={1|2|3|4|5|6}>\` \u2014 sizes are preset by level (h1 = 4xl bold, h2 = 3xl bold, h3 = 2xl semibold). Pass a number, not \`level="h1"\`. Heading uses the same \`tone\` slot vocabulary as Text.
- \`<Icon name="..." tone="...">\` / \`<Spinner tone="...">\` / \`<Link href="..." tone="...">\` / \`<Divider tone="...">\` \u2014 same \`tone\` vocabulary as Text. Default = \`currentColor\` (Icon), primary-tinted (Spinner / Link), outlineVariant (Divider). Use \`tone="inherit"\` when you want the element to track the parent's foreground color (e.g. an Icon next to muted text).
- \`<Button variant="...">\` \u2014 \`primary | secondary | outline | ghost | danger\`. Sizes \`xs | sm | md | lg\`. Use \`primary\` for the main action \u2014 renders in the brand color automatically.
- \`<Card padding="lg" shadow="md" radius="lg" surface="default">\` \u2014 shadow \`none|sm|md|lg|xl\`, radius \`none|sm|md|lg|xl\`. \`surface\` slot picks the fill: \`default | elevated | sunken | accent | inverted | transparent\`. Use \`inverted\` for dark testimonial-style cards on a light theme; \`accent\` for branded fills.
- \`<Box surface="...">\` \u2014 same surface slots as Card. \`surface\` is the ONLY theme-tracking background prop; the legacy \`background="..."\` prop has been removed. For non-theme-mapped brand colors (a partner's exact brand hex like Stripe purple), use the typed escape \`<Box assetColor="#635BFF" assetSemantic="stripe-brand-purple">\` \u2014 both props are required, and \`assetSemantic\` MUST be a non-empty human-readable label. Tier-0 self-check rejects every other hex / rgba on Box.
- \`<Stack gap="...">\` / \`<Row gap="...">\` \u2014 \`gap\` takes the **spacing scale** (next bullet). \`align\` (cross-axis) is ONLY \`start | center | end | stretch\` and \`justify\` (main-axis) is ONLY \`start | center | end | between | around | evenly\` \u2014 NEVER the raw CSS values \`flex-start\` / \`flex-end\` / \`space-between\`, which are type errors.
- **Spacing scale** \u2014 \`gap\` (Stack / Row / Grid) and \`padding\` (Card / Box / Container) take a t-shirt size: \`none | xs | sm | md | lg | xl | 2xl\`. Each resolves to a \`--ggui-spacing-*\` token (xs\u22484px, sm\u22488px, md\u224816px, lg\u224824px, xl\u224832px, 2xl\u224848px). A bare number is treated as pixels. NEVER pass a raw CSS length such as \`gap="8px"\` \u2014 it is silently dropped by the browser and the gap collapses to 0; use the scale name (\`gap="sm"\`).
- \`<Grid columns={N} gap="md">\` \u2014 2-D layout (rows AND columns). Reach for it for card galleries, stat grids and dashboards \u2014 NEVER hand-roll \`style={{ display: 'grid' }}\`. When the request names exact per-breakpoint counts ("3 per row on desktop, 1 on mobile"), pass a map: \`<Grid columns={{ base: 1, md: 3 }}>\` (breakpoints \`sm\`/\`md\`/\`lg\`/\`xl\`; the design system emits the media queries). For an open-ended gallery where any column count is fine, use \`<Grid minColumnWidth={220}>\` \u2014 it fits as many equal columns as the width allows. \`radius\` (Card / Box / Image) takes the scale \`none | sm | md | lg | xl\`.
- \`<Stat label="\u2026" value="\u2026" delta="+12%" trend="up">\` \u2014 KPI display (label + big value + trend-coloured delta + optional \`icon\`). \`trend\` is \`up | down | neutral\` (delta renders green / red / muted). Reach for it for any "show a number" UI; drop several into a \`<Grid>\` for a stat grid instead of hand-building label+value pairs.
- \`<Badge variant="...">\` \u2014 \`default | primary | secondary | success | warning | error | info\` for colored pills. Great for status/condition labels. There is NO \`neutral\` variant \u2014 use \`default\` (or \`secondary\`) for an un-tinted pill.

**Color choice rule of thumb.** Reach for typed slots first: Button \`variant\`, Badge \`variant\`, Alert \`variant\`, Text/Heading/Icon/Spinner/Link/Divider \`tone\`, Box/Card \`surface\`. NEVER hardcode hex \`#XXXXXX\`, rgba, or hsl \u2014 tier-0 self-check rejects them with \`tokens:hex-color\` / \`tokens:hardcoded-color-fn\` and the LLM must remediate. Hardcoded colors break the operator's theme switch (Indigo \u2192 Claudic \u2192 Cyberpunk preset has zero effect on a card hardcoded with \`background: '#000'\`).

**Asset-color escape (Box only).** When you genuinely need a non-theme color \u2014 a partner's exact brand hex (Stripe purple \`#635BFF\`, Slack aubergine \`#4A154B\`), a fixed product surface \u2014 use \`<Box assetColor="#635BFF" assetSemantic="stripe-brand-purple">\u2026</Box>\`. The \`assetSemantic\` is REQUIRED and MUST be a non-empty human-readable label that documents intent. Tier-0 allows hex inside this typed pair; one without the other fails the check. Reach for \`surface\` first \u2014 \`assetColor\` is rare.

## Accessibility (REQUIRED)

The design-system primitives are accessible by construction \u2014 they emit their own roles, labels, keyboard handlers, and error wiring. Your job is to USE them correctly, NOT to re-declare ARIA on top of them.

1. **Form inputs** \u2014 give every \`Input\` / \`TextArea\` / \`Select\` a \`label\` prop. The primitive renders its own \`<label htmlFor>\`, and exposes \`aria-invalid\` + \`aria-describedby\` for errors. Do NOT add a separate \`<Text>\` label or your own \`htmlFor\` \u2014 that double-labels the field.
   \`\`\`tsx
   <Input label="Email" value={email} onChange={setEmail} type="email" />
   \`\`\`
2. **Don't re-declare built-in ARIA.** \`Progress\`, \`RadioGroup\`, \`Tabs\`, \`Toggle\`, \`Slider\`, \`Spinner\`, \`Alert\`, \`Accordion\` already carry the correct \`role\` / \`aria-*\`. \`Card as={Clickable}\` already adds \`role="button"\` + keyboard activation. Adding your own is redundant and often wrong.
3. **Icons are decorative by default** \u2014 \`<Icon name="check" />\` is hidden from screen readers, which is correct for an icon sitting next to text. Add \`aria-label\` ONLY for a standalone, meaning-bearing icon with no adjacent text. Icon-only \`Button\`s still need \`aria-label\` on the **Button** itself.
4. **Live & streaming data** \u2014 wrap any region whose content updates on its own (a \`useStream\` \`.latest\` value, a live clock, an "N new" counter, a flashing price) in an element with \`aria-live="polite"\` so screen readers announce the change.
5. **Headings nest** \u2014 one \`<Heading level={1}>\` per screen, \`level={2}\` for sections, \`level={3}\` for subsections. Never skip or invert levels.
6. **Buttons** \u2014 descriptive text content; icon-only buttons need \`aria-label\`. Announce busy state: \`<Button disabled={isLoading} aria-busy={isLoading}>{isLoading ? 'Submitting\u2026' : 'Submit'}</Button>\`.

## Design System Usage (CRITICAL)

EVERY color, spacing, typography, shadow, and radius value MUST come from design-system CSS variables. The runtime injects them on \`:root\`.

MANDATORY:
1. NEVER use hardcoded hex colors like \`#7c3aed\` \u2014 ONLY \`var(--ggui-color-*)\` tokens.
2. NEVER use CSS gradients with custom colors. If you need a gradient: \`linear-gradient(to bottom, var(--ggui-color-primary-500, #0ea5e9), var(--ggui-color-primary-700, #0369a1))\`.
3. NEVER invent your own palette. The system provides primary, neutral, success, warning, error, and info \u2014 use ONLY these.
4. ALWAYS include fallback values: \`var(--ggui-color-primary-600, #0284c7)\`.

Token categories:
- Brand: \`var(--ggui-color-primary-600, #0284c7)\`, \`var(--ggui-color-primary-50, #f0f9ff)\`
- Text: \`var(--ggui-color-onSurface, #18181b)\`, \`var(--ggui-color-onSurfaceVariant, #52525b)\`
- Backgrounds: \`var(--ggui-color-surface, #fafafa)\`, \`var(--ggui-color-surfaceVariant, #f4f4f5)\`
- Borders: \`var(--ggui-color-outline, #d4d4d8)\`
- Spacing: \`var(--ggui-spacing-4, 16px)\`, \`var(--ggui-spacing-6, 24px)\`
- Typography: \`var(--ggui-font-size-sm, 14px)\`, \`var(--ggui-font-weight-semibold, 600)\`
- Shadows: \`var(--ggui-shape-shadow-sm)\`, \`var(--ggui-shape-shadow-md)\`, \`var(--ggui-shape-shadow-lg)\`
- Radius: \`var(--ggui-shape-radius-md, 8px)\`, \`var(--ggui-shape-radius-lg, 12px)\`

Prefer primitives' built-in styling props over inline styles when possible.

### Branded Color Strategy

Use the FULL primary palette throughout the component \u2014 NOT only on submit buttons. A well-themed component feels distinctly branded, not gray-with-one-colored-button.

| Element | Token | Purpose |
|---------|-------|---------|
| Section headers, hero areas, highlight strips | \`primary-50\` / \`primary-100\` | Subtle branded backgrounds |
| Borders, dividers, focus rings, input focus | \`primary-200\` / \`primary-300\` | Branded structure |
| Icons, links, labels, active indicators | \`primary-500\` / \`primary-600\` | Core accent color |
| Buttons, CTAs, filled interactive elements | \`primary-600\` / \`primary-700\` | Primary actions |
| Headings on light primary backgrounds | \`primary-800\` / \`primary-900\` | High-contrast branded text |

Use semantic tokens (\`onSurface\`, \`onSurfaceVariant\`) for body text and secondary info. NEVER use raw \`neutral-*\` or \`gray-*\` for body text \u2014 they break in dark themes.

### Theme-Agnostic Design

Components MUST be theme-agnostic \u2014 they reference CSS variables but NEVER assume a specific style. The theme decides what \`primary-600\` looks like.

DO:
- Use \`var(--ggui-color-primary-*)\` for brand elements \u2014 the theme controls what "primary" means
- Use \`var(--ggui-shape-shadow-*)\` for depth, \`var(--ggui-shape-radius-*)\` for corners
- Use semantic color roles: primary for brand, surface/onSurface for structure, success/error/warning for state

DON'T:
- Don't assume primary is blue \u2014 could be red, green, purple
- Don't hardcode gradients tuned for a specific theme
- Don't use fixed shadow values

Visual hierarchy via tokens:
- Elevated sections: \`var(--ggui-shape-shadow-md)\` + \`var(--ggui-shape-radius-lg)\`
- Highlighted regions: \`var(--ggui-color-primary-50)\` background
- Active/selected: \`var(--ggui-color-primary-100)\` background
- Section headers: \`var(--ggui-color-primary-600)\` text or border-bottom

## Responsive Design (CRITICAL)

Generated components become reusable blueprints \u2014 the same blueprint serves phones, tablets, desktops, spatial headsets. Design for ALL screen sizes:

1. Design tokens for ALL spacing \u2014 never hardcode pixel values for padding/margins/gaps. Use the named spacing scale on props (\`gap="md"\`, \`padding="lg"\`); for inline \`style\` use \`var(--ggui-spacing-*, \u2026)\`.
2. Relative/fluid units \u2014 prefer \`%\`, \`em\`, \`rem\`, \`min()\`, \`max()\`, \`clamp()\` over fixed \`px\`.
3. Fluid widths \u2014 \`max-width\` with \`width: 100%\`. Never set a fixed width.
4. Compact padding \u2014 components are embedded in containers that provide their own chrome.
5. No raw \`@media\` queries in component code \u2014 for a layout that must change by breakpoint, use \`<Grid columns={{ base: 1, md: 3 }}>\` (the design system emits the media queries for you) or a fluid \`minColumnWidth\` grid.

## Data Parameterization (CRITICAL)

Generated components are CACHED blueprints reused across requests. NEVER hardcode request-specific data (names, cities, numbers, dates) into the component body. Define data as default prop values so the blueprint works for ANY similar request:

\`\`\`tsx
// BAD \u2014 hardcoded, only works for Tokyo
const city = "Tokyo";
const temp = 18;

// GOOD \u2014 parameterized via props with defaults from the request
interface Props {
  city?: string;
  temperature?: number;
}
export default function WeatherCard({ city = "Tokyo", temperature = 18 }: Props) {
  // A controller can override for Seoul, Paris, etc.
}
\`\`\`

Rules:
1. All request-specific data \u2192 props with defaults. City names, tickers, user names, dates, counts.
2. Layout and styling are universal. Colors, spacing, structure \u2014 these are the reusable part.
3. Default values come from the current request \u2014 so the component renders correctly standalone.
4. Props interface must be typed and exported.

## Component Structure

Keep JSX nesting depth to 3\u20135 levels. When deeper, extract repeated/complex sections into helper components \u2014 named functions defined above the main Component in the same file. Helpers take data + callbacks via props; they don't own state.

\`\`\`tsx
import { useState } from 'react';
import { Container, Card, Stack, Text, Button, Input } from '@ggui-ai/design';

interface Props {
  onSubmit?: (data: unknown) => void;
}

function ItemCard({ item, onEdit }: { item: Item; onEdit: (id: string) => void }) {
  return <Card padding="md">\u2026</Card>;
}

export default function GeneratedComponent({ onSubmit }: Props) {
  return (
    <Container>
      {items.map((item) => <ItemCard key={item.id} item={item} onEdit={handleEdit} />)}
    </Container>
  );
}
\`\`\`

## Aesthetic Guidance (READ CAREFULLY \u2014 this is what separates "polished" from "ok")

### Visual hierarchy \u2014 the SCALE GAP rule

A polished UI has ONE hero that dominates. Everything else supports it. Bad layouts have everything at similar sizes \u2014 the eye has nowhere to land. The rule:

**Hero metric vs supporting text must have a 2\u20133\xD7 size gap.** If the hero is the temperature, score, count, status, price \u2014 it's ENORMOUS. Use \`<Text size="4xl" weight="bold">\` \u2014 the largest \`size\` the type allows (\`4xl\` = 36px). Pair it with a small supporting label (\`size="sm"\`, ~14px) so the gap reads as 2\u20133\xD7. The hero number should feel oversized compared to the location/title around it. \`size\` accepts ONLY \`xs | sm | base | lg | xl | 2xl | 3xl | 4xl\` \u2014 \`5xl\` / \`6xl\` are NOT valid and fail tier-0 type-check.

\`\`\`tsx
// BAD \u2014 temperature is the same size as the location heading
<Heading level={1}>Seoul, South Korea</Heading>
<Text size="lg" weight="bold">18\xB0C</Text>

// GOOD \u2014 temperature dominates (4xl), location supports it (sm)
<Text size="sm" tone="muted">Seoul, South Korea</Text>
<Text size="4xl" weight="bold">18\xB0C</Text>
<Text size="lg" tone="muted">Partly Cloudy \xB7 Feels like 16\xB0C</Text>
\`\`\`

### Color discipline \u2014 the 60/30/10 rule

Don't paint everything in primary. Use:
- **60% surface** (\`var(--ggui-color-surface)\` / \`onSurface\`) \u2014 body text, default backgrounds, structure
- **30% surfaceVariant + onSurfaceVariant** \u2014 secondary text, captions, labels, dividers
- **10% primary** \u2014 hero number, ONE highlight element, CTAs, brand accent

If your component is 100% purple text on purple backgrounds, you've lost the eye. Headings can be \`onSurface\` (dark neutral) \u2014 they'll still feel weighty. Save the primary palette for one or two STAR moments.

\`\`\`tsx
// BAD \u2014 everything purple, eye has no anchor
<Heading tone="emphasized">Title</Heading>
<Text tone="emphasized">42</Text>
<Text tone="emphasized">all body text</Text>

// GOOD \u2014 hero pops, body is neutral, primary is reserved
<Heading>Title</Heading>  {/* defaults to onSurface */}
<Text size="4xl" weight="bold" tone="emphasized">42</Text>
<Text tone="muted">all body text</Text>
\`\`\`

### Visual rhythm \u2014 vary your card treatments

A row of identical flat tiles feels monotone. Use card-treatment variation to create rhythm:
- **Hero card**: \`<Card padding="xl" shadow="lg" radius="xl">\` with branded gradient background \u2014 anchors the eye
- **Stat tiles**: \`<Card padding="md" shadow="sm" radius="md">\` with surface bg \u2014 secondary
- **Inline rows / list items**: no card chrome at all, just \`<Stack gap="sm">\` with dividers \u2014 tertiary

The hero should literally have higher elevation than the supporting tiles. If everything has \`shadow="md"\`, nothing does.

### Iconography \u2014 emoji + Icon are visual weight on the cheap

Don't render text-only metrics. A weather widget without a sun/cloud, a stock card without an arrow, a status panel without a colored dot \u2014 all feel undersold. Pair every hero metric with an icon or emoji at large size:

\`\`\`tsx
<Row gap="md" align="center">
  <Text size="3xl">\u2600\uFE0F</Text>
  <Stack gap="xs">
    <Text size="4xl" weight="bold">18\xB0C</Text>
    <Text size="sm" tone="muted">Sunny \xB7 feels like 16\xB0</Text>
  </Stack>
</Row>
\`\`\`

Use \`<Icon name="..." />\` (Lucide icon names in kebab-case) for line icons; emoji directly for status/weather/mood. Both are valid. For per-stat tiny accents, use a small icon next to the label.

### Spacing \u2014 generosity beats compactness

Hero sections should feel airy. Use \`padding="xl"\` (32px) on the main card, not \`padding="md"\`. Whitespace IS design. A cramped polished card looks worse than a roomy plain one.

### Concrete recipes

- **Hero metric card** (weather, stock, score): hero number at \`size="4xl"\` (the max), icon/emoji at \`size="3xl"\` next to it (use \`<Row gap="md">\`), supporting label at \`size="sm"\` muted, branded gradient bg, \`shadow="lg"\`, \`padding="xl"\`.
- **Stat grid** (3\u20136 quick metrics): \`<Grid columns={3} gap="md">\` of \`<Stat>\` \u2014 each \`<Stat label="\u2026" value="\u2026" delta="\u2026" trend="\u2026" />\` handles the label-on-top / value-below / trend-coloured-delta layout for you. Wrap each in a \`<Card padding="md" shadow="sm">\` if you want tile chrome.
- **List item** (forecast day, todo, message): no card per item, use \`<Stack gap="md">\` with each row as \`<Row gap="md">\` of icon + content + meta. Add \`<Divider>\` between rows.
- **Section header**: \`<Heading level={2}>\` left-aligned, optional \`<Badge>\` to its right for count/status, optional muted caption below.
- **CTA section**: ONE primary button. Other actions as ghost/outline. Don't stack three primary buttons.

## Quality Checklist (verify before returning)

- [ ] Imports ONLY from: react, @ggui-ai/design, @ggui-ai/wire
- [ ] No raw HTML elements (\`<button>\`, \`<input>\`, \`<div>\` for layout) \u2014 uses primitives
- [ ] ZERO hardcoded hex colors \u2014 every color is \`var(--ggui-color-*, fallback)\`
- [ ] No raw pixel values for spacing \u2014 all via \`var(--ggui-spacing-*)\` tokens
- [ ] Primary palette used throughout (headers, borders, icons) \u2014 not just buttons
- [ ] Typed Props interface exported; request-specific data is a prop with default
- [ ] Every Input/TextArea/Select has a \`label\` prop (no separate \`<Text>\` label)
- [ ] Icon-only buttons have \`aria-label\`; no redundant \`role\`/\`aria-*\` on primitives
- [ ] Live/streaming regions wrapped in \`aria-live="polite"\`
- [ ] Headings nest \u2014 one \`level={1}\`, then \`level={2}\`/\`{3}\` \u2014 never skipped or inverted
- [ ] Wire hooks (\`useAction\`, \`useStream\`) imported from \`@ggui-ai/wire\` and consumed`;

// src/harness/runtime.ts
function buildSystemPrompt2(userRequest, shellType, screen, axisDelta, appGadgets, gadgetTypes) {
  return buildSystemPrompt({
    userRequest,
    shellType,
    screen,
    axisDelta,
    pitfallsBlock: renderPitfallsBlock(),
    designSystemDocs: DEFAULT_DESIGN_SYSTEM_DOCS,
    primitivesDoc: PRIMITIVES_DOCUMENTATION,
    wireDoc: WIRE_DOCUMENTATION,
    appGadgets,
    gadgetTypes
    // criteriaBlock left undefined — ui-gen fills default from open CRITERIA.
  });
}

export { buildSystemPrompt2 as buildSystemPrompt, generateBoilerplate };
//# sourceMappingURL=runtime.js.map
//# sourceMappingURL=runtime.js.map