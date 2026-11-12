# Tooltip

`Tooltip` presents a short label for an existing child control. Its public API is `label` plus one React element child.
The child remains the interactive element and keeps its accessible name, event handlers, and any existing
`aria-describedby` references.

## Behavior

- On Web, pointer hover or keyboard focus within the child opens the tooltip immediately. It stays open while the
  pointer is over the child or tooltip, or while the child remains focused.
- Escape and an outside pointer press close it without moving focus. After dismissal, it remains closed until a new
  pointer entry or focus intent.
- Activating the child closes the tooltip without consuming the child's existing press or click behavior.
- The visible label is a non-interactive `role="tooltip"` surface. Its generated ID is added to the child's
  `aria-describedby` only while visible, preserving existing description IDs.
- Pointer and click events on the tooltip surface do not reach an enclosing action. Events on the child continue
  through their existing handlers.
- Native renders the child unchanged. Tooltip does not add touch, long-press, or tap behavior.

## Placement and appearance

Web uses the shared `Dropdown` and its overlay portal. `verticalPlacement="auto"` places the tooltip after the child
when it fits below the visible viewport inset; otherwise it places it before, then applies the existing viewport
clamping. A transparent 8px bridge on both sides keeps the pointer path continuous in either placement.

The surface uses `backgroundInverse` and `foregroundInverse`, `UI/Copy/M`, 8px padding, 8px radius, and
`elevation.floating`. The text is at most 320px wide; the surface also shrinks to keep the viewport inset. It has no
arrow, delay, interactive content, or extra focus stop.

## Verification boundary

Storybook covers initial hidden state, hover, pointer movement onto the surface, outside dismissal, focus, Escape,
description ID preservation, and near-bottom placement. This Web Storybook coverage does not establish Native
screen-reader or device behavior; Native Tooltip intentionally renders no visible surface.
