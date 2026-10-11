# Art Direction — Fast Lane 2026

## 1. Concept: Classic, Rebuilt

**Selected 10 October 2026.** This is the production visual standard for the refresh, superseding
“Cheerful Dystopia”. The game screen has migrated (refresh slice R1); the remaining art, screens and the
prompt generator migrate in later slices (implementation-plan.md, Visual refresh).

[Selected concept](../design/concepts/classic-rebuilt.png) · [Exploration prompts](../design/concepts/prompts.md)

> A sunny, illustrated neighbourhood where an ordinary week becomes a small adventure.

Recall the original life-management game's town board, expressive portraits, recognisable shops,
and compact dashboard. Refresh them with crisp illustration, modern spacing, accessible controls,
and clear information hierarchy. Players should recognise where to go, what an action costs,
and how their week is progressing at a glance.

The signature is a connected town block surrounding a landscaped square: storefronts share streets,
pavements, trees, and crossings. The 2026 setting and economic satire remain in small details:
delivery robots, rental applications, subscription devices, and automated recruitment.

The concept establishes mood, composition, and illustration quality. Its invented slogans, generated
labels, extra props, and example action effects are not production requirements. Use existing project
names, content, and engine values. Create original artwork.

### Illustration rules

- Crisp hand-painted 2D illustration with simplified shapes and restrained shading inspired by
  classic computer-game sprites. Smooth scaling; no compulsory pixel grid or simulated screen ageing.
- Thin ink contours define silhouettes and important features; lighter interior lines.
  Avoid the previous uniform heavy outlines.
- Warm daylight from the upper left. Use a base colour and one or two shadow/highlight tones per
  material. Subtle material variation is allowed; omit grain, blur, bloom, and photographic detail.
- Recognisable brick, stucco, timber, glass, striped awnings, and useful front doors.
  Distinct silhouettes and pictograms identify destinations before players read their names.
- Natural, diverse characters with readable eyes, eyebrows, and mouths. Full bodies are approximately
  five heads tall; portrait heads may be slightly enlarged for expression.
- Town and scene art carry the visual richness. Controls stay clean and quiet.
- Satire targets systems and the rival, never people struggling with work, health, or housing.

## 2. Palette

These are the foundations; the UI tokens in `apps/web/src/index.css` derive from them. Related shades are allowed
for materials and shading. Repeat the foundation palette in production prompts.

| Token | Hex | Role |
|---|---|---|
| ink | #263C53 | Text, contours, borders, deep shadows |
| cream | #F9F3DF | Main UI surface and sign panels |
| butter | #F3DEA0 | Warm highlights and selected surfaces |
| sky | #8AC8DE | Daylight sky, glass, light secondary controls |
| teal | #3E8B84 | Interface framing and architectural accents |
| brick | #B75E49 | Brickwork and prominent End week treatment |
| leaf | #64865A | Trees, planted areas, grocery accents |
| slate | #78858B | Roads, concrete, neutral metal |
| lilac | #8B7EAF | Automation details and social accents |
| gold | #D2A344 | Coins, achievements, rival accessories |

Skin and hair colours use a natural range outside this palette. Robots have lilac accents with
ordinary metal/plastic bodies. Jones keeps an ink outfit and gold accessories.

### Semantic colours and accessibility

| Meaning | Target | Treatment |
|---|---|---|
| Main text | #263C53 | On cream or other light surfaces |
| Secondary text | #526373 | Keep essential costs and labels readable |
| Positive / money text | #24644D | Pair with a plus sign or descriptive label |
| Negative / warning text | #963F32 | Pair with a minus sign, icon, or explanation |
| Focus | #263C53 | Visible 2 px outline, 2 px offset on light controls |
| Selected destination | Butter fill + ink outline | Also show a marker and live location name |

Check actual UI combinations against WCAG AA: 4.5:1 for ordinary text and 3:1 for large text
and essential non-text boundaries. Art colours are not automatically safe text colours.
Validate button text and every interactive state before shipping.

Player identities retain existing colour-and-shape pairs: P1 #E69F00 circle, P2 #56B4E9 triangle,
P3 #009E73 square, P4 #D55E00 diamond, Jones #CC79A7 star.
Stats always have labels and icons alongside colour. Functional icons are consistent code-native SVG,
not generated illustrations.

## 3. Typography and live text

| Role | Typeface | Use |
|---|---|---|
| Town names and restrained display headings | Roboto Slab, 600–700 | Friendly slab-serif signage, self-hosted |
| Body, controls, costs, status labels | Atkinson Hyperlegible Next, 400–700 | Retain the existing accessible UI family |
| HUD values | Atkinson Hyperlegible Next, 700 | Tabular numerals prevent counter jitter |

Starting desktop sizes: 16 px body, 16–18 px action labels, 12–14 px secondary labels,
22–28 px panel headings, 24–32 px key values. Essential gameplay text must not shrink below
14 px to squeeze in a layout.

**Production art contains no text, numbers, logos, or brand marks**, with one exception: each building's
name is painted on its sign, as the concept paints its storefronts (decided 11 October 2026; names
lettered live over the blank panels looked pasted on). Everything else stays blank, including posters,
screens, price tags, and clothing; gameplay values stay live. The cost: renaming a location, or
translating its name, means regenerating its building art. The DOM keeps every name as live text
(travel dialog, location panel), so the board's painted names are never the only place a name appears.

## 4. Camera, framing, scale, and interface

| Asset | Camera / composition | Source target | Display starting point |
|---|---|---|---|
| Buildings | Elevated three-quarter front, front facade dominant, left wall visible at about 20°, near-orthographic | 1024 × 1024 | About 200 px wide |
| Full-body characters | Front three-quarter, relaxed stance, feet visible | 1024 × 1536 | About 160 × 240 px |
| Emotion portraits | Head and shoulders, consistent pose and scale, 3 × 2 grid | 1536 × 1024 | About 96 px per bust |
| Items | Three-quarter from above, consistent lighting | 1024 × 1024 | 64–128 px |
| Events | Eye level, focal action within central 70% | 1536 × 1024 | Responsive dialog |
| Interiors | Eye-level room with open foreground and believable furniture scale | 1536 × 1024 | Location-panel scene |
| Backdrop | Broad daylight skyline, low horizon, quieter than destinations | 1536 × 1024 | Behind town board |

Buildings share a pavement baseline and compatible scale. Omit floating slabs, giant phone buildings,
graduation-cap roofs, and coin-slot doors. Keep entrances, legible painted signs, and destination silhouettes
clear at actual size.

Roads, crossings, interaction geometry, routes, and destination positions remain code-driven in Pixi.
Illustrated buildings and scenery sit on that geometry. Preserve content-defined location order and
travel-distance semantics when replacing the current stadium loop with the town-block presentation.
The park is decorative space, not an implied extra destination. Its paths meet the ring road at
zebra crossings, as the concept's do. Roads are warm grey asphalt with butter centre dashes on the ring.

Player markers combine portrait, identity colour, shape, and a pointer toward the current building.
A marker rests on top of its building's sign, so the name stays readable beneath it.
Selection remains clear without a large glowing outline around the artwork.

### Layout target

Desktop: roughly 70% town board on the left and 30% location/action panel on the right, with
a compact dashboard below the board. Money, time, energy, health, happiness, social, and credit
remain visible. Provide clear space for goals, rival progress, meals, transport, commitments,
and next-step guidance. Move the large central clock into the dashboard.

Travel and End week stay pinned at the foot of the location panel, whose actions scroll above them.
Prototype with real long labels, full action lists, warnings, and multiple players.

Mobile is its own composition, not a shrunk desktop (breakpoint: NFR-02): a compact status bar
(identity, week, score, money, and every stat as icon, number and thin bar), the board, then the
location panel without its scene art, since the board already shows the place. In landscape the
panel sits beside the board. Goals and rival progress live in Details, opened from the status bar.

### UI treatments

- Cream panels, 1 px ink borders, 4–8 px corners, restrained teal framing.
- Buttons have a modest raised edge or 2 px lower shadow. Pressing removes the shadow and shifts 1 px.
  Travel uses light sky; End week uses brick, with contrast-checked text.
- Action rows align icon, label, time, and effects. Group subscriptions separately.
  Recommendation markers stay small; avoid wrapping every effect in a bordered pill.
- Use an 8 px spacing rhythm, 16–24 px panel padding, and at least 44 px touch targets.
- Hover changes fill or border. Selection adds a marker. Disabled labels remain legible and
  unavailable actions explain why. Every control has visible keyboard focus.
- Resource bars include icon, label, and number. Remaining time is also numeric.

### Motion and themes

Player travel follows the actual route. Use short selection/arrival feedback, roughly 150–250 ms,
and occasional ambient activity. Avoid constant bouncing and widespread squash-and-stretch.
Respect reduced motion; essential feedback remains visible without animation.

Warm daylight is the reference presentation. Preserve light/dark settings and accessible contrast.
Dark mode uses ink-based UI surfaces and cream text while keeping the town readable and recognisable.
Do not automatically darken the whole board because the UI is dark. Validate any art tint during
implementation; separate night artwork is outside the initial refresh.

## 5. Production prompts

Use the built-in image generation tool. Save exact prompts beside source assets and record reference
images. The concept is a direction reference; a new production anchor will lock asset-level camera,
shading, detail, and character consistency.

Prompts combine **shared style + subject + framing**. Repeat this style block unchanged within a batch:

```text
STYLE: Classic, Rebuilt: crisp hand-painted 2D illustration for a modern life-management
game set in 2026. Sunny, welcoming ordinary town with the clarity and personality of classic
computer-game illustration. Simplified believable architecture and natural expressive faces.
Thin ink-blue silhouette contours, lighter interior lines, restrained painted shading with
one or two shadow/highlight tones per material. Light comes from the upper left. Subtle
material variation, clean edges, readable at small sizes. Full-body characters are
approximately five heads tall. No toy buildings, floating plinths, photorealism, 3D renders,
neon glow, heavy grain, blur, CRT effects, or artificial pixelation.
Foundation palette: ink #263C53, cream #F9F3DF, butter #F3DEA0, sky #8AC8DE,
teal #3E8B84, brick #B75E49, leaf #64865A, slate #78858B, lilac #8B7EAF,
gold #D2A344, plus related shading tones and natural diverse skin and hair colours.
Robots have restrained lilac accents. Satire appears in small everyday details.
NO text, letters, numbers, logos, or brand marks. Signs and screens are blank panels
or simple pictograms. Match the attached production style reference when supplied.
```

**Building names:** for a building, swap the style block's no-text line for one allowing only its name,
and ask for the name painted on the sign in bold slab-serif lettering, spelled out letter by letter
(see `art/src/_refresh/named/*.prompt.txt`).

**Sprite framing:** one isolated subject, centred, fully visible with clear margins. Request a
genuinely transparent background. No surrounding street, ground plane, exterior cast shadow,
or decorative frame. Building base ends at its pavement contact line; code supplies ground shadows.

**Emotion framing:** same character six times in a 3-column × 2-row grid, transparent gutters,
identical clothing, hair, scale, and facing. Frame order: neutral, happy, stressed, exhausted,
shocked, proud. Preserve Jones's existing order: neutral, happy, proud, stressed, shocked, exhausted.

**Scene framing:** full bleed, no border, important subjects in central 70% for responsive crops.
Interiors use daylight and practical warm lamps; possessions and space communicate housing tier.

### Worked subject: Your Place

```text
SUBJECT: Your Place, housing tier 1: a modest lived-in suburban family home with a visible
basement window, small front garden, short path to the door, and understated mailbox.
Warm brick and cream timber details, muted teal trim. A folded blanket and lamp are visible
through the basement window, suggesting the player's room without mocking their situation.
A small signboard in the front garden reads "Your Place". Elevated three-quarter front
view, front facade dominant, left wall visible at about 20 degrees, near-orthographic.
No floating base or surrounding street. Match the production anchor's camera and lighting.
```

### Legacy prompt transition

`art/tools/make_prompts.py` reads style from `art/src/_anchor/style-anchor.prompt.txt` and still
emits the old flat-vector, magenta-background prompts. Refresh art so far was generated from the hand-written
prompts in `art/src/_refresh/`, which repeat the style block above. Subject descriptions also prescribe toy
buildings and old proportions. Existing prompt files and art are legacy material; do not regenerate
the refresh with them unchanged.

Update the generator's style, subjects, and framing together, then regenerate prompts. Earlier source art
is kept in `art/src/_legacy/` until replacements are reviewed.

## 6. Pipeline

Saved prompt + references → built-in image generation → reviewed source PNG in
`art/src/<category>/<id>.png` → alpha validation, trim, resize, pack →
`apps/web/public/assets/atlases/<atlas>.{webp,json}`, or full-bleed scene WebP.

The processor in `apps/web/scripts/sprites/` keys out magenta and leaves real source alpha untouched.
Sprite sheets are first cut per cell with `art/src/_refresh/slice.py`, which keeps alpha, keys a flat
magenta background with the same un-mixing as the build, and drops strays from neighbouring cells. Check
painted shading after keying: lilac and pink tones near the key can lose opacity. Full-bleed scenes
encode as WebP; the park keeps an alpha edge.

Keep content IDs and frame names stable. Current atlas contracts:

| Atlas | Frames | Fit at 2× | Anchor |
|---|---|---|---|
| characters | Full bodies by ID | 320 × 480 | Bottom centre |
| busts | character/emotion | 192 × 192 | Centre |
| locations | Buildings by existing art ID | 400 × 400 | Bottom centre |
| items | Inventory and outfits | 256 × 256 | Centre |

Retain these starting contracts unless real-size review requires changes. Inspect sliced emotion
busts, atlas crops, mipmaps, and linear filtering. Only processed assets ship; commit them so builds
do not need image generation. Once the pipeline supports new inputs, run
`pnpm --filter @fastlane/web sprites`.

## 7. Production order and style lock

1. Create a production anchor containing Your Place, a default player portrait/full body,
   and material/object samples. Review at actual board and portrait sizes.
2. Build the Your Place exterior, tier-1 interior, portrait, HUD, and actions as one playable slice.
   Establish camera, shading, typography, and contrast in the real game.
3. Expand to remaining storefronts and housing tiers using the locked anchor.
4. Complete cast and emotions, then items and interiors.
5. Complete events, skyline, town decoration, and remaining interface screens.

The direction is already selected. Use normal review and iteration to maintain consistency,
without a separate permission step for each asset batch.

## 8. Acceptance checklist

- [ ] Warm town mood and rendering style match the concept and production anchor.
- [ ] No baked text beyond building names (spelled exactly as in content), no logos or invented gameplay values.
- [ ] Thin coherent contours, restrained shading, upper-left light; no floating toy base.
- [ ] Palette, material treatment, character identity, and natural skin tones remain consistent.
- [ ] Camera, baseline, scale, and crop match the category; no essential clipping.
- [ ] Sprite alpha and processed edges are clean; atlas crops preserve the intended framing.
- [ ] Silhouettes, expressions, and destinations read at actual size, including smaller screens.
- [ ] Labels, resources, costs, goals, and guidance remain complete and legible.
- [ ] Selection, focus, warnings, and player identity work without colour alone.
- [ ] Themes, keyboard use, touch targets, reduced motion, and contrast are verified.
- [ ] Satirical detail stays secondary to clear visual information.

## 9. Refresh asset inventory

### Locations

| Existing art ID | Destination | New treatment |
|---|---|---|
| your-place-1…5 | Your Place | Family home, shared house, studio block, apartment, smart condo; increasing comfort |
| leaselord | LeaseLord | Brick rental office, blank listings, key pictogram, small application queue |
| joblink | JobLink Hub | Glass recruitment office, job-board panels, lilac-accent robot screener |
| upskill-u | UpSkill U Online | Modest learning centre, computer desks, graduation/book pictogram |
| fulfillment | Fulfillment Center | Low warehouse, loading bays, parcels, automated carts |
| burger-bot | Burger Bot | Corner diner, brick-and-cream awning, burger pictogram, robot cooking arm |
| freshmart | FreshMart | Neighbourhood grocery, produce crates, green trim, striped awning |
| thriftup | ThriftUp / FastFash | Secondhand racks beside a polished clothing display |
| circuit-planet | Circuit Planet | Electronics shop, blue trim, screen displays, small planet pictogram |
| neobank | NeoBank | Recognisable neighbourhood bank, teal trim, broad entrance, coin pictogram |
| gighub | GigHub | Street service kiosk, parked scooter, bike, delivery bags |

Render names from live content. These descriptions do not change IDs or gameplay rules.

### Cast, items, and scenes

Keep `player-01`…`06`: diverse young adults with distinct silhouettes, clothing, hair, and body types;
each has full-body art and six emotions. Keep `jones`: neat hair, ink quarter-zip, gold accessories,
expressive confidence. Location-owner busts and existing Jones variants remain later scope.

Keep inventory IDs: `item-laptop`, `item-ai-assistant`, `item-fridge`, `item-e-scooter`,
`item-headphones`, `item-air-fryer`, `item-smart-lock`, `item-phone`, plus `outfit-casual`,
`outfit-smart`, `outfit-business`, and `outfit-founder-hoodie`.

Keep event categories `event-work`, `event-money`, `event-life`, `event-health`, `event-housing`,
`event-viral`, and `event-climate`. Show everyday situations with expressive characters and clear focal action.
Keep `backdrop-day` and `interior-tier-1`…`5`. Housing progression changes space, furniture, and comfort
without making lower-tier homes or their occupants the joke.

Add reusable trees, planters, benches, streetlamps, and park-detail sprites as needed (so far
`decor-trees` and `decor-lamp` in the locations atlas, and the street atlas's trees, lamps, vehicles,
passers-by and `fountain`). The town square is code-drawn (lawn, crossing paths, a brick-edged plaza and
flower beds) with the fountain sprite at its centre; an earlier painted square is kept in
`art/src/_legacy/backgrounds/`. Building names are painted on the art (§3); `art/src/_refresh/named/` regenerates a building with its name from the blank-sign original in
`art/src/_legacy/locations-blank-sign/`.
Roads, crossings, signs, icons, and interaction geometry remain code-native.

Base replacement inventory: 55 images (1 anchor + 14 cast + 15 buildings + 12 items +
7 events + 6 backgrounds), before decorations and retries. The first playable slice uses
a small subset; full production follows its real-size review.
