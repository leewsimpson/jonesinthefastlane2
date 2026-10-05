# Art Direction — Fast Lane 2026

This doc settles open question 2 in [game-requirements.md](game-requirements.md) §17 (flat vector or pixel art)
and fills in the art direction for NFR-01. It sets out the visual language, the asset list, and the prompts we use to
generate assets with the `codex-image` skill (ChatGPT image generation through Codex CLI).

---

## 1. Concept: "Cheerful Dystopia"

> The city looks like the onboarding screens of a fintech app: bright, rounded, relentlessly optimistic.
> The jokes are in the details.

The game satirises a 2026 economy that sells itself with friendly pastel illustrations (bank apps, gig apps, landlord
portals). We use that same look on purpose, and then we break it:

- Brand-new delivery robots that are blocking the bike lane.
- A landlord office shaped like a giant phone, with a key on a chain.
- A "smart" fridge with a lock on it and a subscription badge.
- Jones always photographed from his good side.

**Not Corporate Memphis.** The startup-illustration style it borrows from has noodle limbs and blank faces. We keep the
flat shapes and the palette, but we add three things the game needs:

1. **Thick, even ink outlines.** They make sprites read on light and dark themes and on small phone screens, and they
   make clean background removal much easier (§6).
2. **Real faces with emotion states** (FR-01 / NFR-01: "expressive characters with emotion states").
3. **Chunky toy proportions.** Characters are about 3 heads tall. Buildings look like board-game pieces you could pick up.

### Why flat vector and not pixel art

| | Flat vector (chosen) | Pixel art |
|---|---|---|
| Image-gen quality | Strong, consistent | Pixel grid drifts, fake "pixels" at mixed sizes, needs heavy cleanup |
| Scaling (phone → 4K desktop) | Scales down cleanly from 1024 px sources | Needs integer scaling, awkward on mixed DPI |
| Accessibility (NFR-04) | Clear shapes and icons, easy contrast control | Small details get lost at low resolution |
| Character emotions | Easy to read faces | Limited to a few pixels |
| Dark theme | Same sprites work on both themes thanks to the outline | Same |

---

## 2. Palette

The palette is restricted and named, and every prompt repeats the hex values. These are the **art** colours.
UI theme tokens (Tailwind) derive from them.

| Token | Hex | Used for |
|---|---|---|
| `ink` | `#1F1B2E` | All outlines, dark text, shadows' base |
| `cream` | `#FFF6E9` | Light-theme background, paper, highlights |
| `coral` | `#FF5A4E` | Primary accent, "Fast Lane" brand colour, alerts |
| `mustard` | `#FFC23D` | Money, gold, sunshine, warnings |
| `teal` | `#1FB5A8` | Finance, tech, calm surfaces |
| `sky` | `#5EB8FF` | Sky, glass, screens |
| `lilac` | `#8E7CF0` | AI / robots / "the algorithm", night accents |
| `mint` | `#7EE0A1` | Plants, health, growth |
| `blush` | `#FFB3A7` | Soft fills, cheeks, warmth |
| `slate` | `#5B5872` | Concrete, roads, secondary details |
| `night` | `#17142A` | Dark-theme background (UI only, never in sprites) |
| `key` | `#FF00FF` | Chroma-key background for sprites. Never used in art |

**Skin tones** are not restricted to the palette. Use a natural, diverse range across the cast.

**Rules**

- Flat fills. At most **one** hard-edged shadow tone per surface (a darker shade of the same hue). No gradients, no
  textures, no noise.
- One light source: **top-left**. Cel shadows fall bottom-right.
- **Robots and AI are always `lilac`.** Players learn quickly that lilac = automation risk.
- **Money is always `mustard`.**
- **Jones's signature is `mustard` + `ink`** (gold accessories, dark quarter-zip).

### Player and stat colours (UI, colour-blind safe)

Player colours never carry meaning on their own. Each one is paired with a shape (NFR-04).

| Player | Colour | Shape |
|---|---|---|
| P1 | `#E69F00` orange | ● circle |
| P2 | `#56B4E9` blue | ▲ triangle |
| P3 | `#009E73` green | ■ square |
| P4 | `#D55E00` vermillion | ◆ diamond |
| Jones | `#CC79A7` purple-pink | ★ star |

Stat colours (Cash, Energy, Health, Happiness, Social, Clout, Credit) always appear next to their icon. The icons are
hand-made SVG or Lucide (per tech-stack §4), **not** generated images.

---

## 3. Typography

| Role | Font | Notes |
|---|---|---|
| Display (titles, location names, big numbers) | **Bricolage Grotesque** (variable, 700–800) | Chunky and friendly, a good match for the outlines |
| UI and body | **Atkinson Hyperlegible Next** | Built for legibility. Helps NFR-04 |
| Numbers in the HUD | Atkinson, `font-variant-numeric: tabular-nums` | Counters don't jitter while they tick |

**No text is baked into images.** Signs, screens and posters in generated art are blank shapes or simple icons. The
game draws names and labels on top. This keeps localisation possible (NFR-06), avoids image-gen spelling mistakes, and
lets us rename locations without regenerating art.

---

## 4. Camera, framing and scale

| Asset type | View | Canvas | In-game size (1×) |
|---|---|---|---|
| Location buildings | Orthographic three-quarter front view: front facade, rotated ~20° to show the left side, camera slightly above. No perspective distortion | 1024 × 1024 | ~200 px |
| Characters (full body) | Front three-quarter, standing, feet visible | 1024 × 1536 | ~240 px tall |
| Character emotion sheets | Head and shoulders, 3 × 2 grid | 1536 × 1024 | ~96 px per bust |
| Items | Single object, three-quarter view, same angle as buildings | 1024 × 1024 | ~64–128 px |
| Event cards | Full-bleed scene, eye level | 1536 × 1024 | Card in a dialog |
| Home interiors | Cutaway "dollhouse" room, front view | 1536 × 1024 | Your Place screen |
| Board backdrop | Wide skyline panorama | 1536 × 1024 (tiles horizontally) | Behind the board |

The **board itself** (ring road, tiles, paths, location pads) is drawn in code in Pixi from the palette tokens, not
generated. It is data-driven (FR-30) and has to stay pixel-exact. Generated buildings sit on the pads.

**Player tokens** on the board are a circular badge with the avatar's head, a player-colour ring and the player's
shape symbol. They are composed in Pixi from the emotion-sheet busts.

**Motion** comes from Pixi tweens, not from frame-by-frame animation: idle bob, squash and stretch on arrival, emotion
swaps, particles (coins, confetti, sweat drops). Image generation cannot keep a character consistent across animation
frames. "Paper-puppet" motion avoids the problem and suits the board-game look. All of it respects reduced motion.

**Dark theme:** sprites are the same in both themes. The outlines keep them readable. At night (or in dark theme) the
board gets a Pixi colour-matrix tint and lit windows. We don't regenerate art.

---

## 5. Prompts

Every prompt has three parts, in this order:

```
[STYLE BLOCK]  +  [SUBJECT]  +  [FRAMING & BACKGROUND]
```

Copy the style block exactly, every time. Change only the subject. Small wording changes in the style block cause
style drift across the set.

### 5.1 Style block (shared by every asset)

```text
STYLE: Bold flat 2D vector illustration for a satirical life-sim board game set in 2026.
Clean geometric shapes with soft rounded corners. Every shape has a uniform thick dark outline
in #1F1B2E (about 6 px at 1024 px canvas width, same weight everywhere). Flat colour fills with
at most one hard-edged cel-shadow tone per surface, light from the top-left. No gradients, no
textures, no grain, no noise, no glow, no photorealism, no 3D render, no pixel art.
Chunky, toy-like proportions: characters are about 3 heads tall with simple friendly faces
(dot eyes, clear eyebrows, expressive mouths); buildings look like sturdy board-game pieces.
Restricted palette: cream #FFF6E9, ink #1F1B2E, coral #FF5A4E, mustard #FFC23D, teal #1FB5A8,
sky #5EB8FF, lilac #8E7CF0, mint #7EE0A1, blush #FFB3A7, slate #5B5872, plus natural diverse
skin tones. Robots and AI devices are always lilac. Money and gold are always mustard.
Tone: looks like a cheerful, optimistic fintech-app illustration, with small satirical details.
ABSOLUTELY NO text, letters, numbers, logos or brand marks anywhere. Signs, screens and posters
are blank coloured panels or simple pictograms.
```

### 5.2 Framing & background blocks

**Sprite (buildings, characters, items):**

```text
FRAMING: Single isolated subject, centred, fully inside the frame with a clear margin on all
sides. Nothing cropped.
BACKGROUND: Solid flat pure magenta #FF00FF filling the entire canvas edge to edge. No floor,
no ground plane, no cast shadow, no glow, no vignette, no other background elements.
```

**Scene (event cards, interiors, backdrop):**

```text
FRAMING: Full-bleed scene filling the whole canvas, no border, no frame, no rounded corners.
Keep the important action in the central 70% so the card can be cropped for mobile.
```

**Character sheet (emotion grids):**

```text
FRAMING: Character sheet. The SAME character drawn 6 times in a 3-column by 2-row grid of equal
cells, head and shoulders, all facing the same direction at the same size and scale. Identical
hair, clothes, colours and proportions in every cell; only the facial expression and small
props change. Clear empty space between cells.
BACKGROUND: Solid flat pure magenta #FF00FF everywhere, including between cells.
```

### 5.3 Subject templates

**Location building**

```text
SUBJECT: A single standalone building for the "<NAME>" location: <ONE-LINE DESCRIPTION>.
Visual gag: <GAG>. Main colours: <2–3 PALETTE COLOURS>.
Orthographic three-quarter front view: the front facade faces the viewer, rotated about 20
degrees so the left side wall is visible, camera slightly above. No perspective distortion.
The building sits on a small rounded slab base, like a board-game piece.
```

**Character (full body)**

```text
SUBJECT: Full-body character: <AGE/BUILD>, <SKIN TONE>, <HAIR>, wearing <OUTFIT>.
Personality: <PERSONALITY>. Pose: <POSE>. Expression: <EXPRESSION>.
Front three-quarter view, standing, feet visible.
```

**Emotion sheet** (cells left to right, top to bottom)

```text
SUBJECT: <SAME CHARACTER DESCRIPTION AS THE FULL-BODY PROMPT>.
Expressions in order: 1 neutral, 2 happy/celebrating, 3 stressed (sweat drop), 4 exhausted/
burnt out (bags under eyes, slumped), 5 shocked (wide eyes, open mouth), 6 proud/smug.
```

**Item**

```text
SUBJECT: A single <ITEM> as a game inventory item: <DETAIL>. Visual gag: <GAG>.
Three-quarter view from slightly above, same angle as the buildings.
```

**Event card**

```text
SUBJECT: Event card illustration for "<EVENT TITLE>": <WHAT IS HAPPENING, WHO, WHERE>.
Mood: <MOOD>. The player character is <DESCRIPTION or "a generic young adult in a coral hoodie">.
```

### 5.4 Worked example (complete prompt)

```text
STYLE: <style block 5.1, verbatim>

SUBJECT: A single standalone building for the "Burger Bot" location: a small fast-food diner
with a big rounded front window and a striped awning in coral and cream. Inside the window, a
lilac robot arm flips burgers while one tired human cashier stands beside it. A giant burger
pictogram sign on the roof, with a delivery drone parked next to it. Visual gag: a queue of
lilac delivery robots waits at the takeaway hatch, and there are no human customers. Main
colours: coral, mustard, cream, with lilac for the robots.
Orthographic three-quarter front view: the front facade faces the viewer, rotated about 20
degrees so the left side wall is visible, camera slightly above. No perspective distortion.
The building sits on a small rounded slab base, like a board-game piece.

FRAMING: <sprite framing block>
BACKGROUND: <sprite background block>
```

### 5.5 Codex command

From the skill ([.claude/skills/codex-image/SKILL.md](../.claude/skills/codex-image/SKILL.md)). Run one image per call,
from the target folder, and attach the approved style anchor with `-i` once it exists (§7):

```powershell
Set-Location art/src/locations
codex exec --skip-git-repo-check -s workspace-write -i ../_anchor/style-anchor.png `
  "Use your built-in image generation tool (not the API/CLI fallback) to create the image described below. Match the illustration style of the attached reference image exactly (outline weight, palette, shading, proportions) but NOT its subject. Save the PNG in the current directory as burger-bot.png. Reply with the file path.

<FULL PROMPT>"
```

Save the full prompt next to each image as `<id>.prompt.txt`, so any asset can be regenerated or tweaked later.

---

## 6. Pipeline

```
prompt (.prompt.txt) ─► codex exec ─► art/src/<category>/<id>.png  (raw, 1024–1536 px)
        ─► review against checklist (§8)
        ─► pnpm sprites: key out #FF00FF, trim, resize to 2× display size, pack
        ─► apps/web/public/assets/atlases/<atlas>.{webp,json}   (sprites, Pixi v8 spritesheets)
            apps/web/public/assets/<events|backgrounds>/<id>.webp (scenes)
```

- **Background removal:** image generation does not reliably return transparency, so sprites come back on flat
  magenta. `pnpm sprites` (`apps/web/scripts/sprites/`, using `sharp`) scores each pixel by `min(R, B) − G`. That
  score is 255 on the key and at most ~20 for every palette colour and skin tone. Edge pixels in between get partial
  alpha, and the key colour is un-mixed out of them, which removes the magenta fringe. The thick ink outline means the
  edge next to the key colour is always dark, which makes this clean.
- **Atlases** (each stored at 2× display size, with `meta.scale: 2` so frames draw at 1×):

  | Atlas | Frames | Fit (2×) | Anchor |
  |---|---|---|---|
  | `characters` | full bodies, by ID (`player-01`, `jones`) | 320 × 480 | bottom centre |
  | `busts` | emotion-sheet cells, `<character>/<emotion>` | 192 × 192 | centre |
  | `locations` | buildings, by ID | 400 × 400 | bottom centre |
  | `items` | items and outfits, by ID | 256 × 256 | centre |

  Emotion names are `neutral`, `happy`, `stressed`, `exhausted`, `shocked`, `proud`. Jones's sheet maps onto them:
  humble-brag → `proud`, rattled → `stressed`, "posting through it" → `exhausted`. Sheets are sliced at the emptiest
  gutter near each grid line, so slightly uneven generations still split cleanly.
- **Scenes** (event cards, backdrop, interiors) are full-bleed, so they are only re-encoded as WebP.
- **File names match content IDs** (`burger-bot`, `item-air-fryer`, `npc-leaselord`, `event-rent-hike`), so the
  content JSON can reference art by ID.
- `art/src/` holds the raw generations and prompts (Git LFS). Only processed files ship. The processed files are
  committed, so CI and builds don't need LFS or `sharp`. Re-run `pnpm sprites` and commit the output whenever art changes.

---

## 7. Generation order (style lock)

Image generation drifts unless every asset is anchored to one reference. Do it in this order:

1. **Style anchor.** One 1536 × 1024 image: two characters (the default player and Jones) standing next to one
   building (Burger Bot) and three items, on magenta. Iterate until it is right. **This image defines the game's look.**
   Save it as `art/src/_anchor/style-anchor.png`.
2. **Cast.** Default player avatars and Jones, full body and emotion sheets, each with `-i style-anchor.png`.
3. **MVP locations** (§9.1), each with `-i style-anchor.png`.
4. **Items, NPC owners, event cards.**
5. **Backdrop and Your Place interiors.**

Confirm batch sizes before generating. Each image uses about 18k tokens of the ChatGPT plan quota.

---

## 8. Acceptance checklist

A generated asset is accepted only if:

- [ ] There is no text, letters, numbers or logo anywhere (check signs, screens, clothing).
- [ ] The outline is the same weight as the style anchor, and every shape has one.
- [ ] Colours stay in the palette (allowing for skin tones). Robots are lilac, money is mustard.
- [ ] There are no gradients, glow, texture or soft shadows.
- [ ] Sprites: the background is flat magenta edge to edge, with no ground shadow and nothing cropped.
- [ ] The camera angle matches the category (§4).
- [ ] Characters: the same person as their reference (hair, outfit, skin tone, proportions).
- [ ] It reads clearly at in-game size. Shrink it to 200 px and look again.
- [ ] The satire punches up (at systems, landlords, apps, Jones), never down (NFR-07).

---

## 9. MVP asset list

### 9.1 Locations

| ID | Location | Description | Visual gag | Colours |
|---|---|---|---|---|
| `your-place-1`…`5` | Your Place | One exterior per housing tier: parents' suburban house (basement window lit), shared house, studio in a block, apartment, smart condo | Tier 1: a mattress visible through the basement window. Tier 5: everything is a touchscreen, including the door | Varies by tier, cosiest at the top |
| `leaselord` | LeaseLord | A rental office built in the shape of a giant smartphone | A huge key on a chain and a queue of tenants holding application folders | Teal, slate, coral |
| `joblink` | JobLink Hub | A glass recruitment office | A lilac robot "screener" at the door sorting CVs into a bin | Sky, cream, lilac |
| `hitech-u` | Hi-Tech U Online* | A small campus building with a graduation-cap roof and a giant laptop in front | A diploma pinned to a ball and chain | Mustard, teal |
| `fulfillment` | Fulfillment Center | A big warehouse with loading bays and conveyor belts | Lilac robots outnumber the one human picker, who wears a step-counter | Slate, coral, lilac |
| `burger-bot` | Burger Bot | See §5.4 | Robot arm cooking, delivery robots queuing | Coral, mustard, lilac |
| `freshmart` | FreshMart | A corner grocery store with fruit crates outside | The price tags on the crates are tiny pictograms of rising arrows | Mint, coral, cream |
| `thriftup` | ThriftUp / FastFash | A split building: a cosy thrift shop on one side, a glossy fast-fashion shop on the other | A clothes rack spills from one side into the other | Blush, mustard |
| `circuit-planet` | Circuit Planet | An electronics store with a planet-shaped dome roof | A shop window full of near-identical phones | Sky, lilac, ink |
| `neobank` | NeoBank | A sleek bank pod with a huge coin-slot door | A vault door shaped like an app icon. Small crypto coins orbit the roof | Teal, mustard |
| `gighub` | GigHub | A street kiosk with a phone on a pole | A scooter, an e-bike and a delivery bag piled up, with a surge-pricing lightning bolt | Coral, lilac |

\* **IP check:** [README](../README.md) says "Hi-Tech U" is the original game's location name. Rename this location before any
public build, for example **"UpSkill U"** or **"Degree.ai"**.

### 9.2 Characters

| ID | Who | Description |
|---|---|---|
| `player-01`…`06` | Default avatars | 6 diverse young adults (mixed genders, skin tones, body types) in casual 2026 clothes: hoodie, cardigan, work polo, overalls, puffer jacket, headscarf. Each has a full body and an emotion sheet |
| `jones` | Jones | Late-20s man, too-perfect hair, gleaming teeth, dark `ink` quarter-zip over a crisp shirt, gold (`mustard`) smartwatch and wireless earbuds, oat-milk latte in one hand, phone held up for a selfie. Smug, always posing. Emotion sheet: neutral-smug, celebrating, humble-bragging, rattled, shocked, "posting through it" |
| `jones-grinder` / `-crypto` / `-wellness` / `-influencer` | Jones variants (FR-81, v1.0) | Same face and build. Only the outfit and props change: blazer and two phones, laser-eye sunglasses and a gold coin, yoga set and green smoothie, ring light and gimbal |
| `npc-<location>` | Location owners (FR-32) | One bust per location, for example an over-friendly landlord in a fleece vest holding a tablet, or a burger-bot manager who is half human, half robot (lilac) |

### 9.3 Items (FR-60)

`item-laptop`, `item-ai-assistant` (a lilac smart speaker with a subscription badge), `item-fridge`, `item-e-scooter`,
`item-headphones`, `item-air-fryer`, `item-smart-lock`, `item-phone`, plus wardrobe tiers `outfit-casual`,
`outfit-smart`, `outfit-business` and `outfit-founder-hoodie`.

### 9.4 Event cards (first batch)

Generate one illustration per **category** first (FR-71). Individual events reuse category art until they get their own:
`event-work` (a layoff meeting with a lilac robot taking notes), `event-money` (coins falling out of a cracked phone),
`event-life` (a wedding invitation avalanche), `event-health` (a person asleep on their keyboard),
`event-housing` (a landlord sliding a rent-hike note under the door), `event-viral` (a phone erupting with heart and fire
pictograms), `event-climate` (a melting air conditioner in a heatwave).

### 9.5 Backgrounds

`backdrop-day` (a wide city skyline: modest rental blocks in the foreground, a glossy lilac AI-company tower dominating
the skyline, cranes, a few delivery drones) and `interior-tier-1`…`5` (Your Place rooms).

**MVP total:** about 55 images (1 anchor + 7 cast × 2 + 15 buildings + 12 items + 7 events + 6 backgrounds), plus
retries. NPC owner busts (FR-32) and the Jones variants are v1.0.
