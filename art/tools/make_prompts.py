"""Write art/src/<category>/<id>.prompt.txt for the MVP asset list (art-direction §9)."""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent / "src"

STYLE = (ROOT / "_anchor" / "style-anchor.prompt.txt").read_text().split("\n\nSUBJECT:")[0]

SPRITE = """FRAMING: Single isolated subject, centred, fully inside the frame with a clear margin on all
sides. Nothing cropped.
BACKGROUND: Solid flat pure magenta #FF00FF filling the entire canvas edge to edge. No floor,
no ground plane, no cast shadow, no glow, no vignette, no other background elements."""

SCENE = """FRAMING: Full-bleed scene filling the whole canvas, no border, no frame, no rounded corners.
Keep the important action in the central 70% so the card can be cropped for mobile."""

SHEET = """FRAMING: Character sheet. The SAME character drawn 6 times in a 3-column by 2-row grid of equal
cells, head and shoulders, all facing the same direction at the same size and scale. Identical
hair, clothes, colours and proportions in every cell; only the facial expression and small
props change. Clear empty space between cells.
BACKGROUND: Solid flat pure magenta #FF00FF everywhere, including between cells."""

BUILDING_VIEW = """Orthographic three-quarter front view: the front facade faces the viewer, rotated about 20
degrees so the left side wall is visible, camera slightly above. No perspective distortion.
The building sits on a small rounded slab base, like a board-game piece."""

ITEM_VIEW = "Three-quarter view from slightly above, same angle as the buildings."

EMOTIONS = ("Expressions in order: 1 neutral, 2 happy/celebrating, 3 stressed (sweat drop), 4 exhausted/\n"
            "burnt out (bags under eyes, slumped), 5 shocked (wide eyes, open mouth), 6 proud/smug.")
JONES_EMOTIONS = ("Expressions in order: 1 neutral-smug, 2 celebrating, 3 humble-bragging (hand on chest, fake modest smile),\n"
                  "4 rattled (forced smile, sweat drop), 5 shocked (wide eyes, open mouth), 6 \"posting through it\" (grim smile, typing on phone).")

# id -> (canvas, body)
assets: dict[str, dict[str, tuple[str, str]]] = {"characters": {}, "locations": {}, "items": {}, "events": {}, "backgrounds": {}}

PLAYERS = {
    "player-01": "a young adult around 24, medium-brown skin, short curly black hair, wearing a coral hoodie, slate jeans, white sneakers and a teal backpack. Personality: hopeful, slightly tired",
    "player-02": "a young woman around 26, light skin with freckles, shoulder-length wavy red hair, round glasses, wearing a mustard cardigan over a cream top, teal skirt, dark tights and ankle boots, tote bag. Personality: bookish, anxious overachiever",
    "player-03": "a young man around 25, East Asian, black undercut hair, wearing a teal work polo with a blank name badge, slate chinos, black work shoes, lanyard. Personality: earnest, grinding through shifts",
    "player-04": "a young woman around 23, deep dark-brown skin, short natural afro with a mint headband, plus-size, wearing sky-blue denim overalls over a coral t-shirt, chunky sneakers, paint-splattered. Personality: creative, upbeat hustler",
    "player-05": "a young man around 27, tan South Asian skin, neat beard, wearing a lilac puffer jacket over a slate hoodie, black joggers, sneakers, delivery bag strap across chest. Personality: easy-going gig worker",
    "player-06": "a young woman around 24, warm olive-brown skin, wearing a coral headscarf (hijab), a long mint shirt over slate trousers, white sneakers, laptop under one arm. Personality: focused, quietly ambitious",
}
for pid, desc in PLAYERS.items():
    assets["characters"][pid] = ("1024x1536 portrait", f"""SUBJECT: Full-body character: {desc}.
Pose: relaxed standing pose, one hand slightly raised in a small wave. Expression: friendly.
Front three-quarter view, standing, feet visible.

{SPRITE}""")
    assets["characters"][f"{pid}-emotions"] = ("1536x1024 landscape", f"""SUBJECT: {desc}. This is the same character as the attached full-body reference image ({pid}.png): match hair, skin tone, clothes and colours exactly.
{EMOTIONS}

{SHEET}""")

JONES = ("late-20s man, light skin, too-perfect swept brown hair, gleaming teeth, dark ink-coloured (#1F1B2E) quarter-zip "
         "over a crisp cream shirt collar, cream chinos, white sneakers, mustard gold smartwatch and gold wireless earbuds")
assets["characters"]["jones"] = ("1024x1536 portrait", f"""SUBJECT: Full-body character: Jones, the smug rival: {JONES}. Oat-milk latte in one hand, phone held up for a selfie in the other.
Personality: smug, always posing, always photographed from his good side. Pose: selfie pose. Expression: dazzling smug grin.
Front three-quarter view, standing, feet visible. He is the same Jones as in the attached style reference.

{SPRITE}""")
assets["characters"]["jones-emotions"] = ("1536x1024 landscape", f"""SUBJECT: Jones, the smug rival: {JONES}. Same character as the attached full-body reference (jones.png).
{JONES_EMOTIONS}

{SHEET}""")

LOCATIONS = {
    "your-place-1": ("Your Place (tier 1: Parents' Basement)", "a modest suburban family house with a small lawn, the half-sunk basement window lit up warmly", "a bare mattress and a gaming chair visible through the basement window", "cream, mint, slate"),
    "your-place-2": ("Your Place (tier 2: Shared House)", "a slightly run-down shared terrace house with mismatched curtains in every window and several bins out front", "five bikes chained to the railing and a chore-rota panel taped to the door (blank)", "blush, slate, mustard"),
    "your-place-3": ("Your Place (tier 3: Studio)", "a narrow studio-apartment block, tall and thin, with tiny balconies", "one tiny window with a bed, desk and kitchen all crammed into the same view", "teal, cream, coral"),
    "your-place-4": ("Your Place (tier 4: Apartment)", "a tidy mid-rise apartment building with plant-filled balconies and a lobby door", "a lilac parcel robot stacking delivery boxes in the lobby", "sky, mint, cream"),
    "your-place-5": ("Your Place (tier 5: Smart Condo)", "a sleek glass smart-condo tower piece with a rooftop garden", "everything is a touchscreen, including the door, the mailbox and a doorbell camera on a stalk", "lilac, sky, cream"),
    "leaselord": ("LeaseLord", "a rental office built in the shape of a giant smartphone standing upright, its screen being the glass front door", "a huge mustard key hanging on a chain, and a queue of tiny tenants holding application folders", "teal, slate, coral"),
    "joblink": ("JobLink Hub", "a glass recruitment office with a revolving door", "a lilac robot screener at the door sorting paper CVs into a bin", "sky, cream, lilac"),
    "hitech-u": ("UpSkill U (online university)", "a small campus building with a graduation-cap roof and a giant laptop standing in front like a monument", "a diploma scroll attached to a ball and chain", "mustard, teal"),
    "fulfillment": ("Fulfillment Center", "a big warehouse with loading bays and conveyor belts poking out", "lilac robots outnumber the one tired human picker, who wears a step-counter wristband", "slate, coral, lilac"),
    "burger-bot": ("Burger Bot", "a small fast-food diner with a big rounded front window and a striped awning in coral and cream; inside the window a lilac robot arm flips burgers while one tired human cashier stands beside it; a giant burger pictogram sign on the roof with a lilac delivery drone parked next to it", "a queue of lilac delivery robots waits at the takeaway hatch, and there are no human customers. Match the Burger Bot building in the attached style reference closely", "coral, mustard, cream, with lilac for the robots"),
    "freshmart": ("FreshMart", "a corner grocery store with fruit and vegetable crates outside under an awning", "the price tags on the crates are tiny pictograms of upward arrows", "mint, coral, cream"),
    "thriftup": ("ThriftUp / FastFash", "a split building: a cosy wooden thrift shop on the left half, a glossy fast-fashion shop on the right half", "a clothes rack spills from one side into the other", "blush, mustard"),
    "circuit-planet": ("Circuit Planet", "an electronics store with a planet-shaped dome roof with a ring around it", "a shop window full of near-identical phones", "sky, lilac, ink"),
    "neobank": ("NeoBank", "a sleek rounded bank pod with a huge coin-slot door", "a vault door shaped like a rounded app icon, and small mustard crypto coins orbiting the roof", "teal, mustard"),
    "gighub": ("GigHub", "a small street kiosk with a big phone mounted on a pole", "a scooter, an e-bike and a delivery bag piled up beside it, with a mustard surge-pricing lightning bolt sign", "coral, lilac"),
}
for lid, (name, desc, gag, cols) in LOCATIONS.items():
    assets["locations"][lid] = ("1024x1024 square", f"""SUBJECT: A single standalone building for the "{name}" location: {desc}.
Visual gag: {gag}. Main colours: {cols}.
{BUILDING_VIEW}

{SPRITE}""")

ITEMS = {
    "item-laptop": ("laptop", "a teal laptop with a blank screen, slightly open", "a sticky note on the bezel (blank) and a tiny lilac AI sparkle icon on screen"),
    "item-ai-assistant": ("AI assistant smart speaker", "a round lilac smart speaker with three glowing dots", "a mustard subscription badge dangling from it like a price tag"),
    "item-fridge": ("smart fridge", "a tall cream smart fridge with a small blank touchscreen on the door", "a padlock and chain across the doors with a lilac subscription badge"),
    "item-e-scooter": ("e-scooter", "a coral electric scooter with a phone mount", "a lilac lock-screen pictogram on the handlebar display"),
    "item-headphones": ("noise-cancelling headphones", "chunky over-ear sky-blue headphones", "a tiny lilac ad-bubble pictogram popping out of one ear cup"),
    "item-air-fryer": ("air fryer", "a chunky slate-and-cream air fryer with a basket handle", "it is bigger than it should be, with a single lonely fry in the basket"),
    "item-smart-lock": ("smart door lock", "a lilac keypad smart lock on a small slab of door", "a blank low-battery pictogram blinking on the keypad"),
    "item-phone": ("smartphone", "a slim coral smartphone with a blank sky-blue screen showing simple app pictograms", "a cracked corner and a mustard coin pictogram notification bubble"),
    "outfit-casual": ("casual outfit on a hanger", "a coral hoodie and slate jeans on a single clothes hanger", "a small blank thrift tag"),
    "outfit-smart": ("smart-casual outfit on a hanger", "a teal button-up shirt, cream chinos and a mustard knit tie on a single clothes hanger", "a crisp fold line still visible from the packaging"),
    "outfit-business": ("business suit on a hanger", "an ink-coloured blazer and trousers with a cream shirt and coral tie on a single hanger", "a long receipt hanging from the sleeve"),
    "outfit-founder-hoodie": ("founder hoodie on a hanger", "a premium ink-coloured hoodie with a mustard zip on a single hanger", "an absurdly large mustard price tag"),
}
for iid, (what, detail, gag) in ITEMS.items():
    assets["items"][iid] = ("1024x1024 square", f"""SUBJECT: A single {what} as a game inventory item: {detail}. Visual gag: {gag}.
{ITEM_VIEW}

{SPRITE}""")

EVENTS = {
    "event-work": ("You're Being Restructured", "a small glass meeting room where a nervous manager delivers bad news to the player while a lilac robot sits at the table taking notes on a tablet", "awkward, darkly funny"),
    "event-money": ("Payday Panic", "a giant cracked phone with mustard coins pouring out of the crack while the player tries to catch them", "chaotic, comic"),
    "event-life": ("Wedding Season", "an avalanche of blank wedding invitation envelopes burying the player in their tiny apartment", "overwhelmed, comic"),
    "event-health": ("Burnout", "the player asleep face-down on their laptop keyboard at night in a cluttered home office, cold coffee cups around", "tired, sympathetic"),
    "event-housing": ("Rent Hike", "an over-friendly landlord in a fleece vest sliding a blank note with a big upward arrow pictogram under the player's apartment door", "uneasy, satirical"),
    "event-viral": ("You Went Viral", "the player's phone erupting with heart and fire pictograms like a fountain, the player stunned", "exciting, overwhelming"),
    "event-climate": ("Heatwave", "a melting air conditioner dripping off a window in a heatwave, the player fanning themselves with a paper fan on a city street", "sweltering, comic"),
}
for eid, (title, what, mood) in EVENTS.items():
    assets["events"][eid] = ("1536x1024 landscape", f"""SUBJECT: Event card illustration for "{title}": {what}.
Mood: {mood}. The player character is a generic young adult in a coral hoodie.

{SCENE}""")

assets["backgrounds"]["backdrop-day"] = ("1536x1024 landscape", f"""SUBJECT: Wide daytime city skyline panorama to sit behind a board game: modest rental blocks in the foreground, a glossy lilac AI-company tower dominating the skyline, construction cranes, a few lilac delivery drones in a sky-blue sky with flat cream clouds. The left and right edges must line up so the image tiles seamlessly horizontally. Keep the lower third simple and low-contrast so game pieces read in front of it.

{SCENE}""")
INTERIORS = {
    1: "a parents' basement bedroom: a mattress on the floor, a gaming chair, boxes of childhood stuff, a small high window, laundry machine in the corner",
    2: "a cramped shared-house bedroom: single bed, clothes rack, a door with a blank chore rota, a mini fridge with a padlock",
    3: "a studio apartment where bed, desk and kitchenette share one small room, fold-down table, plants on the window sill",
    4: "a comfortable one-bedroom apartment living room: sofa, bookshelf, standing desk, plants, a big window with a city view",
    5: "a sleek smart condo: floor-to-ceiling windows, touchscreen walls (blank), a lilac robot vacuum, a designer sofa, rooftop view",
}
for tier, desc in INTERIORS.items():
    assets["backgrounds"][f"interior-tier-{tier}"] = ("1536x1024 landscape", f"""SUBJECT: Cutaway "dollhouse" room interior seen from the front, the front wall removed: {desc}. Nobody in the room. Leave clear floor space in the centre for a character to stand.

{SCENE}""")

n = 0
manifest = []
for cat, items in assets.items():
    d = ROOT / cat
    d.mkdir(parents=True, exist_ok=True)
    for aid, (canvas, body) in items.items():
        (d / f"{aid}.prompt.txt").write_text(f"{STYLE}\n\n{body}\n", encoding="utf-8")
        manifest.append(f"{cat}\t{aid}\t{canvas}")
        n += 1
(ROOT.parent / "manifest.tsv").write_text("\n".join(manifest) + "\n")
print(n, "prompts written")
