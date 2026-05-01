# Felsstudio: Design System

## 1. Visual Theme & Atmosphere

The Creator Engine is a specialized "Studio" environment. While the main Felsverzeichnis app is for consumption and discovery, the Creator Engine is for precision and production. It follows a philosophy of **approachable minimalism** inspired by high-end productivity tools.

The interface should feel like quality paper rather than sterile glass. We use a **Warm Neutral** palette to reduce eye strain during long editing sessions. The page canvas and primary panels are pure white (`#ffffff`), while background surfaces use a warm white (`#f6f5f4`) with subtle yellow-brown undertones.

**Key Characteristics:**

- **Typography-First:** Bold, compressed headlines for navigation and clear, readable body text for metadata.
- **Whisper Borders:** Division of space through ultra-thin `1px solid rgba(0,0,0,0.1)` lines rather than heavy shadows.
- **Micro-Depth:** Barely-there multi-layered shadows (cumulative opacity < 0.05) to indicate elevation of panels over the 3D canvas.
- **Intentional Color:** Saturated colors are reserved for semantic actions (tools, status, specific workspace types) to keep the focus on the content (the topo).

## 2. Color Palette & Roles

### Primary & Brand

- **Engine Near-Black** (`rgba(0,0,0,0.95)`): Primary text and navigation labels.
- **Pure White** (`#ffffff`): Main panel backgrounds and active button states.
- **Creator Blue** (`#0075de`): Primary interactive color, focus rings, and "Active" tool indicators.

### Workspace Semantic Colors

Each workspace type has a subtle color association to provide context without being overwhelming:

- **Geospatial (Crags):** Rose/Pink (`#ff64c8`)
- **Advanced (3D Topos):** Indigo/Purple (`#391c57`)
- **Bootstrapping (2D Topos):** Teal/Emerald (`#2a9d99`)

### Warm Neutral Scale (The "Paper" Foundation)

- **Warm White** (`#f6f5f4`): Canvas background, non-active panel surfaces.
- **Warm Gray 500** (`#615d59`): Secondary labels, help text, descriptions.
- **Warm Gray 300** (`#a39e98`): Placeholders and disabled states.

## 3. Typography Hierarchy

We use **Inter** (with specific letter-spacing adjustments) to create a premium, editorial feel.

| Role              | Size | Weight | Letter Spacing | Use Case                                |
| ----------------- | ---- | ------ | -------------- | --------------------------------------- |
| **Display Title** | 48px | 900    | -1.5px         | Landing page headlines (Uppercase)      |
| **Section Title** | 22px | 700    | -0.25px        | Panel headers, Workspace names          |
| **UI Label**      | 12px | 600    | 0.125px        | Property labels, tool names (Uppercase) |
| **Body Text**     | 14px | 400    | normal         | Metadata inputs, descriptions           |
| **Micro Data**    | 11px | 500    | normal         | Coordinates, timestamps                 |

## 4. Component Stylings

### Panels (Properties & Tools)

- **Surface:** White or Warm White.
- **Border:** `1px solid rgba(0,0,0,0.1)`.
- **Radius:** `1.5rem` (24px) for main panels, `1rem` (16px) for inner containers.
- **Shadow:** Level 2 (4-layer stack) for floating panels.

### Tool Palette

- **Container:** Rounded pill or high-radius rectangle.
- **Buttons:** 40x40px or 48x48px.
- **Active State:** Creator Blue background with White icon.
- **Hover State:** Soft warm gray tint (`rgba(0,0,0,0.05)`).

### Inputs & Controls

- **Background:** Warm Gray (`rgba(0,0,0,0.05)`).
- **Focus:** 2px solid Creator Blue ring.
- **Radius:** 8px.
- **Text:** 13px Inter.

### Buttons (Primary)

- **Background:** Creator Blue (`#0075de`).
- **Text:** White.
- **Radius:** 4px (Subtle) or 9999px (Pill for Wizards).
- **Shadow:** Subtle shadow reinforcement on hover.

## 5. Layout Principles (The "Studio" Layout)

### The 3D Canvas

The 3D model or 2D image should occupy the maximum available space, often serving as the true "background" of the application.

### Layering

- **Layer 0:** The Viewport (3D Scene / 2D Image).
- **Layer 1:** Contextual Overlays (Tool palettes, Breadcrumbs).
- **Layer 2:** Side Panels (Property Inspector, Route List).
- **Layer 3:** Modals & Wizards (Task-specific overlays).

### Spacing Scale

- **Base:** 8px.
- **Gaps:** 4px (tight), 8px (standard), 16px (relaxed), 24px (panel margin).

## 6. Depth & Elevation

| Level       | Shadow Treatment            | Use Case                             |
| ----------- | --------------------------- | ------------------------------------ |
| **Flat**    | None                        | Viewport background                  |
| **Whisper** | `1px solid rgba(0,0,0,0.1)` | Inline dividers, subtle borders      |
| **Panel**   | 4-layer (max opacity 0.04)  | Sidebar properties, floating tools   |
| **Modal**   | 5-layer (max opacity 0.05)  | Search results, confirmation dialogs |

## 7. Responsive Philosophy

### Desktop First

The Creator Engine is a complex tool optimized for desktop productivity.

- **Tablet:** Full functionality maintained with touch-optimized targets.
- **Mobile:** Read-only mode or high-level status checks; complex 3D editing is intentionally deprioritized.
