---
name: lumos-astro
description: >
  Design token architecture, fluid typography & spacing, CSS variable cascades,
  and accessible token-aware component standards for the Lumos framework on Astro.
---

# Lumos Framework (Astro-Native) Skill Guide

Lumos is an open-source, Astro-native styling framework and design token system created by Timothy Ricks and Caleb Raney (`lumosframework.com`). It delivers predictable CSS cascades, breakpointless fluid scaling, and token-driven consistency without runtime bundle overhead.

---

## 1. Core Architecture & Philosophy

1. **Single Source of Truth:**
   - All visual values (colors, surface levels, fluid typography, spacing scales, border radii, focus rings) are defined as CSS Custom Properties in a centralized stylesheet (traditionally `src/styles/base.css` or `tokens.css`).
   - Changing a token updates every component across the application instantaneously.
2. **Breakpointless Fluid Scaling:**
   - Rather than jumping between rigid media query breakpoints, Lumos calculates smooth fluid interpolations (typically scaling between 320px mobile viewport and 1440px desktop viewport) using CSS mathematical functions (`clamp()`).
3. **Leading-Trim Typography:**
   - Eliminates built-in font-metric white space above capital letters and below descenders using font metric trim tokens (`--primary-trim-top`, `--primary-trim-bottom`).
   - Ensures exact alignment with icons and borders in high-precision sports and fashion editorial layouts.
4. **Ownership Model:**
   - Lumos components and tokens live inside your own codebase (`src/components/`, `src/styles/`), giving complete local control without external package lock-in.

---

## 2. Standard Token Taxonomy

### A. Surface & Swatch Tokens
Lumos structures neutral shades into surface elevations and brand accents:
```css
:root {
  /* Surfaces & Canvas */
  --light-100: #FFFFFF;
  --light-200: #F7F7F7;
  --light-300: #ECECEC;
  
  --dark-700: #242424;
  --dark-800: #141414;
  --dark-900: #0A0A0A;

  /* Brand Accents (Jersey Valley Football Aesthetic) */
  --brand-500: #10B981; /* Football pitch emerald accent */
  --brand-600: #059669;
  --brand-text: #FFFFFF; /* High-contrast accessible text on brand */

  /* Semantic Feedback */
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-error: #EF4444;
}
```

### B. Fluid Typography Scale
Interpolates between mobile and desktop sizes:
```css
:root {
  --font-family-primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-family-display: 'Barlow Condensed', 'Impact', sans-serif;

  /* Fluid font sizes (clamp: min at 320px -> max at 1440px) */
  --text-size-caption: clamp(0.75rem, 0.71rem + 0.18vw, 0.875rem);
  --text-size-body: clamp(0.9375rem, 0.9rem + 0.18vw, 1rem);
  --text-size-h4: clamp(1.125rem, 1.05rem + 0.36vw, 1.25rem);
  --text-size-h3: clamp(1.35rem, 1.22rem + 0.65vw, 1.75rem);
  --text-size-h2: clamp(1.75rem, 1.5rem + 1.25vw, 2.5rem);
  --text-size-h1: clamp(2.25rem, 1.8rem + 2.25vw, 3.75rem);
  --text-size-display: clamp(2.75rem, 2.1rem + 3.25vw, 5rem);

  /* Leading-Trim Font Metric Offsets */
  --primary-trim-top: 0.18em;
  --primary-trim-bottom: 0.22em;
}
```

### C. Fluid Spacing Scale
Proportional fluid gaps and paddings:
```css
:root {
  --space-1: clamp(0.25rem, 0.23rem + 0.09vw, 0.3125rem);
  --space-2: clamp(0.5rem, 0.46rem + 0.18vw, 0.625rem);
  --space-3: clamp(0.75rem, 0.7rem + 0.27vw, 0.9375rem);
  --space-4: clamp(1rem, 0.93rem + 0.36vw, 1.25rem);
  --space-6: clamp(1.5rem, 1.39rem + 0.54vw, 1.875rem);
  --space-8: clamp(2rem, 1.86rem + 0.71vw, 2.5rem);
  --space-12: clamp(3rem, 2.79rem + 1.07vw, 3.75rem);
  --space-16: clamp(4rem, 3.71rem + 1.43vw, 5rem);
}
```

### D. Accessibility & Focus States
Strict keyboard navigation indicators:
```css
:root {
  --border-width: 0.0625rem;
  --focus-width: 0.125rem;
  --focus-offset: 0.125rem;
  --focus-color: var(--brand-500);
}

:focus-visible {
  outline: var(--focus-width) solid var(--focus-color);
  outline-offset: var(--focus-offset);
}
```

---

## 3. Component Architecture & Patterns

Lumos emphasizes composition through structural primitives:

1. **`Container.astro`**:
   Controls maximum layout widths (`--container-max: 80rem`) with fluid horizontal gutter padding (`--space-4`).
2. **`Section.astro`**:
   Provides standard vertical rhythm (`padding-block: var(--space-12)` or `var(--space-16)`).
3. **`Grid.astro`**:
   Token-aware responsive CSS grid utilizing `minmax()` and fluid gap tokens (`gap: var(--space-6)`).
4. **`Button.astro` / `Button.tsx`**:
   Interactive element mapped to token colors, fluid typography, and explicit focus rings.

---

## 4. Integrating Lumos with React & Tailwind

When using Lumos alongside React components or Tailwind CSS:
1. **Extend Tailwind Theme with Lumos Tokens:**
   ```javascript
   // tailwind.config.cjs
   module.exports = {
     theme: {
       extend: {
         colors: {
           brand: 'var(--brand-500)',
           'surface-canvas': 'var(--dark-900)',
           'surface-card': 'var(--dark-800)',
           'surface-elevated': 'var(--dark-700)',
         },
         spacing: {
           'lumos-1': 'var(--space-1)',
           'lumos-4': 'var(--space-4)',
           'lumos-8': 'var(--space-8)',
         },
       },
     },
   };
   ```
2. **Do Not Hardcode Magic Pixels:**
   Always use semantic classes (`p-lumos-4` or `var(--space-4)`) instead of arbitrary one-off pixels (`p-[17px]`).
3. **Preserve High-Contrast Ratios:**
   Ensure text on `var(--brand-500)` or `var(--dark-800)` passes WCAG AA contrast (minimum 4.5:1).

---

## 5. Lumos Engineering Rules & Pitfall Prevention

- **Rule 1 (Zero Token Bypassing):** Never write raw hex codes (`#10b981`) or pixel sizes (`font-size: 24px`) in component styles. Reference the token custom property.
- **Rule 2 (No Unpredictable Cascade Snapping):** Rely on fluid clamp scales for continuous responsiveness across arbitrary device screen widths (e.g. 360px, 390px, 412px, 768px, 1024px).
- **Rule 3 (Accessible Targets):** All interactive targets (buttons, links, form inputs) must have a minimum touch target size of 44x44px and visible focus rings.
- **Rule 4 (Leading-Trim Precision):** When aligning titles with badges or jersey number displays, apply leading-trim offsets to prevent vertical optical imbalance.
