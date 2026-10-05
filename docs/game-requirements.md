# Game Requirements — Fast Lane 2026

## 1. Vision

A satirical, quick-to-learn life sim board game about trying to "make it" in 2026. You juggle rent, groceries,
an AI that wants your job, a side hustle that might go viral, and a smug rival named **Jones** who seems to be winning
at everything. Each turn is one week, and you should always want to play "just one more week."

**Pillars**

1. **One more week.** Turns are short (60–120 s). Every turn ends with a hook: a cliffhanger, a payoff or a near miss.
2. **Relatable satire.** Modern problems played for laughs, but never in a mean-spirited way. Things like the landlord app,
   surge pricing, a "Senior Prompt Engineer (unpaid)" job ad, and influencer burnout.
3. **Meaningful trade-offs.** Time, money, energy and wellbeing all compete. No single strategy works every run.
4. **Quietly educational.** Compound interest, debt traps, credit scores, diversification and burnout are things you
   feel in the systems, not things the game lectures you about.
5. **Respect the player.** Engagement comes from good design, not from exploitation (see §13.3).

**Audience:** ages 16+. The core audience is 20–40-year-olds who grew up with the original, or who are living the
2026 economy. Sessions should work for both a 5-minute break and a 1-hour run.

**Platforms:** modern desktop and mobile browsers, installable as a PWA. Layouts for portrait mobile and landscape desktop.

---

## 2. Core Loop

```
Set life goals ─► Week starts (60 hrs of time, energy bar)
      ▲                    │
      │        Move around the city board (travel costs time)
      │        Work · Study · Shop · Eat · Rest · Hustle · Invest
      │                    │
      │        Week ends ─► Rent/bills/subscriptions auto-charge
      │                    ─► Weekend event (random, choice-driven)
      │                    ─► News ticker: market moves, AI disruption, rent hikes
      │                    ─► Goal progress animation + Jones's week recap
      └──────── Next-week teaser (cliffhanger) ◄─┘
```

| ID | Requirement | Pri |
|---|---|---|
| FR-01 | The game is turn-based. 1 turn = 1 in-game week. Each player has a **Time** budget per week (default 60 hours). These are *discretionary waking hours*: sleep is not spent from the budget, but its quality comes from housing, Energy and stress. | M |
| FR-02 | Travelling between locations costs time, based on distance around the board. The transport mode changes the cost (walk / e-scooter / transit / car / rideshare). | M |
| FR-03 | Every action shows its time cost, money cost and stat effects **before** the player commits. | M |
| FR-04 | The turn ends when time runs out or the player chooses "End Week". Any time left over gives a small rest bonus. | M |
| FR-05 | End-of-week processing runs in this fixed order. **Per player**, straight after their turn: food check → bills/rent/subscriptions → interest/debt payments → job/AI-disruption checks → stat decay & recovery (Energy, Health, Social, Relationships) → weekend event → quest progress. **Once per round**, after every player (including Jones) has played the week: market move → news → goal check (FR-11) → next-week teasers. | M |
| FR-05a | **Rounds:** in multiplayer, everyone plays the same calendar week in sequence. Shared world state (prices, market, news, job openings) only changes between rounds, so no player gets a better market by going later. | M |
| FR-06 | Hotseat multiplayer for 1–4 human players plus optional AI rivals. Players take turns in sequence. | M |

---

## 3. Goals & Win Conditions

At the start of a game the player sets targets for four goals (the original's Wealth/Happiness/Education/Career, updated):

| Goal | Measured by | Notes |
|---|---|---|
| **Wealth** | Net worth = cash + savings + investments + assets − debt | Debt counts against you, so BNPL can't fake progress. Items count at their **resale value** (not the price paid), so buying gadgets can't inflate net worth |
| **Wellbeing** | Mix of Happiness, Health, Social and Relationships (§9) | Replaces "Happiness". Neglecting any one part drags the score down (e.g. a weighted mean with a penalty for the lowest part). In MVP, before §9 ships, it uses Happiness, Health and Social only |
| **Skills** | Credential points + skill points | Each credential (degree, bootcamp, certification) is worth fixed points. Skill points come from study hours in skill tracks (e.g. AI Tools, Trades, Business, Care), with diminishing returns per track so broad learning pays |
| **Career** | Job level × stability, + a reputation bonus | Stability = 1 − (AI Exposure × 0.5), so a high-paying job with a high AI-risk score counts for less. Reputation is an **additive** bonus, not a multiplier, so the score isn't 0 before reputation sources exist (MVP) |

| ID | Requirement | Pri |
|---|---|---|
| FR-10 | Players choose a difficulty preset (**Chill / Standard / Hustle Culture**) or set custom targets for each goal (sliders). | M |
| FR-11 | Win: the first player to reach all four targets, checked at the **end of a round** so turn order gives no advantage. If several players qualify in the same round, the biggest total overshoot wins. | M |
| FR-12 | Loss/timeout options: an optional week limit (e.g. 52 weeks). If time runs out, the highest **score** wins: the average of progress toward each target, each capped at 100%. The same formula is used for the Daily Run score. | S |
| FR-14 | **No game-overs, no softlocks.** Running out of money leads to setbacks, not a dead end: missed rent → warning → eviction to *Parents' Basement* (always available, $0 rent, −Happiness); unpaid debt → collections and a credit-score hit; a jobless, broke player can always do GigHub work or a free basic job. Every state must have at least one action that earns money. | M |
| FR-13 | Goal progress is always visible as four rings or bars. Progress animates at the end of each week. | M |

---

## 4. Player Stats

| Stat | Range | Effects |
|---|---|---|
| Cash | $ | Spent on everything. Carrying a lot of cash raises the risk of theft or scams |
| Time | 0–60 hrs/week | The action budget |
| Energy | 0–100 | Low energy makes work and study less effective. At 0: forced rest and a **burnout** event |
| Health | 0–100 | Affected by food quality, sleep, gym and stress. Low health means sick days and medical bills |
| Happiness | 0–100 | Goes up with fun, purchases, home quality and wins. Goes down with stress, debt and bad events |
| Social | 0–100 | Friends and network. Unlocks referrals and better job offers, and protects against burnout |
| Relationship | 0–100 per relationship | Partner/family bond (see §9). Feeds the Wellbeing goal. Strong bonds buffer stress, neglect leads to breakups |
| Age & Life Stage | years | Unlocks stage-specific options, events and pressures (see §9.1) |
| Reputation / Clout | 0–100 | Needed for creator, freelance and executive paths |
| Credit Score | 300–850 | Sets loan rates, rental approval and BNPL limits |
| Hunger | flag | If you don't eat during a week: an energy and health penalty |
| Wardrobe | tier | Some jobs need a minimum dress tier (Casual / Smart / Business / "Founder Hoodie") |

| ID | Requirement | Pri |
|---|---|---|
| FR-20 | All stats above are simulated and shown in a compact HUD. Detail is available on tap. | M |
| FR-21 | Stats affect each other in visible ways (e.g. "−20% work output: low energy" shown on the action). | M |
| FR-22 | Character background chosen at start: e.g. *Student-loan grad*, *Laid-off tech worker*, *Trades apprentice*, *Living with parents*, *Small-town mover*. Each changes the starting stats, debt and perks. | S |

---

## 5. The City Board (Locations)

The board is a loop of locations, like the original. Each location has an owner/NPC with a personality,
hires workers (jobs), and offers actions.

| Location | Modern twist | Key actions | Pri |
|---|---|---|---|
| **Your Place** | Housing tiers: *Parents' Basement* → *Shared House* → *Studio* → *Apartment* → *Smart Condo* | Rest, WFH, eat stored food, hustle from home | M |
| **LeaseLord** (rental office/app) | Rent rises randomly, bidding wars, deposits, credit checks | Rent / move / renew lease / dispute hike | M |
| **JobLink Hub** | Job board with ghosting, AI screening and "entry-level, 5 yrs experience" ads | Apply, view requirements, networking events | M |
| **UpSkill U Online** (Community College + Bootcamp) | Degrees vs. bootcamps vs. AI certifications. Student loans | Enrol, study (time), take exams | M |
| **Fulfillment Center** | The old Factory. Steady pay, high automation risk, robots | Work shifts | M |
| **Ghost Kitchen / Burger Bot** | Fast food and the delivery economy | Eat (cheap, unhealthy), work | M |
| **FreshMart** | Groceries. Prices hit by inflation | Buy food (healthier, cheaper per meal, needs a fridge) | M |
| **ThriftUp / FastFash** | Clothing for job tiers. Thrift is cheap but random | Buy clothes | M |
| **Circuit Planet** | Electronics: phone, laptop, AI assistant subscription, e-scooter | Buy gadgets that boost productivity | M |
| **NeoBank** | Savings (APY), index funds, crypto, credit card, BNPL, loans | Deposit, invest, borrow, repay | M |
| **ResaleIt** (pawn/marketplace) | Sell used items, flip goods, buy second-hand | Sell, buy cheap, flip side hustle | S |
| **GigHub** | Rideshare / delivery / microtask apps. Flexible, no benefits, surge pricing | Work gigs anywhere (pay varies by the hour) | M |
| **Pulse Gym & Clinic** | Wellness, therapy, health insurance | Exercise, therapy, check-up | S |
| **The Daily Grind** café / co-working | Social hub and remote-work spot | Socialise, network, cowork | S |
| **CreatorLab Studio** | Content creation. Viral lottery, brand deals, burnout | Make content, stream, sponsorships | S |
| **StartupGarage** | Found a startup: pitch, raise, pivot, exit or flame out | Late-game high-risk path | C |
| **Civic Center** | Taxes, benefits, voting events, community service, marriage licences, family court | File taxes, apply for assistance, marry, file for divorce | C |
| **Vows & Venues** | Wedding industry satire: everything costs 3× once you say "wedding" | Buy rings, book a wedding (includes the marriage licence until Civic Center ships), plan anniversaries | S |
| **Little Steps Daycare** | Childcare costs more than rent | Enrol kids (frees parent time for a weekly fee) | C |

| ID | Requirement | Pri |
|---|---|---|
| FR-30 | Board layout, travel costs and location data are data-driven (content files), not hard-coded. | M |
| FR-31 | Opening hours: some locations close on certain days or times, shown on the board. | C |
| FR-32 | Each location has an NPC owner with short, rotating, witty dialogue lines. | S |

---

## 6. Jobs & Career

| ID | Requirement | Pri |
|---|---|---|
| FR-40 | Each job has: employer location, level, wage per hour, required skills/credentials, dress tier, minimum experience, **AI Exposure %**, benefits (health/PTO), and a remote option. | M |
| FR-41 | Career ladders at each employer (e.g. Fulfillment: Picker → Shift Lead → Robot Wrangler → Ops Manager). | M |
| FR-42 | **AI Disruption:** each week, each job rolls for disruption. AI Exposure % is a *relative* risk, not the weekly chance: weekly chance = base rate (balance value, e.g. 2%) × AI Exposure, changed by news. A hit means hours cut, the role "restructured" or a layoff, in that order of likelihood. A layoff gives a one-week warning teaser where possible. Upskilling in AI tools lowers your personal exposure and raises output. | M |
| FR-43 | Experience builds per hour worked. Promotions need experience, skills and a performance score. Wages are paid at the end of each shift (not at the end of the week), so the first paycheck lands in the tutorial (ENG-20). | M |
| FR-44 | Gig work: available anywhere through GigHub, pays variable rates with surges and deactivation risk, gives no experience toward ladders, and is very flexible. | M |
| FR-45 | Side hustles: create passive or semi-passive income (online store, newsletter, flipping, tutoring, AI agency). They need setup time and can grow or die out. | S |
| FR-46 | Remote jobs: work from Your Place (no commute), but Social drains faster. | S |
| FR-47 | Some job offers are scams ("Crypto Ambassador, $5k/week!"). Players can spot them by reading the details. | S |

**Example AI Exposure by job (starting values):** Data Entry 85%, Call Center 75%, Picker 60%, Junior Copywriter 70%,
Line Cook 25%, Electrician 10%, Nurse 10%, AI Ops Engineer 15%, Barista 30%.

---

## 7. Economy & Finance

| ID | Requirement | Pri |
|---|---|---|
| FR-50 | **Inflation:** the price index drifts each week. News events can cause shocks. Wages lag behind prices. | M |
| FR-51 | **Rent** goes up when the lease renews, with occasional hikes. Better housing means better rest, happiness and security, and less theft. | M |
| FR-52 | **Subscriptions:** streaming, cloud, AI assistant, gym, delivery pass. Each gives a small buff and auto-charges every week. A "Subscription Audit" action shows the total drain. | M |
| FR-53 | **Banking:** a savings account with APY, an index fund (low volatility), individual "meme" stocks (high volatility) and crypto (extreme volatility, rug-pull events). | M |
| FR-54 | **Debt:** student loans, credit card (high APR, minimum payments), BNPL (feels free, late fees hurt), personal loans. All of it affects the credit score. | M |
| FR-55 | Market simulation: a seeded random walk with regime changes (bull, bear, crash, AI bubble) shown in the news ticker. | M |
| FR-56 | Taxes: a simple annual tax event. Gig and side-hustle income needs you to set money aside. | C |
| FR-57 | Theft/scams: carrying lots of cash, cheap housing or phishing events can cost money. Bank deposits and security upgrades lower the risk. | S |

---

## 8. Items & Possessions

| ID | Requirement | Pri |
|---|---|---|
| FR-60 | Items give persistent buffs: Laptop (needed for remote work and online study), AI Assistant sub (+output), Fridge (store groceries), E-scooter/EV (less travel time), Noise-cancelling headphones (+study), Air fryer (+health, cheaper meals), Smart lock (−theft). | M |
| FR-61 | Items can break or lose value. They can be sold at ResaleIt. | S |
| FR-62 | Players can decorate their home with cosmetic items, which give a small happiness boost (a collection hook). | C |

---

## 9. Life Stages & Relationships

Life doesn't stop for your career. Relationships, family and life stages add the drama, the trade-offs and the
"what happens next?" pull that keeps players going. They also make every run's story different.

### 9.1 Time & ageing

| ID | Requirement | Pri |
|---|---|---|
| FR-90 | The player character has an **age** (starting at 18–30, depending on background). | S |
| FR-91 | Game length setting: **Sprint** (1 turn = 1 week, ~1 year of life), **Standard** (1 turn = 1 week, with a "Skip a season" fast-forward between chapters), or **Long Life** (1 turn = 1 month, ages ~22 → 50+). Life stages matter most in the longer settings. In Long Life, one turn still plays as a single representative week of actions; recurring costs, income, interest and decay are multiplied by a turn-length factor (balance data), not by repeating the week four times. | S |
| FR-92 | **Life stages** unlock new options and pressures as age and milestones advance: | S |

| Stage | Typical age | Themes & mechanics |
|---|---|---|
| **Fresh Start** | 18–24 | Living with parents or roommates, student debt, first jobs, dating apps, a big social life |
| **Hustle Years** | 25–32 | Career climbing, moving in together, saving for a deposit, weddings (yours and friends'), "should we have kids?" |
| **Settling Down** | 33–42 | Mortgage, kids, childcare costs, juggling two careers, peak expenses, marriage strain |
| **Midlife Remix** | 43–55 | Career plateau or pivot, teenage kids, ageing parents, divorce risk, midlife-crisis purchases, retirement savings |

### 9.2 Relationships

| ID | Requirement | Pri |
|---|---|---|
| FR-93 | **Relationship status** goes through: Single → Dating → Exclusive (girlfriend/boyfriend/partner) → Living Together → Engaged → Married (and → Separated → Divorced, or → Widowed through rare events). | S |
| FR-94 | **Inclusive by default:** the player picks who their character is interested in (any gender). Partner terms follow automatically (girlfriend / boyfriend / partner / wife / husband / spouse). | S |
| FR-95 | **Meeting people:** dating apps (on your phone, from anywhere, costs time, has premium tiers), The Daily Grind café, the gym, work (risky), friends' parties (needs Social), and random "meet-cute" weekend events. | S |
| FR-96 | **Partners are NPCs** generated from data, each with a name, portrait, job/income, personality traits (e.g. ambitious, homebody, spender, saver, adventurous) and **wants** (time together, stability, travel, kids or no kids, a city move). | S |
| FR-97 | **Relationship meter (0–100):** goes up with date nights, gifts, quality time and supporting their goals. Goes down with neglect, working overtime, money stress, unmet wants and broken promises. Hidden **compatibility** changes how fast it moves. | S |
| FR-98 | **Relationship actions:** Text/call (cheap, small effect), Date night (time + money, choice of venue), Gift, Trip/holiday (big effect, big cost), Deep talk (fixes issues, costs energy), Couples therapy (Pulse Clinic). | S |
| FR-99 | **Partner requests and ultimatums:** "Move in with me?", "Where is this going?", "I got a job offer in another city." Each is a choice with long-term consequences. | S |
| FR-100 | **Breakups** can come from the player or the partner (if the meter stays low). Effects: a Happiness drop, possibly losing a shared home or a pet custody fight, and a short "rebound" period. | S |

### 9.3 Milestones & their economics

| Milestone | Costs / risks | Benefits | Pri |
|---|---|---|---|
| **Moving in together** | Moving costs, a lease in both names, roommate-style friction events | Split rent and bills, +Happiness, shared groceries | S |
| **Engagement** | Ring purchase (from a cheap ring up to "Jones-level" bling), pressure to set a date | +Relationship, +Happiness | S |
| **Wedding** | A budget choice: *Courthouse* ($) → *Backyard* ($$) → *Destination* ($$$$). Financing with BNPL/credit card is allowed (and dangerous) | Big Happiness/Social boost, gifts as cash, Jones comparison moment | S |
| **Marriage** | Shared finances (a choice of joint or separate accounts), the partner's debts affect yours | Dual income, tax benefit, shared health insurance, a burnout buffer | S |
| **Buying a home** | A deposit, a mortgage based on credit score, property tax, repairs | Equity counts toward Wealth, no landlord rent hikes | S |
| **Kids** | A choice (or an occasional surprise event). Big costs: childcare, food, time per week, sleep loss (−Energy) | Large Wellbeing boost, family events, legacy score; kids grow up in stages (baby → school → teen) | C |
| **Pets** | Vet bills, time | +Happiness, −stress, cheap and good for solo players | S |
| **Ageing parents** | Care costs, time, emotional events | Possible inheritance, family Social boost | C |

### 9.4 Divorce & separation

| ID | Requirement | Pri |
|---|---|---|
| FR-101 | If a marriage's relationship meter stays critical for N turns, the risk of separation goes up. Couples therapy, deep talks and cutting back on work can save it. | S |
| FR-102 | **Divorce settlement:** joint assets split (shared accounts, home equity, investments), legal fees (a choice of *Amicable mediation* $ or *Lawyered up* $$$, with an outcome roll), possible spousal or child support payments, moving out (a forced housing downgrade if needed). | S |
| FR-103 | A **prenup** option at engagement: costs money and a little relationship trust, but protects assets in a divorce. | C |
| FR-104 | Recovery arc after divorce: a temporary Happiness/Energy penalty, a "Fresh Start" boost to Social and Skills once you work through it, and dating unlocks again. | S |
| FR-105 | Custody (if there are kids): shared-week scheduling eats time, kids' happiness depends on how cooperative the split is. | C |

### 9.5 Integration with other systems

| ID | Requirement | Pri |
|---|---|---|
| FR-106 | **Wellbeing goal** now includes a **Relationships** part: partner, family, friends *or* pets. Players never have to marry or have kids to win. Strong friendships or a pet can fill this part. | S |
| FR-107 | Optional 5th goal **"Family & Love"** in custom game setup, for players who want relationships to be central. | C |
| FR-108 | Relationship-driven **event decks** filtered by stage and status (e.g. "Meet the parents", "Partner's surprise party", "In-laws visiting", "Wedding season: 4 invitations, $1,800 in gifts", "Kid needs braces", "Partner laid off by AI"). | S |
| FR-109 | Partner income and job are simulated too. The partner can be laid off, promoted or start a side hustle, which affects household finances. | S |
| FR-110 | **Jones has a love life too:** Jones's relationships, wedding and "perfect family" posts are a constant comparison point (satire of social media highlight reels). Jones's life can also fall apart. | S |
| FR-111 | The run summary includes a **life timeline**: relationships, weddings, kids, homes and divorces next to career and wealth milestones. | S |

### 9.6 Guardrails for relationship content

| ID | Requirement | Pri |
|---|---|---|
| FR-112 | No sexual content. Romance is shown with tasteful vignettes (fade-outs, short scenes). Target rating stays teen/PEGI 12–16. | M |
| FR-113 | Being single, child-free or divorced is a fully valid way to play and win. No path is framed as "correct." | M |
| FR-114 | Sensitive events (miscarriage, death of a partner, abuse) are **excluded**. Rare serious events (illness, a parent's death) can be turned off in settings. | M |
| FR-115 | Partners are characters with their own wants, not trophies. Satire targets wedding industry costs, dating-app economics and social media perfection, not people. | M |

---

## 10. Events & News

| ID | Requirement | Pri |
|---|---|---|
| FR-70 | **Weekend events:** after each week, draw from a weighted, condition-filtered deck (100+ events at launch). Many give the player a choice between 2–3 options. | M |
| FR-71 | Event categories: Work (layoffs, a bonus, a toxic boss), Money (market swings, a tax refund, scams), Life (a friend's wedding, a breakup, a new pet), Health (flu, burnout, a marathon), Housing (a rent hike, a mould problem, a roommate drama), Viral (a post blows up, getting cancelled), Climate (a heatwave raises the power bill, a flood). | M |
| FR-72 | **News ticker:** global events that change the whole economy for N weeks (e.g. "AI model release: copywriting exposure +20%", "Rate cut: loans cheaper", "Housing bubble"). | M |
| FR-73 | **Event chains:** multi-week storylines (e.g. a side hustle grows → hire help → get acquired). | S |
| FR-74 | Events are content-driven (data files with conditions, weights, effects, copy) and validated by a schema. | M |

---

## 11. AI Rival: Jones

| ID | Requirement | Pri |
|---|---|---|
| FR-80 | Jones plays under the same rules as human players (no cheating) using a utility-based AI. | M |
| FR-81 | Rival personalities with different strategies and difficulty: *Jones the Grinder* (career), *Crypto Jones* (high risk), *Wellness Jones* (balanced), *Influencer Jones* (clout). | S |
| FR-82 | Jones posts a "highlight reel" social feed of their week, smug and funny, and reacts to the player's milestones. | M |
| FR-83 | Rubber-banding is allowed **only** through strategy choice, never by bending the rules. Difficulty changes how often Jones picks the best move. | M |

---

## 12. Game Modes

| Mode | Description | Pri |
|---|---|---|
| **Classic** | Set goals, race Jones or friends, no week limit | M |
| **Daily Run** | One seeded scenario per day, the same for everyone, with a 26-week limit and a score. Shareable result card. Leaderboard | S |
| **Career Mode** | A meta-progression campaign: unlock backgrounds, perks and new districts across runs (roguelite) | S |
| **Seasonal Scenarios** | Monthly themed rules (e.g. "Recession 2026", "AI Gold Rush", "Housing Bubble") | C |
| **Online async multiplayer** | Play turns with friends at your own pace | C |

---

## 13. Engagement Design

Use proven, modern retention techniques **with ethical guardrails**.

### 13.1 Moment-to-moment ("juice")

| ID | Requirement | Pri |
|---|---|---|
| ENG-01 | Every action gives satisfying feedback: number pop-ups, coin bursts, stat bars that tick up, a satisfying sound and a light screen shake for big moments. | M |
| ENG-02 | Turn pacing: a week should take 60–120 s for an experienced player. Use one-tap actions and smart defaults ("Work full shift"). | M |
| ENG-03 | Anticipation: market changes, event card flips and promotion results are revealed with a short animation (≤1.5 s, skippable). | M |

### 13.2 Session & retention loops

| ID | Requirement | Pri |
|---|---|---|
| ENG-10 | **Next-week teaser:** each week ends with a preview hook ("Your landlord wants to talk…", "Your post is trending…"). This is the "one more turn" engine. | M |
| ENG-11 | **Micro-goals / quests:** 1–3 short-term objectives at any time (e.g. "Save $500 by week 6", "Get promoted"), each with a small reward. They bridge the long-term goals. | M |
| ENG-12 | **Variable rewards:** weekend events, viral rolls, market swings and thrift finds give unpredictable highs (within a run, never paid for). | M |
| ENG-13 | **Near-miss visibility:** clearly show "You were $120 away from your Wealth goal" and how close Jones is. | M |
| ENG-14 | **Rival tension:** Jones's progress is always visible. Overtake and fall-behind moments get special reactions. | M |
| ENG-15 | **Meta-progression:** finishing runs earns XP that unlocks backgrounds, starting perks, cosmetic outfits/apartments, rival personalities and new event packs. | S |
| ENG-16 | **Achievements:** 50+ at launch, including funny or secret ones ("Ate Burger Bot 10 weeks straight", "Paid off BNPL… with BNPL", "Married, divorced and remarried the same person", "Wedding cost more than the house"). | S |
| ENG-17 | **Daily Run + shareable result:** a spoiler-free emoji/graph result card in Wordle style, plus "beat my score" links. | S |
| ENG-18 | **Gentle streaks:** a daily play streak with streak freezes included. Losing a streak costs no gameplay progress. | S |
| ENG-19 | **Collection:** an apartment decoration and outfit collection (cosmetic only). | C |
| ENG-20 | **Fast first session:** an interactive tutorial woven into week 1. The player gets their first "win" (job + first paycheck) in under 3 minutes. | M |
| ENG-21 | **Run summary screen:** a life timeline, best and worst week, net worth chart, a "your 2026 in review" story, and unlocks earned. | M |

### 13.3 Ethical guardrails (non-negotiable)

| ID | Requirement | Pri |
|---|---|---|
| ENG-30 | No real-money loot boxes, gacha or paid randomness. | M |
| ENG-31 | No pay-to-win. Any future monetization is limited to cosmetics, expansion packs or a one-time premium unlock. | M |
| ENG-32 | No energy/wait timers that block play, and no FOMO countdowns that punish absence. | M |
| ENG-33 | No manipulative notifications. Push/email is opt-in and capped at one per day (e.g. "Daily Run is ready"). | M |
| ENG-34 | Optional session reminder ("You've played 60 min — Jones is also taking a break"). | S |
| ENG-35 | Sensitive themes (debt, mental health, layoffs) are handled with satire aimed at systems, not at players. The credits include an "about real financial help" link. | S |

---

## 14. UX, Presentation & Accessibility

| ID | Requirement | Pri |
|---|---|---|
| NFR-01 | Art direction: a bold, flat 2D or clean pixel-art city board. Expressive characters with emotion states. Consistent palette with light and dark themes. | M |
| NFR-02 | Responsive: portrait mobile (board on top, action sheet at the bottom) and landscape desktop (board in the middle, side panels). | M |
| NFR-03 | Fully playable by mouse, touch or keyboard. Every action has a keyboard shortcut. | M |
| NFR-04 | Accessibility: WCAG 2.2 AA contrast, colour-blind-safe stat colours with icons, a reduced-motion setting, scalable text, screen-reader labels for UI panels. | M |
| NFR-05 | Audio: a lo-fi adaptive soundtrack, SFX for every action, and separate volume sliders. | S |
| NFR-06 | Localisation-ready: all strings in resource files, currency and number formatting by locale. English at launch. | S |
| NFR-07 | Satirical tone guide for all copy: punch up, not down. Short and witty. | M |

---

## 15. Non-Functional

| ID | Requirement | Pri |
|---|---|---|
| NFR-10 | Performance: 60 fps on mid-range 2022 phones. First load ≤ 3 s on 4G. Initial JS bundle ≤ 300 KB gzipped (assets lazy-loaded). | M |
| NFR-11 | Works offline after the first load (PWA). Saves persist locally. | M |
| NFR-12 | Deterministic simulation: the same seed + same actions = the same outcome. Required for Daily Runs, replays, bug reports and tests. World randomness (market, news, inflation) uses its **own RNG stream**, separate from player-driven randomness (events, gigs, AI rival), so in a Daily Run everyone sees the same economy whatever they do. | M |
| NFR-13 | Autosave at the end of every week and after every action. Multiple save slots. | M |
| NFR-14 | Privacy: no account needed to play. Analytics are anonymous and opt-in where required (GDPR/CCPA). | M |
| NFR-15 | All balance values are in data files so they can be tuned without code changes. | M |
| NFR-16 | Telemetry for balancing: week reached, goal completion, quit points, strategy usage (anonymous, aggregated). | S |

---

## 16. Scope by Release

**MVP (vertical slice)**
- Classic mode, 1 human vs Jones (one personality), hotseat for up to 4 humans (FR-06)
- 10 locations: Your Place, LeaseLord, JobLink, UpSkill U Online, Fulfillment Center, Burger Bot, FreshMart, ThriftUp, Circuit Planet, NeoBank, plus GigHub as an action
- ~20 jobs, ~15 items, ~40 weekend events, ~10 news events
- AI disruption, inflation, rent, subscriptions, savings + index fund + crypto, credit card + student loan
- Social sources for the Wellbeing goal without the S-priority locations: *Hang out* at Burger Bot, *Host friends* at Your Place, and Social-boosting weekend events
- Juice, next-week teasers, micro-goals, run summary, tutorial
- Local saves, PWA, desktop + mobile layouts

**v1.0**
- All "S" items: Daily Run + leaderboard + share card, meta-progression, achievements, more rivals, CreatorLab, Gym, Café, ResaleIt, side hustles, event chains, character backgrounds, audio
- Life stages & relationships: ageing, dating, partners, moving in, engagement, weddings, marriage, home buying, pets, breakups and divorce (§9)

**Post-launch**
- StartupGarage, Civic Center/taxes, seasonal scenarios, async online multiplayer, home decoration, localisation
- Kids and parenting stages, daycare, custody, ageing parents, prenups, the optional "Family & Love" goal

---

## 17. Open Questions

1. Monetization model: free, premium one-time purchase, or free with cosmetic DLC?
2. Art style: flat vector vs. pixel art? (This affects the asset pipeline. See tech-stack.)
3. Setting: a fictional generic city, or selectable real-world-inspired cost-of-living profiles (US/UK/AU)?
4. Should Jones's dialogue be pre-written only, or also LLM-generated at build time to add variety?
5. Should Long Life mode (1 turn = 1 month) be the default for Career Mode, so life stages get full screen time?
6. Do partners and spouses ever become playable co-op characters in hotseat multiplayer (e.g. two players as a couple)?
