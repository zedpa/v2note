# Design System Document: Editorial Serenity

## 1. Overview & Creative North Star
**The Creative North Star: "The Digital Ateliers"**

This design system rejects the frantic, cluttered nature of modern productivity tools in favor of a "Digital Atelier"—a quiet, sun-drenched space for reflection and intentional action. We move beyond "Minimalism" into "Sophisticated Intentionality." 

To achieve this, the system breaks the standard mobile grid through **intentional asymmetry** and **high-contrast typography scales**. We treat the mobile screen not as a list of data, but as a digital broadsheet. By using expansive white space (the "Breathing Room" principle) and overlapping elements, we create a sense of depth and tactile quality that feels custom-tailored, not templated.

---

## 2. Colors & Tonal Depth

The palette is rooted in the natural world, using low-chroma earth tones to reduce cognitive load and visual fatigue.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning or containment. 
Boundaries must be defined solely through background color shifts or subtle tonal transitions. For example, a `surface-container-low` (#f7f3ed) element sitting on a `surface` (#fdf9f3) background creates a natural edge without the "stiffness" of a stroke.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—like stacked sheets of fine, heavy-weight paper.
- **Lowest Tier (`surface-container-lowest` / #ffffff):** Use for active input areas or primary "hero" cards to create the sharpest contrast against the cream background.
- **Base Tier (`surface` / #fdf9f3):** The canvas for all primary exploration.
- **High Tier (`surface-container-high` / #ebe8e2):** Use for secondary utility areas like sidebars or "archived" content to indicate a lower priority.

### The "Glass & Soul" Rule
To prevent the UI from feeling "flat," use **Glassmorphism** for floating action buttons or sticky headers. Use `surface` colors at 80% opacity with a `12px` backdrop-blur. 
*   **Signature Textures:** For main Call-to-Actions (CTAs), apply a subtle linear gradient from `primary` (#89502c) to `primary_container` (#c8845c) at a 135-degree angle. This mimics the natural variation in deer fur and provides a professional polish that flat fills lack.

---

## 3. Typography: The Editorial Voice

The typography system is a dialogue between the timeless elegance of the Serif and the functional clarity of the Sans.

*   **The Hero (Noto Serif SC):** Used for `display`, `headline`, and `time` stamps. It conveys authority and calm. Use `display-lg` (3.5rem) for empty states or daily headers to create a "magazine-style" entry point.
*   **The Narrative (Inter/Noto Sans SC):** Used for `body` and `title` tokens. Inter provides a neutral, non-judgmental container for the user’s thoughts.
*   **The Metadata (Mono):** Use a Monospace font for `label-sm` metadata (dates, tags, coordinates). This creates a "archival" feel, suggesting that the data is being observed and recorded accurately.

---

## 4. Elevation & Depth

We eschew traditional material shadows for **Tonal Layering**.

### The Layering Principle
Stacking surface tokens creates a soft, natural lift.
*   **Example:** A card using `surface-container-lowest` placed on a `surface-container-low` section creates a perceptible "step" in depth without a single drop shadow.

### Ambient Shadows
When an element must float (e.g., a bottom sheet or a menu), use an **Ambient Shadow**:
*   **Color:** `on_surface` (#1c1c18) at 6% opacity.
*   **Blur:** 24px to 32px.
*   **Offset:** Y: 8px.
This mimics natural, diffused light rather than a harsh digital shadow.

### The "Ghost Border" Fallback
If an edge *must* be defined for accessibility, use a **Ghost Border**: `outline-variant` (#d7c2b8) at 15% opacity. Never use 100% opaque borders.

---

## 5. Component Guidelines

### Buttons (The "Pebble" Style)
*   **Primary:** Gradient fill (`primary` to `primary_container`). Roundedness: `xl` (1.5rem). No shadow.
*   **Secondary:** `secondary_container` (#c7e8c7) background with `on_secondary_container` (#4c6a4f) text.
*   **Tertiary:** Ghost style. No background; `primary` text.

### Cards & Lists (The "Breath" Principle)
*   **Constraint:** Forbid the use of divider lines. 
*   **Execution:** Use `spacing-6` (2rem) of vertical white space to separate list items. If content is dense, use a subtle background shift to `surface-container-low` for every other item (zebra striping) but keep the transition soft.

### Input Fields
*   **Style:** Minimalist underline or "Soft Box." 
*   **State:** When focused, the background shifts from `surface` to `surface-container-lowest` and the label (Noto Serif) scales down with an elegant transition.

### Signature Component: The "Reflection Chip"
A specialized chip for the `v2note` context.
*   **Visuals:** Semi-transparent `secondary_fixed_dim` background with a `1px` Ghost Border. Used for tagging thoughts with "observations" or "actions."

---

## 6. Do’s and Don’ts

### Do
*   **Do** use asymmetrical margins. For example, a left margin of `spacing-4` and a right margin of `spacing-8` can make a note feel like a hand-written marginalia.
*   **Do** prioritize the Serif for any text that is meant to be "savored" (quotes, headers, dates).
*   **Do** use `surface_bright` to highlight "New" or "Unread" states rather than bright red badges.

### Don't
*   **Don't** use pure black (#000000). Always use `on_surface` (#1c1c18) or `on_tertiary_container` (#332b26) for text to maintain the "warm" atmosphere.
*   **Don't** use `shadow-md` or `shadow-lg` defaults. They are too aggressive for this system's "Calm" personality.
*   **Don't** cram icons. If a text label suffices, use the label. Only use icons when they act as "visual anchors" for frequent actions.

---

## 7. Spacing Scale

Our spacing is intentionally "generous" to ensure the interface never feels urgent.
*   **Micro (0.5 - 1.5):** Internal padding for chips and buttons.
*   **Layout (3 - 6):** The standard for gutters and vertical rhythm.
*   **Atmospheric (12 - 24):** Used for hero headers and separating major "chapters" of content within the app.