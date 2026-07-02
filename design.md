# Promty Design System

Version: 1.0  
Status: source of truth for frontend UI work

## Frontend Work Rule

Before making frontend UI changes, read this document first.

Frontend implementation should use the tokens in `frontend/src/tokens.css`. If a design decision changes a token, update this document and the token file together.

Promty is a professional developer tool for observing, debugging, and understanding AI sessions. It is not a marketing website. The interface exists to support the workflow, not to become the focus.

## Philosophy

The UI should feel like an operating system: calm, predictable, precise, mechanical, minimal, professional, developer-first, and infrastructure-focused.

Avoid:

- Decorative elements
- Unnecessary visual effects
- Trendy UI patterns
- Playful or colorful presentation
- Oversized cards, oversized buttons, and empty-space-driven layouts

When in doubt, choose the simpler solution.

## Core Principles

1. Function over decoration.
2. Consistency over creativity.
3. Information before aesthetics.
4. Reduce cognitive load.
5. Every component should be predictable.
6. Reuse before creating new patterns.
7. Every pixel must have a purpose.
8. Information density without clutter.
9. Monochrome first.
10. Colors represent meaning.

## Visual Hierarchy

Hierarchy should be created in this order:

1. Typography
2. Spacing
3. Surface
4. Contrast
5. Color

Never rely on color alone to indicate importance. The page should remain understandable in grayscale.

A screen should never have more than three visual emphasis levels:

1. Page title
2. Section heading
3. Interactive content

Everything else should visually recede.

## Typography

### Font Families

UI font: `Geist`

Use Geist for general UI elements:

- Heading
- Body
- Button
- Input
- Navigation
- Table
- Badge
- Modal
- Tooltip

Code font: `Geist Mono`

Use Geist Mono only for:

- Code
- JSON
- Event payload
- Sequence
- IDs
- Timestamp
- Terminal output

Never mix multiple UI fonts.

Brand accent font: `Commit Mono`, with `JetBrains Mono` and the code font stack as fallbacks.

Use the brand accent font sparingly for developer-facing emphasis:

- Promty wordmark and brand lockups
- Compact status pills and count pills
- Model badges and metadata chips
- Overview metric values
- Community flow kickers
- Prompt row metadata chips
- Short technical labels that should feel like code-adjacent UI

Do not use the brand accent font for:

- Body copy
- Long prompt text
- Markdown content
- Form inputs and textareas
- Primary navigation labels other than the Promty wordmark
- Full buttons unless the button is a compact metadata control

The brand accent font should add a precise developer-tool texture without making the app feel like a terminal. If a section already contains code, JSON, diffs, or long technical text, keep that content on the code font and use the brand accent only for surrounding labels or metrics.

### Font Weights

```text
300  Rarely used
400  Default body
500  Labels
600  Section title
700  Page title
```

Never use `800` or `900`.

### Type Scale

```text
Display  36px
H1       30px
H2       24px
H3       20px
Title    18px
Body     14px
Small    13px
Caption  12px
Code     13px
```

Line height:

```text
Heading  120%
Body     150%
Code     150%
```

## Color

Promty is primarily monochrome. Colors communicate meaning and never exist for decoration.

Color usage ratio:

```text
85%  Neutral
10%  Primary
5%   Semantic
```

If a screen feels colorful, it is probably incorrect.

### Brand

Primary: `#6B7B93`

Used for:

- Selection
- Focus
- Active state
- Primary action

Never use primary as a large background.

```text
Primary          #6B7B93
Primary Hover    #7B8CA6
Primary Active   #5B6A81
Primary Subtle   #222830
Primary Border   #3C4656
```

### Neutral Palette

```text
Background        #09090B  Application background
Surface           #111113  Cards, panels, sidebar
Surface Secondary #17181C  Nested cards, secondary sections
Surface Hover     #1E2127  Hover state
Border            #2A2F38  Default border
Border Hover      #3A414D  Hover border
```

### Text Colors

```text
Primary Text    #FAFAFA
Secondary Text  #C4CAD4
Muted Text      #9AA3B2
Disabled        #6B7280
```

### Semantic Colors

```text
Success  #22C55E  Completed, healthy, connected
Warning  #F59E0B  Potential issue, needs attention
Danger   #EF4444  Failure, disconnected, critical error
Info     #38BDF8  Information only
```

Info must never be used as the brand color.

## Event Colors

Each event category has one dedicated color.

```text
Prompt    Primary
Response  Success
File      Warning
System    Muted
Error     Danger
Tool      Primary
```

Never assign random colors to event types. Color should communicate meaning immediately.

## Layout

Every page follows the same structure:

```text
Page
Header
Content
Section
Component
Content
```

Every page should contain:

```text
Page Title
Optional Description
Primary Action
Content
```

Users should understand the page within five seconds.

Use alignment to create structure, not decoration. Never invent a new layout without a clear reason.

## Grid And Spacing

Base grid: `4px`  
Layout grid: `8px`

Allowed spacing values:

```text
4
8
12
16
20
24
32
40
48
64
80
96
```

Never use arbitrary spacing.

Whitespace creates hierarchy. Do not add whitespace because something looks empty. Related content should always be visually closer together than unrelated content.

## Alignment

- Text: left aligned
- Numbers: right aligned
- Actions: right aligned

Never center long text. Never randomly offset elements.

## Information Density

Promty is a productivity tool. Optimize for useful information density with clear organization.

Avoid:

- Empty-space-driven layouts
- Oversized cards
- Giant buttons
- Marketing-style hero sections

Professional users prefer seeing more useful information when the structure is predictable.

## Components

Every component should be reusable, composable, responsive, accessible, and independent.

Avoid page-specific components whenever possible. If two components solve the same problem, merge them.

### Buttons

Only one primary button is allowed per section.

Priority order:

```text
Primary
Secondary
Ghost
Danger
```

If everything is primary, nothing is primary.

Rules:

- Primary: primary background, white text
- Secondary: transparent background, border, primary text or high-emphasis text
- Ghost: transparent background, no border, hover only
- Danger: danger styling only for destructive actions

### Cards

Cards group information. They are not decoration.

Rules:

- Minimal border
- No heavy shadow
- Consistent padding
- Clear title
- Predictable spacing
- Never nest more than two card levels

Use surface depth instead of elevation.

### AI And Model Badges

AI provider/model badges must use the shared `AiModelBadge` component and its `ai-model-badge` styles. Do not create page-specific AI badges for Overview, AI Activity, Community, or project cards.

Use AI/model badges for:

- Connected model lists
- Prompt row metadata
- Session or flow metadata
- Published community flow cards and detail headers

Keep adjacent state such as visibility, prompt count, and file count as separate compact chips. Do not merge non-AI state into the AI badge.

### Tables

Tables are first-class components.

Rules:

- Sticky header
- Consistent row height
- Hover state
- Selected state
- Sortable columns
- Resizable columns when appropriate
- Text left aligned
- Numbers right aligned
- Never center table content

### Forms And Inputs

Labels are mandatory. Never use placeholders as labels.

Every input should have:

```text
Label
Input
Optional helper text
Validation message
```

Validation should appear immediately after interaction. Error messages always appear below the field. Required fields should be minimal. Reduce typing whenever possible.

### Navigation

Navigation should always answer:

```text
Where am I?
Where can I go?
```

Navigation should never move unexpectedly. The current page must always be obvious.

### Sidebar

The sidebar should remain visually quiet.

```text
Background      Background
Selected item   Primary Subtle
Icon            Muted Text
Active icon     Primary
```

Avoid unnecessary badges.

### Empty States

Never display an empty screen.

Every empty state should answer:

```text
Why is this empty?
What can I do next?
```

Example:

```text
No sessions yet.
Start a collector to begin receiving events.
```

### Loading

Avoid fullscreen spinners.

Prefer:

- Skeleton
- Progressive rendering
- Optimistic updates

The layout should remain stable while loading. Avoid unexpected layout shifts.

### Feedback

Every user action deserves feedback:

- Hover
- Focus
- Loading
- Success
- Failure
- Undo when possible

The user should never wonder whether an action succeeded.

### Modals

Avoid modals whenever possible.

Prefer:

- Drawer
- Popover
- Inline expansion

Use a modal only when interrupting the workflow is necessary.

## Icons

Use `lucide-react` as the single icon source for frontend UI.

Rules:

- Single icon style
- Outlined icons only
- Stroke width: `1.5px`
- Consistent size: `16`, `18`, `20`, or `24`
- Icons support text; they do not replace text
- Do not mix outline and filled icons

## Motion

Animation explains change. Animation never entertains.

```text
Fast    150ms
Normal  200ms
Slow    250ms
Easing  ease-out
```

Avoid:

- Bounce
- Elastic
- Flash
- Long fades
- Excessive animation

The interface should feel responsive, not flashy.

## Borders, Radius, Shadows

Use borders instead of shadows.

Hierarchy should come from:

- Spacing
- Contrast
- Surface
- Border

Not elevation.

Radius:

```text
Small   6px
Medium  8px
Large   12px
Max     16px
```

Never exceed `16px`. Rounded interfaces do not match Promty.

Shadows are allowed only for:

- Modal
- Dropdown
- Context menu
- Tooltip

Shadows should be subtle.

## Accessibility

Requirements:

- Keyboard navigation is required
- Visible focus states are required
- Minimum interactive area: `40 x 40px`
- Minimum contrast: WCAG AA
- Do not communicate status using color alone

Every important state should also include:

- Icon
- Label
- Text
- Tooltip if necessary

Accessibility should be considered from the beginning rather than added later.

## Responsive Rules

Desktop is the primary experience. Tablet should preserve layout hierarchy. Mobile should preserve functionality before appearance.

Never remove functionality only because the screen is smaller.

## Content Rules

Interfaces should be concise.

Prefer:

- Short labels
- Simple language
- Clear actions

Avoid long paragraphs. The interface should explain itself. Documentation should not be required to navigate the UI.

## Token Map

Implementation tokens live in `frontend/src/tokens.css`.

Key token groups:

```text
--bh-font-*
--bh-color-*
--bh-button-*
--bh-sidebar-*
--bh-card-*
--bh-input-*
--bh-table-*
--bh-badge-*
--bh-radius-*
--bh-space-*
--bh-duration-*
--bh-icon-*
--bh-shadow-*
```

Do not introduce one-off colors, spacing, shadows, or radii in components. Add or update a token first.

## Before Shipping

Every new screen must answer:

```text
Is it consistent?
Is it simpler?
Is it reusable?
Does it reduce cognitive load?
Can a new user understand it within five seconds?
```

If any answer is no, redesign before shipping.
