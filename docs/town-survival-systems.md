# Town Survival — Simulation Systems Design

Status: **implemented**. The code lives in `src/lib/town/sim/`, and the golden scenarios in §10 run as `npx tsx scripts/town-survival-check.ts`. Where the build departs from a number below, §11 records what changed and why.

Scope is mechanics only: equations, constants, state machines, tick order. Rendering and art are out of scope. The game has plain readout panels (`src/components/town/SurvivalPanels.tsx`) so the systems can be seen and used.

| Section | Module |
|---|---|
| §1.1 weather | `weather.ts` |
| §1.2–1.7, §3.4, §7 body, eating, illness | `body.ts` |
| §1.8–1.9 zones, hearths, fuels, CO | `zones.ts` |
| §2 stimuli, aggro, director | `aggro.ts` |
| §3.1–3.3 spoilage, seasoning, compost | `stores.ts` |
| §3.5 soil | `soil.ts` |
| §3.6 tools | `tools.ts` |
| §4 expeditions, extraction nodes | `wilds.ts` |
| §5.1–5.5 frames and collapse | `frame.ts` |
| §5.6 breach pathfinding | `breach.ts` |
| §6 minds, society, decrees, corpses | `psyche.ts` |
| migration, initialisation | `survival.ts` |

Mandate: the town is a parasite and the land is the immune response. Every productive act emits a stimulus that feeds a hostile reaction. No steady state is stable, because the permanent parts of the hostility integral (§2.2) only grow. The best a player can do is manage the rate of decline and cash out survival days.

---

## 0. Conventions

### 0.1 Clocks

The current engine (`src/lib/town/sim/tick.ts`) runs `advance(s, minutes)` with a 1-minute inner step and an hourly block. At 1× speed, 1 game minute is 0.5 real seconds. A year is 28 game days (spring 6, summer 6, autumn 6, winter 10).

The design uses two clocks:

| Clock | Governs | Constant convention |
|---|---|---|
| **Physiological**: 1 game minute = 60 physical seconds | heat transfer, calories, CO, bleeding, combat, movement | SI, real physics |
| **Calendar**: 1 game day stands for κ_cal = 365/28 ≈ **13.0** physical days | spoilage, wood curing, soil, frost depth, rot, wound healing, vitamin pools | every rate is quoted **per game day**, with κ_cal already folded in |

A person eats three meals per game day and burns one physical day of calories per game day. Slow processes (food rotting, wood seasoning, scurvy onset) move about 13× faster than they would in reality, so they matter within one winter.

### 0.2 Space

- 1 tile = **2 m × 2 m**. The 360×240 map is 720 m × 480 m.
- A house of 5×3 tiles has a 10 m × 6 m footprint (60 m²).
- Default storey height is 2.7 m.

### 0.3 Numerics

- **Stiff linear pieces** use the exact exponential update. This covers room temperature, CO, stove mass and first-order decay:
  `x(t+Δt) = x_eq + (x(t) − x_eq)·exp(−Δt/τ)`
  It is unconditionally stable, so hourly ticks cannot blow up.
- **Nonlinear pieces** use explicit Euler at the physiological tick (Δt = 60 s). This covers core temperature with shivering and vasoconstriction. The body's time constant is τ_b = C_b·R/A ≈ 8 h, so it is far from the stability limit.
- **Randomness** is deterministic. Each subsystem draws from its own stream:
  `rng(hash(seed, SUBSYSTEM_ID, tick, entityId))`
  This extends the existing `rng()` in `world.ts`. `Math.random` is banned in `sim/`.
- **Hazards** are rolled as probabilities: `P(event in Δt) = 1 − exp(−λ·Δt)`, with λ given per stated unit.

### 0.4 Notation

| Symbol | Meaning | Unit | Bounds |
|---|---|---|---|
| T_amb | dry-bulb air temperature | °C | −45 … 35 |
| v | wind speed at 2 m | m/s | 0 … 30 |
| P | precipitation, water-equivalent | mm/h | 0 … 8 |
| RH | relative humidity | – | 0.2 … 1 |
| vis | horizontal visibility | m | 10 … 5000 |
| clo | clothing insulation (1 clo = 0.155 m²K/W) | clo | 0 … 4 |
| W | clothing wetness saturation | – | 0 … 1 |
| T_c | core temperature | °C | 20 … 42 |
| M | metabolic rate | W | 60 … 900 |
| E_g | glycogen / ready energy | kcal | 0 … 2000 |
| F | body fat | kg | 0 … 20 |

---

## 1. Thermodynamic & Metabolic Attrition

### 1.1 Weather generator (hourly)

**Temperature**

```
T_amb(h) = T_season(d) + A_diurnal(season)·cos(2π(h − 15)/24) + θ(h) + ΔT_regime
```

- T_season(d) is linearly interpolated between season midpoints: spring 4, summer 16, autumn 3, winter −14 °C.
- A_diurnal: spring 5, summer 6, autumn 4, winter 3 °C.
- θ is an AR(1) anomaly:
  `θ(h+1) = 0.94·θ(h) + 1.1·ε`, with ε ~ N(0, 1).
  Its stationary standard deviation is 1.1/√(1 − 0.94²) = 3.2 °C.

**Winter regimes.** An hourly Markov chain over the states {Calm, Snow, Blizzard, Thaw}. Each row gives the next-hour probabilities:

| from \ to | Calm | Snow | Blizzard | Thaw |
|---|---|---|---|---|
| Calm | 0.950 | 0.040 | 0.005 | 0.005 |
| Snow | 0.050 | 0.900 | 0.045 | 0.005 |
| Blizzard | 0.020 | 0.100 | 0.880 | 0.000 |
| Thaw | 0.060 | 0.020 | 0.000 | 0.920 |

Mean blizzard length is 1/0.12 ≈ 8.3 h.

**Regime effects**

| Regime | ΔT_regime (°C) | v̄ (m/s) | P (mm/h w.e.) | vis (m) | RH | Precipitation form |
|---|---|---|---|---|---|---|
| Calm | −3 (radiative) | 2 | 0 | 3000 | 0.70 | – |
| Snow | +2 | 5 | 0.8 | 400 | 0.95 | snow |
| Blizzard | −8 | 16 | 2.0 | 25 | 0.95 | snow |
| Thaw | +10 | 4 | 1.5 | 800 | 1.00 | rain on snow |

- Hourly wind: v = v̄·LogNormal(0, 0.35).
- Other seasons use a two-state chain {Fair, Rain}. Autumn adds sleet whenever T < 2 °C.
- Fresh snow density is ρ_s = 100 kg/m³, so snow depth grows at `dd/dt = P·(1000/ρ_s)` mm/h.
- Settling: `ρ_s(t) = 350 − 250·exp(−t/2 d)`. On thaw, ρ_s = 450.

### 1.2 Local microclimate (per agent, per minute)

**Indoors**: T_env = T_zone (§1.8), v_local = 0.2 m/s, and no precipitation.

**Outdoors**: T_env = T_amb. Two corrections apply.

1. **Wind shelter.** Obstacles (walls, buildings) upwind of the agent reduce wind:
   ```
   v_local = v · Π_obstacles [1 − 0.8·exp(−x/(5·h_obs))]
   ```
   - x is the downwind distance.
   - An obstacle counts only if x ≤ 15·h_obs.
   - Walls are 3 m, so they shelter out to 45 m.

   This gives walls a thermal role as well as a military one.
2. **Radiant gain from fires.** Radiation is blocked by walls, using the existing ray cast in `warmAt`.
   ```
   q_rad   = χ·P_fire / (4π·max(r, 1 m)²)      W/m²
   Q_rad,in = α·A_p·q_rad = 0.378·q_rad         W
   ```
   - Radiant fraction χ = 0.30.
   - Absorptivity α = 0.7.
   - Projected area A_p = 0.54 m².

   Worked example: a pit fire burning 10 kg/h of oak has P = 40 kW. At 2 m it gives 129 W; at 4 m, 32 W.

   Outdoor fires are warm-up stations, not blankets. The existing "warm radius" becomes the **ground-thaw radius**:
   ```
   r_thaw = √(χ_g·P_fire / (π·q_thaw))
   ```
   with χ_g = 0.5 and q_thaw = 150 W/m². At 40 kW this is r ≈ 6.5 m (3.3 tiles).

### 1.3 Clothing, wetness and sweat

```
R_cl,eff = 0.155·clo·(1 − 0.75·W)·max(0.55, 1 − 0.035·v_eff)     m²K/W
v_eff    = v_local + v_walk                                       (v_walk = 1.3 walking, 3.0 running, 0 standing)
```

**Wetness**, per minute:

```
dW/dt = a_p·P_eff·(1 − WP)                    (a_p = 0.004 per mm, WP = garment waterproofing 0…0.9)
      + (1 − e)·ṁ_sw / m_cap                  (condensed sweat)
      − δ_dry                                  (drying)
```

- Snow counts only at 30% while T_amb < −2, because dry snow brushes off: P_eff = P·(T_amb < −2 ? 0.3 : 1).
- Sweat rate: `ṁ_sw = Q_sw/λ`, with λ = 2.43 MJ/kg.
- Fraction of sweat that evaporates: `e = 0.9/(1 + 0.8·clo)`.
- Clothing water capacity: `m_cap = 0.6·clo` kg.
- δ_dry per minute: 0 outdoors in precipitation; 0.0015 outdoors and dry; 0.004 in a zone with T_zone > 10; 0.02 within 2 m of a hearth.
- Entering a heated zone with snow on the clothes adds ΔW = +0.08 once.
- Falling into water, or fording above the knee, sets W = 1 (feet only for a ford).

**Sweating** starts above a core temperature of 37.1:

```
Q_sw = min(500·(1 − 0.6·W), 180·(T_c − 37.1))    for T_c > 37.1, else 0     (W)
```

Consequence: heavy work in heavy clothing sweats the clothes wet, and the worker freezes on the walk home. The counterplay is "strip a layer for labour" as an AI work rule, which costs time and exposes the hands.

### 1.4 Core temperature differential equation

```
C_b · dT_c/dt = H_met − Q_dry − Q_resp − e·Q_sw + Q_rad,in

C_b     = 3490 J/kgK × m_body (70 kg)                        = 244 300 J/K
H_met   = M_basal + (1 − η_mech)·M_labor + M_shiv            (η_mech = 0.20)
Q_dry   = A_s·(T_c − T_env) / R_tot                           (A_s = 1.8 m²)
R_tot   = R_t(T_c) + R_cl,eff + R_a
R_t     = 0.03 + 0.09·clamp((37.0 − T_c)/1.0, 0, 1)           (tissue; vasoconstriction)
R_a     = 1/(h_c + h_r)
h_c     = max(3.0, 8.3·√v_eff)                                W/m²K
h_r     = 4.7                                                  W/m²K
Q_resp  = M_tot·[0.0014·(34 − T_amb) + 0.0173·(5.87 − p_a)]
p_a     = RH·0.611·exp(17.27·T_amb/(T_amb + 237.3))           kPa
M_tot   = M_basal + M_labor + M_shiv
```

**Shivering thermogenesis**

```
M_shiv = S_max · clamp((36.8 − T_c)/1.8, 0, 1) · g(E_g) · clamp((T_c − 31.0)/2.0, 0, 1)
S_max  = 350 W
g(E_g) = 0.3 + 0.7·clamp(E_g/(0.25·E_g,max), 0, 1)
```

- Shivering needs glycogen. Once it runs out, only the fat-fuelled 30% remains.
- Shivering fails below 31 °C.

**Worked checks** (these become regression tests in §10):

- **Light clothing (0.5 clo), dry, standing, −20 °C, 8 m/s, at T_c = 36.0.**
  - R_cl,eff = 0.078·0.72 = 0.056, so R_tot = 0.12 + 0.056 + 0.035 = 0.211 and Q_dry = 1.8·56/0.211 = 478 W.
  - M_shiv = 350·0.44 = 156 W, so H_met = 236 W.
  - Q_resp ≈ 45 W.
  - Net ≈ −287 W, so dT/dt = −4.2 K/h.
  - Integrated from 37 °C, starting with E_g = 1500: 35 °C at 29 min, 32 °C at 133 min, 24 °C (death) at about 3.9 h. That is before the cardiac hazard, which usually kills sooner.
- **Wet (W = 1), same conditions**: 35 °C at 18 min, 32 °C at 70 min, death at about 2.4 h.
- **Labourer, 2.5 clo, moderate work (250 W), −10 °C, 3 m/s, walking.**
  - Q_dry ≈ 209 W; retained heat is 280 W; Q_resp ≈ 51 W.
  - Net ≈ +20 W. The worker drifts warm, crosses 37.1 °C and sweats, and W creeps up by about 2–4% per hour.

### 1.5 Extremities (hands, feet)

Hands and feet are algebraic nodes, assumed to be in quasi-steady state:

```
T_x = T_env + (T_c − T_env)·(R_cl,x + R_a)/(R_t,x + R_cl,x + R_a)
R_t,x = 0.05 + 0.25·clamp((37 − T_c)/1.5, 0, 1)
R_cl,x = 0.155·clo_x·(1 − 0.75·W_x)
```

- clo_x values: bare 0; wool gloves 0.8; fur mittens 1.5; turnshoes 0.6; lined boots 1.2.
- Feet use W_feet. It rises 0.02 per minute walking in snow deeper than 10 cm without boots, and is set to 1 when fording.
- Check: at −10 °C and 3 m/s, once the core has cooled to 35.5 °C (full constriction), a bare hand sits at T_x ≈ −3 °C and freezes. In mittens it sits at ≈ 13 °C: numb but safe. A warm core (37 °C) keeps even a bare hand at about +14 °C. Hypothermia is what lets frostbite in.

**Dexterity**

```
manip = clamp((T_hand − 8)/12, 0.2, 1)
```

**Injury dose integrators**

- **Frostbite** (freezing, T_x < −0.5), per minute: `F_x += max(0, −0.5 − T_x)·(1 + W_x)`.
- **Chilblains** (non-freezing, 0 < T_x < 10), per hour: `D_cb += (10 − T_x)/10·(0.5 + W_x)`. It recovers at −0.3 per hour while T_x > 20.
- **Trench foot** (W_feet > 0.5 and 0 < T_feet < 15), per hour: `D_tf += W_feet·(15 − T_feet)/15`. It recovers at −0.4 per hour, but only while W_feet < 0.2 and T_feet > 20, and only for stage I.

| Injury | Threshold | Effect |
|---|---|---|
| Frostnip (F ≥ 60) | K·min | manip −0.1, pain; heals in 1 day |
| Frostbite II (≥ 180) | | manip −0.3, blisters; infection hazard ×1.5 |
| Frostbite III (≥ 480) | | tissue loss; permanent −1 digit (manip cap 0.8 per hand); gangrene hazard 0.25/day unless amputated |
| Frostbite IV (≥ 900) | | limb necrosis; amputation or death (gas gangrene 0.35/day) |
| Chilblains (D_cb ≥ 8) | K·h | manip −0.15; sanity −0.2/h (itch, pain) |
| Trench foot I (D_tf ≥ 10) | h | move ×0.85 |
| Trench foot II (≥ 30) | | move ×0.6; ulceration; infection hazard 0.08/day |
| Trench foot III (≥ 72) | | move ×0.3; gangrene hazard 0.15/day |

### 1.6 Metabolism and caloric drain

**Work tiers.** Each job in the current role table maps to one tier:

| Tier | M_tier (W) | Jobs |
|---|---|---|
| Rest | 0 | sleeping, idle indoors |
| Light | 100 | cooking, teaching, tending fire, trading |
| Moderate | 250 | farming, hauling, fishing, construction finishing |
| Heavy | 400 | logging, quarrying, digging channels, smithing |
| Extreme | 550 | combat, sprinting, dragging a sledge uphill |

**Effective labour cost** (non-linear):

```
M_labor = M_tier · (1 + 0.06·max(0, clo − 1.5))       clothing hobble
                 · (1 + 0.008·d_snow,cm)                outdoor, walking in snow
                 · (1 + 0.5·Φ²)                          fatigue
M_basal = 80 W

dΦ/dt = M_labor/(400 W · 8 h)   while working
      − 1/(8 h)                  while sleeping in a bed with T_zone ≥ 5 (half rate below 5)
Φ ∈ [0, 1]
```

**Productivity**

```
P_work = P_0 · s_tool^0.5 · (1 − 0.6·Φ²) · (1 − 0.35·M_shiv/S_max) · manip · Π affliction multipliers
```

**Energy stores** (per minute):

```
dE_g/dt = −M_tot·60/4184  kcal/min                       (1 W sustained over a game day = 20.6 kcal)
```

- Meals credit E_g first. Any excess above E_g,max = 2000 kcal goes to fat at 0.8 efficiency (1 kg fat = 7700 kcal).
- When E_g < 0, fat is mobilised up to 69 kcal per kg of fat per day (the Alpert limit). Any remaining deficit is taken from lean tissue, and lost muscle is gone.
  - Muscle loss is tracked as B_loss (kg). Strength and carry capacity scale as ×(1 − B_loss/12). B_loss ≥ 8 is fatal.
- Starvation states by body fat F (start at 12 kg):

  | F (kg) | State | Effect |
  |---|---|---|
  | ≥ 8 | Fed | – |
  | 5–8 | Lean | cold tolerance: S_max ×0.9 |
  | 3–5 | Emaciated | S_max ×0.7; R_t max −0.03; sanity −0.5/h |
  | < 3 | Starving | the lean-tissue path is forced; death hazard 0.05/day × (3 − F) |

**Reference daily burn** (calibration):

| Scenario | kcal / game day |
|---|---|
| Basal only | 1650 |
| 8 h moderate work | 3370 |
| 8 h heavy work in −10 °C with 4 h of shivering | ≈ 4800 |
| Expedition day: 8 h march with 25 kg, snow | ≈ 4200 (see §4.1) |

**Food energy (kcal/kg)**: potato 770, turnip 280, cabbage 250, onion 400, bean (dry) 3400, wheat/barley flour 3400, bread 2500, fish 1000, fresh meat 2000, smoked meat 2500, salt pork 3000, cheese 3500, hardtack 3500, pemmican 5000.

The game's resource unit becomes **1 kg**, and a "meal" becomes 800 kcal. This replaces the global `s.hunger` meter with per-villager E_g and F. Rationing becomes a decree (§6.5), not an average.

### 1.7 Cold affliction state machine

Core-temperature track, evaluated per minute with hysteresis:

```
            T_c<36.0                T_c<35.0                  T_c<32.0
NORMAL ─────────────▶ SHIVERING ─────────────▶ HYPO_MILD ─────────────▶ HYPO_MODERATE
   ▲  T_c>36.4            │ ▲  T_c>35.4              ▲ T_c>32.5              │ T_c<28.0
   └──────────────────────┘ └────────────────────────┘                        ▼
                                                                     HYPO_SEVERE
                                λ_PU hazard (28 ≤ T_c ≤ 31)                    │
   HYPO_MODERATE / HYPO_SEVERE ─────────────────▶ PARADOXICAL_UNDRESSING       │ λ_VF hazard, or T_c ≤ 24
                                                         │                     ▼
                                                         └──────────────▶ TERMINAL_CARDIAC ─▶ DEAD
```

Rules, top to bottom:

1. **λ_PU** = 0.015·(31 − T_c)/3 per minute.
   - On entry: the agent drops its torso clothing (clo_torso → 0.2) and stops accepting orders.
   - AI moves the agent into "terminal burrowing": it seeks the smallest enclosed tile within 10 tiles.
2. **λ_VF** = 0.0005·exp(0.55·(30 − T_c)) per minute, for T_c < 30.
   - Moving a HYPO_SEVERE casualty adds an instant +0.05 chance. This is the rescue-collapse event.
   - Active rewarming faster than 2 K/h while HYPO_SEVERE adds afterdrop: λ_VF ×3 for 30 minutes.
3. TERMINAL_CARDIAC resolves in 5 minutes. If someone with the Physician trait is adjacent: survive with p = 0.15, and the agent drops back to HYPO_SEVERE at 29 °C. Otherwise DEAD.
4. Death is deterministic at T_c ≤ 24.

**Effects per state**

| State | Work | Move | Manip cap | Combat acc. | Sanity/h | AI override |
|---|---|---|---|---|---|---|
| SHIVERING | ×0.9 | ×1.0 | 0.9 | ×0.9 | −0.3 | seek warmth when idle |
| HYPO_MILD | ×0.6 | ×0.8 | 0.6 | ×0.6 | −1.0 | abandons outdoor jobs |
| HYPO_MODERATE | ×0 | ×0.4 | 0.3 | ×0.2 | −2.0 | stumbles; 10% per minute chance of wrong-direction move |
| HYPO_SEVERE | – | 0 | 0 | – | – | unconscious; needs carrying |
| PARADOXICAL_UNDRESSING | – | ×0.5 | – | – | – | burrows; resists rescue (2 bearers) |

**Rewarming** (active, per minute): hearth-side +Q_rad,in; a shared bed adds +60 W per partner; warm drinks give +30 W for 30 minutes and cost 0.1 kg of fuel per litre.

### 1.8 Shelter zone heat model

Each dwelling or storehouse is one thermal zone. Apartments are two zones joined by an internal conductance of 150 W/K.

```
C_z · dT_z/dt = Q_gain − Σ(U_i·A_i)·(T_z − T_amb) − U_f·A_f·(T_z − T_g) − H_v·(T_z − T_amb)

H_v    = 0.333·V·ACH_eff                               W/K     (ρc_p air = 1200 J/m³K)
ACH_eff = ACH_0·(1 + 0.12·v)·(1 + 0.6·(1 − cond)) + ΔACH_hearth + 0.4·doorOpenings/h
Q_gain = η_h·P_comb + Σ occupants (100 W asleep, 150 W awake) + Q_stove(t)
C_z    = 1200·V + c_m·A_f          (c_m: timber 25, stone 90, earth-bermed 150 kJ/m²K)
T_g    = T_year + 0.35·(T_season − T_year)                     ground under the floor
```

- The update is exact exponential with τ = C_z/H, where H = ΣUA + U_f·A_f + H_v.
- Zones update every 10 game minutes. Villagers read T_z every minute.
- **Masonry stove.** A second node carries thermal mass:
  - `C_s·dT_s/dt = η_s·P_comb − h_s·(T_s − T_z)`
  - C_s = 600 kJ/K, h_s = 250 W/K, and Q_stove = h_s·(T_s − T_z).
  - The stove keeps releasing heat for hours after the fire dies.

**Envelope materials.** These map onto the existing grade re-materialling in `art/grades.ts`: DAUB → STONEWM → MARBLE.

| Wall | U (W/m²K) | ACH_0 | Build mass (kg/m²) | Ignition | Rot class |
|---|---|---|---|---|---|
| Wattle & daub | 2.2 | 3.0 | 120 | medium | 1.0 |
| Hewn log, chinked | 0.9 | 1.0 | 110 | medium | 1.0 (pine 1.5, oak 0.4) |
| Log + turf berm | 0.6 | 0.8 | 400 | low | 0.8 |
| Rubble stone (0.5 m, dry-laid) | 2.0 | 1.8 | 1000 | none | 0 |
| Rubble stone + lime plaster | 1.6 | 0.9 | 1030 | none | 0 |
| Brick, double wythe | 1.8 | 0.8 | 440 | none | 0 |
| Dressed stone + timber lining ("Grand") | 0.8 | 0.6 | 1100 | low | 0.2 |

| Roof | U | Dead load (kPa) | Default pitch | Snow shed μ_s | Ignition |
|---|---|---|---|---|---|
| Thatch (0.3 m) | 0.35 | 0.35 | 50° | 0.27 | **high** (0.002/h per open hearth) |
| Turf | 0.8 | 1.5 dry / 2.5 wet | 25° | 0.80 | none |
| Wooden shingle | 2.0 | 0.20 | 40° | 0.53 | medium |
| Slate | 4.5 | 0.60 | 40° | 0.53 | none |
| Copper (grade 2+) | 5.5 | 0.30 | 35° | 0.67 | none |

Openings: door U 3.0 over 2 m²; shuttered window U 5.0 over 1 m² each. Earthen floor U_f 0.9; plank floor over a void 1.4.

**Worked zone**: a 60 m² log house, thatch roof, 4 occupants, T_amb −10, v 3 m/s, T_g = 5.

- Wall and opening losses: UA = 77 + 24 + 6 + 10 = 117 W/K; floor adds 54 W/K (against the ground at 5 °C).
- **Chimney fireplace**: ACH_eff = 1.0·1.36 + 0.5 = 1.86, so H_v = 100 W/K.
  - Losses at T_z = 10 are 4.61 kW; occupants give 0.4 kW, leaving 4.2 kW for the hearth.
  - At η 0.22 that is 19 kW of combustion: **4.8 kg/h of oak, about 115 kg per game day**.
- **Masonry stove**: ACH_eff = 1.46, H_v = 79 W/K, net need 3.8 kW.
  - At η 0.70 that is 5.4 kW: **1.4 kg/h, about 33 kg per game day**.
- The same house in wattle and daub with an open hearth cannot reach 10 °C on any affordable fuel. Its occupants sleep at about 2 °C, so shared beds and fur bedding matter.

### 1.9 Fuels and combustion

```
LHV(MC) = LHV_dry·(1 − MC) − 2.44·MC        MJ/kg (wet basis)
P_comb  = ṁ·LHV                              ṁ is capped by grate size and fuel
```

| Fuel | MC | LHV_dry | LHV | ṁ_max hearth (kg/h) | PM (g/kg) | CO (g/kg) | Creosote c (kg/kg) | Notes |
|---|---|---|---|---|---|---|---|---|
| Green wood | 0.50 | 18.5 | **8.0** | 6 | 20 | 120 | 0.0040 | hisses; half the heat |
| Seasoned softwood | 0.20 | 19.5 | **15.1** | 8 | 8 | 70 | 0.0015 | fast, resinous |
| Seasoned split oak | 0.20 | 18.5 | **14.3** | 6 | 6 | 60 | 0.0006 | reference fuel |
| Black peat | 0.35 | 21.0 | **12.8** | 5 | 15 | 80 | 0.0020 | smoulders; ash 5% |
| Surface coal (existing `coal`) | 0.08 | 27.0 | **24.6** | 4 | 12 | 50 | 0.0010 | needs a grate (forge / stove) |
| Hardwood charcoal | 0.05 | 30.0 | **28.4** | 3 | 0.5 | **200** | 0 | smokeless, **carbon monoxide** |

**Hearth appliances**

| Appliance | η_h (to room) | Flue capture f | ΔACH | Ignition hazard (/h, thatch) | Cost |
|---|---|---|---|---|---|
| Open hearth + smoke hole | 0.15 | 0.60 | +1.0 | 0.0020 | free |
| Chimney fireplace | 0.22 | 0.95 | +0.5 | 0.0005 | 40 stone, 10 bricks |
| Masonry stove | 0.70 (via stove node) | 0.99 | +0.1 | 0.0001 | 80 stone, 30 bricks, 2 ingots |
| Charcoal brazier | 0.95 | 0.00 | 0 | 0.0005 | 3 iron |

**Carbon monoxide** (zone state c, in mg/m³):

```
dc/dt = ṁ·e_CO·(1 − f)·1000/V − ACH_eff·c        per hour; ṁ in kg/h, e_CO in g/kg   (1 ppm = 1.145 mg/m³)

COHb (per agent):
dCOHb/dt = (COHb_eq − COHb)/τ_CO
COHb_eq = min(80, 0.15·ppm)                                  %
τ_CO    = 2.5 h × 100/max(100, M_tot)                        faster when active
```

| COHb % | Effect |
|---|---|
| 10 | headache: work ×0.9 |
| 25 | confusion: work ×0.5; mistakes |
| 40 | collapse: unconscious |
| ≥ 55 | death hazard 0.05 per minute × (COHb − 55)/10 |

Check: a 1 kg/h brazier in a sealed 162 m³ room at ACH 1 approaches 1235 mg/m³ (≈ 1080 ppm) with a 1 h time constant. The sleepers' COHb heads for 80% with τ_CO = 2.5 h, crosses 55% after about 3.5 h, and they die before dawn.

This produces the core trade-off: sealing a house for warmth (low ACH) raises CO, and venting it raises heat loss.

**Creosote and chimney fires**

```
dK_c/dt = ṁ·c
λ_cf    = 2e-5·exp(K_c/1.0) per hour
```

- A chimney fire burns the building at 3× the normal fire-spread rate.
- Sweeping takes 1 labour-hour and sets K_c = 0.
- Burning green wood through a 10-day winter at about 4.8 kg/h builds 4–5 kg of creosote. By late winter that is a 3–5% chance of a chimney fire per day.

**Seasoning (calendar clock)**

```
MC(t) = MC_eq + (MC_0 − MC_eq)·exp(−t/τ_c)
```

| Storage | τ_c (game days) | MC_eq |
|---|---|---|
| Split, covered woodshed | 6 | 0.18 |
| Split, open pile | 10 | 0.25 (rises to 0.35 in rain) |
| Round logs, uncovered | 25 | 0.30 |
| Peat, dried on racks | 5 | 0.30 |

The resource ledger splits `wood` into `wood_green` and `wood_seasoned`, each held in lots with an MC value.

**Charcoal kiln.** 5 kg of wood becomes 1 kg of charcoal over 2 game days. While burning, the kiln emits 40 g/kg of PM, a large smoke stimulus (§2.1).

---

## 2. Ecological Vengeance & Threat Director

### 2.1 Stimulus ledger

Every action appends to an hourly ledger S_k. Once per hour the ledger is folded into channel aggro and cleared.

| k | Stimulus | Unit (per hour) | Source hooks |
|---|---|---|---|
| can | canopy disruption | m² of canopy felled | tree felled: sprout 0, seedling 0.5, young 8, mature 30, snag 4; forest wood pool: 4 m² per unit of `TILE_WOOD/10` removed |
| smk | smoke plume | kg of particulate | Σ ṁ·PM·(1 − scavenging) for every hearth, kiln, smelter and forge; scavenging is 0.6 in snow and 0.9 in a blizzard |
| ac | acoustic resonance | MJ of strike energy | pick 60 J/strike × 900 strikes per labour-hour; digging 20 J × 600; blasting 50 kJ/charge; forge hammer 80 J × 400 |
| bio | biological waste | L-equivalent | blood spilled and not collected (pig 4 L, cow 30 L, wounded villager 0.5–2 L, dead monster 2–40 L); unburied corpses 0.02 L-eq per kg per hour × Q10^((T−10)/10) with Q10 = 2 |
| heat | heat signature | MWh leaked | Σ over zones of H·(T_z − T_amb) plus open fires' P_comb |
| food | stored food mass | tonnes held | Σ lots, weighted by q |
| pop | population | persons | N |

**Channel weights.** Four channels, one per assault archetype. A_j accumulates Σ_k w_jk·S_k.

| k \ j | Kinetic (K) | Burrower (B) | Weather-rider (Wr) | Infiltrator (I) |
|---|---|---|---|---|
| can (per m²) | 0.020 | 0 | 0.005 | 0.002 |
| smk (per kg) | 0.30 | 0 | 0.15 | 0.40 |
| ac (per MJ) | 0.50 | 6.0 | 0 | 0 |
| bio (per L) | 0.03 | 0.01 | 0.05 | 0.10 |
| heat (per MWh) | 0.5 | 0 | 4.0 | 0.2 |
| food (per t held) | 0 | 0.02 | 0 | 0.05 |
| pop (per person, per hour) | 0.004 | 0.002 | 0.004 | 0.003 |

**Spatial weighting.** A stimulus at location x is multiplied by `1 + 2·exp(−d_lair(x)/60 m)`, where d_lair is the distance to the nearest lair. Chopping next to a tomb costs three times as much. The existing `Lair` placements become the spatial sinks.

**Calibration.** A 12-person town has 5 log houses on chimneys (4.6 kW each), fells one mature tree per day, runs 2 miners and 1 forge for 8 h, and holds 1 t of food:

| Channel | Daily input |
|---|---|
| K | ≈ 3.6 |
| B | ≈ 7.8 (mining dominates) |
| Wr | ≈ 4.0 (heat leak dominates) |
| I | ≈ 3.6 |

B_day (§2.3) is a **cap**. The spend actually committed is set by the Lanchester target in §2.3, so a large purse means large waves later, not unwinnable waves now.

### 2.2 Aggro integrator

Each channel j has two reservoirs:

```
dA_j^hot/dt  = (1 − φ)·I_j(t) − (ln 2/τ_½)·A_j^hot          τ_½ = 3 game days
dA_j^scar/dt = φ·I_j(t)                                      φ = 0.15, never decays
A_j = A_j^hot + A_j^scar + A_floor(t)
A_floor(t) = 2·(1 + t_days/7)^1.2                            baseline hostility of the land
```

- The update is an exact exponential, applied hourly.
- The scar reservoir is what guarantees "no safe equilibrium": total aggro is monotone non-decreasing in cumulative activity.
- A_floor makes a town that does nothing die slowly too.

### 2.3 Director budget and purse

**Daily budget** (points):

```
B_day = β_0 · (1 + A_Σ/A_ref)^γ · N^0.8 · F_foot^0.5 / 10 · σ_season · D_diff

β_0 = 3.0,  A_ref = 20,  γ = 1.35
A_Σ = Σ_j A_j
F_foot = occupied tiles + paved tiles
σ_season: spring 0.8, summer 0.6, autumn 1.1, winter 1.6
D_diff: Hard 1.0, Brutal 1.4, Unwinnable 2.0
```

**Purse.** The purse fills hourly and pays for waves:

```
P ← P + B_day/24
P_trigger = U(0.8, 1.6) · B_day · 1.5        (rerolled after each wave)
```

**Wave trigger.** A wave launches when any of these holds:

- P ≥ P_trigger and the minimum gap since the last wave (G_min = 12 h) has passed; or
- a channel's aggro jumps: ΔA_j over 6 h ≥ 0.5·A_ref (a punitive wave); or
- a node guardian awakens (§4.4).

**Targeted strength.** Offensive power follows Lanchester's square law:

```
Π = Σ_i dps_i · hp_i
```

- Π_town is summed over defenders reachable within 60 s of the target, with a fortification multiplier: wall HP ÷ breach DPS adds reaction time.
- The wave is sized so that Π_wave = ρ(t)·Π_town, where:
  ```
  ρ(t) = 0.45 + 0.12·ln(1 + t_days/5) + 0.10·A_Σ/A_ref − 0.25·relief
  relief = min(1, casualties in the last 3 days / max(4, 0.15·N))
  ```
- A defender win is predicted when Π_town > Π_wave, with surviving fraction √(1 − Π_wave/Π_town).
- The wave spend is `min(P, cost(Π_wave))`. Anything unspent stays in the purse, so the next wave is larger.
- Relief is temporary. It never touches A_scar.

### 2.4 Wave composition

1. **Pick the archetype** by softmax over channel aggro and the season matrix (§2.6):
   ```
   p_j = exp(σ_j·A_j/τ) / Σ exp(…)      τ = 8
   ```
   Weather-riders are feasible only when vis < 50 m.
2. **Fill the roster** with a greedy knapsack over that archetype's unit table (§2.5), in descending cost-efficiency (Π per point), until Π_wave is reached or the spend runs out.
3. **Unit levels**: `L = round(L_base + 0.35·√(A_j) + 0.08·t_days)`.
   - Unit cost scales as `c·L^1.5`.
   - Stats scale as the existing `statsAt()`: hp ×(1 + 0.12L), dmg ×(1 + 0.10L).
4. **Origin** is the lair or edge sector with the largest local stimulus in that channel. This reuses `Raid.origin`.

### 2.5 Assault archetypes

Monster kinds are taken from the existing bestiary.

| Archetype | Kinds (by level band) | Base cost | hp | dps | Speed (tiles/s) | Structure dmg × | Special |
|---|---|---|---|---|---|---|---|
| **Kinetic breacher** | troll, cyclops, oni, gashadokuro | 12 | 900 | 25 | 0.6 | ×4 vs nodes | targets load-bearing nodes (§5.6) |
| **Subterranean burrower** | ghoul, jiangshi, jorogumo, "wyrm" | 10 | 400 | 30 | 0.3 underground | ×2 | ignores walls; surfaces under the highest-value zone |
| **Weather-rider** | wendigo, yurei, wraith, banshee | 14 | 300 | 45 | 1.4 | ×0.5 | spawns only when vis < 50 m; stalks isolated agents |
| **Biological infiltrator** | wisp swarm, kitsune (carrier), spore cloud | 6 | 60 | 0 (disease) | wind-drift | 0 | contaminates food lots and wells |

**Kinetic breacher FSM**

```
APPROACH → (leverage target reached) BREACH_NODE → (node failed) → cascade check
   → (collapse ≥ 30%) PILLAGE → RETREAT
   → (else) re-target via leverage map
Morale break: hp < 25% and ≥ 1 ally dead → RETREAT
```

**Burrower FSM**

```
DESCEND (1 min) → TUNNEL(v_dig) → SURFACE(target zone) → RAID_STORE → FLEE_DOWN
v_dig = 0.3 / H_ground   (tiles/s)
```

| H_ground | Value |
|---|---|
| loam | 1 |
| clay | 1.5 |
| frozen soil (depth < z_f) | 3 |
| bedrock | 8 |
| stone flag floor | 5 |
| water | ∞ — moats and ditches are hard stops |

- Detection by listening posts (a barrel of water on the floor): each hour, `p = 1 − exp(−0.8·(12/d)²)` for tunnellers within 12 tiles.
- A detected burrower can be counter-mined: 2 miners meet it underground, and the fight uses combat at ×0.7 stats for both sides.

**Weather-rider FSM**

```
SPAWN(blizzard edge) → HUNT: score agents by
   U = (1/(1 + allies within 6 tiles)) · (37 − T_c) · (1 − light(x)/L_repel)
→ STALK (stays > 8 tiles away until U_max ≥ threshold) → STRIKE (grab and drag, 1.0 tiles/s)
→ (vis > 80 m or light > L_repel) DISSIPATE
```

- Light repels them: L_repel is a torch or lamp radius. They dissipate when the blizzard ends, and never enter lit zones.
- They prey on the already-hypothermic. The cold and the monsters compound each other.

**Infiltrator: spore plume** (Gaussian puff):

```
C(x, t) = Q/((2π)^{3/2}·σ_x·σ_y·σ_z) · exp(−((x − x_0 − u·t)²)/(2σ_x²) − y²/(2σ_y²)) …
σ_y = σ_z = 0.08·x·(1 + 0.0001·x)^−0.5
```

- **Deposition on a lot**: `df_c/dt = k_dep·C·(1 − seal)`.
  - seal: open sack 0; crate 0.3; lime-washed store 0.6; sealed clay jar 0.9; smokehouse 0.95 (smoke kills spores).
- **Well contamination** takes 10× deposition, because the water is open.
- Contaminated food (f_c > 0.2) carries **ergotism** risk when eaten. Contaminated water carries **dysentery** risk (§7).
- Spores are dormant below −5 °C, so infiltrators peak in spring and in autumn thaws.

### 2.6 Seasonal allocation matrix (σ_j)

| Season | K | B | Wr | I |
|---|---|---|---|---|
| Spring | 1.0 | 1.2 (thawed soil) | 0 | 1.4 |
| Summer | 1.2 | 0.8 | 0 | 1.0 |
| Autumn | 1.3 | 1.0 | 0.4 | 0.8 |
| Winter | 0.8 | 0.4 (frozen soil) | 2.5 | 0.2 |

---

## 3. Negative-Sum Economy & Perishable Spoilage

### 3.1 Lots and decay kinetics

Every food resource is a list of lots, each `{kg, q, age, tag, f_c, thawCount, kMul}`. Consumption is FIFO by lowest q.

```
dq/dt = −k·q         (calendar clock, per game day)

k = k_20 · Q10^{(T_store − 20)/10}      for T_store ≥ 0      (Q10 = 2.3)
  = k_20 · 0.01                          for T_store ≤ −2     (frozen)
  = linear between −2 and 0
  × (1 + 1.5·max(0, RH − 0.75))          dry goods take on moisture
  × (1 + 2·C_m)                          miasma in the store
  × kMul                                 freeze-thaw damage, preservation
```

Arrhenius form, where a designer prefers it: `k = A·exp(−E_a/(R·T_K))`, with E_a ≈ 60 kJ/mol. This is equivalent to Q10 ≈ 2.3 around 10 °C.

**Quality bands**

| q | Status | Effect of eating |
|---|---|---|
| ≥ 0.6 | good | – |
| 0.25–0.6 | spoiled | sickness chance `0.25·(1 − q/0.6)` per meal (food poisoning, §7); sanity −4 |
| < 0.25 | rotten | inedible; moved to waste → bio stimulus 0.2 L-eq/kg, plus a miasma source |

**Freeze-thaw ("thaw rot").** Each crossing of a lot from ≤ −2 °C to > 0 °C applies q −= 0.04 and kMul ×= 1.3 (capped at 3).

**Store miasma** (per zone):

```
dC_m/dt = 0.05·m_rotten/V − (ACH/24)·C_m
```

Rot is autocatalytic. A spoiled lot speeds up every lot around it.

**k_20 per game day** (κ_cal folded in). "Days to q = 0.6" is 0.51/k at 20 °C and at 5 °C.

| Food | k_20 | Days @ 20 °C | Days @ 5 °C |
|---|---|---|---|
| Fresh meat | 3.25 | 0.16 | 0.54 |
| Fish | 4.5 | 0.11 | 0.40 |
| Milk | 6.5 | 0.08 | 0.27 |
| Cooked meal | 3.9 | 0.13 | 0.45 |
| Bread | 1.56 | 0.33 | 1.1 |
| Berries / strawberry / grape | 2.6 | 0.20 | 0.68 |
| Greens (cabbage, watercress, herb) | 0.78 | 0.65 | 2.3 |
| Onion / garlic | 0.10 | 5.1 | 17.8 |
| Roots (potato, turnip, carrot) | 0.078 | 6.5 | 22.8 |
| Pumpkin | 0.05 | 10 | 36 |
| Grain / dry bean / barley | 0.010 | 51 | 178 |
| Smoked meat | 0.13 | 3.9 | 13.7 |
| Salt pork | 0.039 | 13 | 46 |
| Sauerkraut | 0.052 | 9.8 | 34 |
| Cheese | 0.13 | 3.9 | 13.7 |
| Hardtack | 0.0065 | 78 | 274 |

### 3.2 Storage microclimate

A store's temperature T_store comes from its zone model (§1.8) with no heat input, earth-coupled.

| Store | Ground coupling U_f·A_f factor | Air T lag | Notes |
|---|---|---|---|
| Open pile | 0 | none | T = T_amb; raided by scavengers: 1%/h loss at night if unlit |
| Granary (timber, raised) | 0.2 | 6 h | RH follows outdoors; rats 0.3%/day unless a cat or rat-catcher |
| Root cellar (dug 2 m) | 3.0 | 72 h | T ≈ 2–6 °C all year; RH 0.9; cannot be built on water-logged tiles |
| Ice house (existing `icefactory`) | 3.0 | 72 h | holds 0–2 °C while ice mass > 0; ice melts at `Q_leak/334 kJ` kg per second → thaw-rot event when it runs out |
| Winter outdoor cache | 0 | none | free freezing, but freeze-thaw on every thaw regime; Infiltrator ×2 |

### 3.3 Preservation processes

| Process | Inputs per kg of raw food | Labour | Output mass | kMul | Side effects |
|---|---|---|---|---|---|
| Pit-smoking | 0.6 kg wood (any MC; green gives more smoke), smokehouse | 0.5 h | ×0.65 (kcal/kg ×1.5) | 0.04 | smoke stimulus: 20 g PM/kg (×2 with green wood); thirst +0.3 L per kg eaten |
| Brine / dry salt curing | 0.25 kg salt | 0.3 h | ×0.85 | 0.012 | thirst +0.5 L/kg; vitamin C → 0 |
| Pickling (sauerkraut) | 0.02 kg salt, sealed crock | 0.2 h | ×1.0 | 0.07 | keeps 60% of vitamin C; fermentation fails with p = 0.1·(1 − seal)·(T > 22 °C ? 2 : 1) → whole crock rotten |
| Silage (fodder) | sealed pit, 1 h per tonne | – | ×0.9 | 0.02 | failed seal (p = 0.15 per pit) → butyric rot, fodder lost; livestock sickness if fed |
| Drying (fruit, herbs, grain) | sun or kiln (0.3 kg wood/kg) | 0.2 h | ×0.25 | 0.02 | none; summer and autumn only without a kiln |
| Cold storage | – | – | ×1.0 | via T | thaw-rot risk (above) |

**Salt** is a new strategic resource. It comes only from rock-salt nodes (§4.4), caravans, or seawater boiling (2 kg wood per kg salt).

### 3.4 Hydration and vitamin C (per-agent pools, per game day)

**Water need**

```
need = 2.5 L + 0.0006 L/kcal·(labour kcal) + 0.3·kg_smoked + 0.5·kg_salted
```

- Sources: river or well (contamination risk f_c,well), or melted snow.
- Melting and warming snow costs 0.4 MJ/L, or 0.09 kg oak per litre at pot efficiency 0.3.

| Water deficit | Effect |
|---|---|
| ≥ 1.5 L | work ×0.85; R_t max −0.02 (peripheral perfusion) |
| ≥ 4 L | HYPO transitions +0.5 °C earlier; confusion |
| ≥ 7 L | death |

**Vitamin C pool** V (mg), capped at 1500:

```
dV/dt = intake − 0.128·V − 15·𝟙(T_c < 36)      per game day
```

- Onset is about 12.6 game days without fresh food, a little over one winter.

| V (mg) | Effect |
|---|---|
| < 300 | scurvy I: fatigue Φ recovery ×0.7; wounds heal ×0.5 |
| < 100 | scurvy II: old wounds reopen (bleed 0.01 L/min); death hazard 0.05/day |

**Vitamin C content (mg/kg)**

| Food | mg/kg |
|---|---|
| Greens | 300 |
| Berries | 400 |
| Potato | 150, halving every 5 game days in store |
| Sauerkraut | 150 |
| Onion | 70 |
| Pine-needle tea (new recipe) | 250 per litre |
| Meat, grain, smoked or salted food | 0 |

### 3.5 Soil N–P–O dynamics (per field, per m², calendar clock)

State: N (g/m², available), P (g/m²), O (% soil organic matter), plus the consecutive-crop count n_c.

- Initial state: N 12, P 4, O 3.0.
- Forest-cleared land starts richer: N 16, O 5.

**Yield** (Mitscherlich with a quadratic-free multiplicative form):

```
Y = Y_max · (1 − e^{−N/K_N}) · (1 − e^{−P/K_P}) · (0.6 + 0.4·min(1, O/3))
      · f_T · f_irr · f_skill · (1 − 0.15·(n_c − 1))⁺_{cap 0.4}

K_N = 4, K_P = 1.2
f_irr = 1 if the field touches a watermill, else 0.5
```

The −0.15 per consecutive season of the same crop is monoculture pest pressure.

**Per-cycle uptake and yield**

| Crop | Cycle (game days) | Y_max (kg/m²) | N uptake (g/m²) | P uptake | O change (%) |
|---|---|---|---|---|---|
| Wheat | 6 | 0.20 | 5.0 | 0.9 | −0.05 |
| Barley | 5 | 0.22 | 4.0 | 0.7 | −0.05 |
| Potato | 5 | 2.0 | 6.0 | 1.0 | −0.08 |
| Cabbage | 4 | 2.5 | 7.0 | 1.1 | −0.04 |
| Bean | 5 | 0.15 | **−4.0 (fixes)** | 0.6 | +0.02 |
| Onion / garlic | 5 | 1.5 / 0.6 | 3.0 / 2.0 | 0.5 / 0.3 | −0.03 |
| Turnip | 3 | 2.0 | 4.0 | 0.7 | −0.03 |
| Corn | 7 | 0.35 | 7.0 | 1.2 | −0.06 |
| Pumpkin | 6 | 3.0 | 5.0 | 0.8 | −0.04 |
| Strawberry (perennial) | 4 | 0.4 | 2.0 | 0.3 | 0 |
| Rice / taro / lotus (paddy) | 6 | 0.25 / 1.5 / 0.8 | 4.0 | 0.6 | +0.02 (flooded) |

**Recovery per game day**

- Mineralisation: `ΔN = +0.02·O`.
- Fallow (grass cover): `ΔN = +0.5`, `ΔO = +0.05`.
- Bare tilled soil in spring rain: `ΔO = −0.03`.
- Phosphorus has no natural recovery. It returns only through manure, bone meal or ash.

**Amendments**

| Amendment | Per kg applied per m² | Hazard |
|---|---|---|
| Manure (livestock) | +5 N, +1 P, +0.1 O | – |
| Nightsoil, composted ≥ 6 game days | +8 N, +1.2 P, +0.05 O | – |
| Nightsoil, fresh | same | dysentery exposure on the crop: f_c = 0.3 |
| Wood ash (from hearths) | +3 P, +0.5 K | raises pH; skip K |
| Bone meal (from butchery, needs mill) | +15 P | – |

Each person produces 12 g N and 1.6 g P of nightsoil per game day. A 3×3 farm plot (36 m²) needs about 180 g N per cycle, which is about 15 person-days of nightsoil.

### 3.6 Tool mechanical fatigue

State per tool: sharpness s ∈ [0, 1], fatigue damage D ≥ 0, and remaining mass m.

**Per work-hour**

```
Δs = −k_w · (H_target/H_tool)^2.2 · I_job
ΔD = d_0 · (ρ_target/ρ_ref)^1.5 · (1/K_tool) · Φ_cold · I_job
Φ_cold = 1 + 4·clamp((T_DBT − T_amb)/15, 0, 1)       ductile-to-brittle transition: up to 5× below T_DBT
P_fail(hour) = 1 − exp(−[(D + ΔD)^β − D^β])           Weibull, η = 1, β = 4
```

- `k_w = 0.004`, `d_0 = 0.0025` (about 400 h for an iron axe on pine), `ρ_ref = 450`.
- **Sharpening**: 0.25 h and a whetstone, sets s = 1 and removes Δm = 1.5% of the mass. At 60% of the original mass the tool is spent.

| Tool material | H_tool (HV) | K (toughness) | T_DBT (°C) | Source |
|---|---|---|---|---|
| Flint | 700 | 0.10 | n/a (always brittle; ΔD ×3) | flint node |
| Bronze | 150 | 0.80 | none | trade |
| Bog iron (phosphoric, "cold-short") | 120 | 0.60 | **−5** | bog-iron node + bloomery |
| Wrought iron | 110 | 0.90 | −25 | refined bloom |
| Carburised steel | 400 | 0.70 | −15 | forge + charcoal |
| Crucible steel | 500 | 0.80 | −30 | forge L20+ |

| Target | H_target (HV-equivalent) | ρ (kg/m³) | Frozen multiplier (< −5 °C) |
|---|---|---|---|
| Softwood | 30 | 450 | ×1.5 H, ×1.1 ρ |
| Oak | 55 | 750 | ×1.5, ×1.1 |
| Loam | 20 | 1500 | ×4 (frozen soil) |
| Clay | 40 | 1800 | ×4 |
| Limestone | 200 | 2600 | ×1 |
| Granite | 800 | 2700 | ×1 |
| Bog iron ore | 250 | 3000 | ×1.2 |
| Coal | 80 | 1350 | ×1 |
| Ice | 40 | 917 | – |

**Catastrophic failure**: the job stops. There is an 8% chance of injury (laceration, §7) and the tool yields 40% of its mass as scrap.

Consequence: logging in deep winter with bog-iron axes shatters them. Steel costs charcoal, charcoal costs forest and smoke, and both feed aggro.

---

## 4. Expedition Logistics & Attrition

This replaces the fixed 12-hour ration and 2-hour torch pack in `wilds.ts` with a physical model. The six pack slots become a **carry mass**.

### 4.1 Load, speed and energy

**Pandolf load-carriage equation** (W):

```
M_march = 1.5·W_b + 2.0·(W_b + L)·(L/W_b)² + η_t·(W_b + L)·(1.5·V² + 0.35·V·G)

W_b = body mass 70 kg; L = carried load (kg); V = m/s; G = grade %
η_t: road 1.0, dirt 1.1, grass 1.2, light brush 1.2, heavy brush / forest 1.5, bog 1.8, sand 2.1,
     snow 1.30 + 0.082·d_cm
```

Check: 25 kg load on grass at 1.2 m/s gives M ≈ 375 W.

**Choosing speed.** Solve for V such that M_march ≤ M_cap:

```
a·V² + b·V + c = 0
a = 1.5·η_t·(W_b + L)
b = 0.35·η_t·(W_b + L)·G
c = 1.5·W_b + 2(W_b + L)(L/W_b)² − M_cap
```

M_cap is 450 W sustained, 800 W for a 30-minute dash, and 1100 W for a 60-second sprint.

**Haulage**

```
F  = m·g·(μ·cos θ + sin θ)
V_haul = P_team/F
P_team = Σ haulers × 90 W sustained pulling + horses × 500 W
```

| Rolling / sliding surface | Cart C_rr | Sledge μ |
|---|---|---|
| Road | 0.03 | 0.30 |
| Grass | 0.08 | 0.25 |
| Mud | 0.20 | 0.35 |
| Snow, T > −10 | 0.25 | 0.06 |
| Snow, T < −20 (dry, sandy) | 0.30 | 0.10 |
| Ice / frozen river | 0.02 | 0.03 |

| Carrier | Capacity (kg) | Upkeep / game day | Notes |
|---|---|---|---|
| Person (pack) | 25 (knights and wizards; pack slot = 4 kg, 6 slots) | self | – |
| Hand-cart | 150 | 1 h repair per 10 km | useless in snow over 15 cm |
| Sledge | 250 | – | winter or frozen ground only |
| Pack mule | 90 | 8 kg fodder, 25 L water; no winter grazing | panics at monsters: p = 0.3 bolt |
| Pack horse | 110 | 10 kg fodder, 30 L | cold-stress model as agents with C_b ×8 and clo 3 |

**Ration density (kcal/kg)**: hardtack 3500, pemmican 5000, cheese 3500, smoked meat 2500, bread 2500, potato 770.

A marching person needs about 4200 kcal per game day (8 h at 375 W plus 16 h near basal, plus cold): roughly 1.2 kg of hardtack or 0.85 kg of pemmican. The ration slot becomes a mass of food, and hunger follows the per-agent energy model (§1.6) rather than a fixed timer.

### 4.2 Navigation drift

The party carries a believed position p̂ (dead reckoning) and a true position p. The two diverge as they walk.

```
Per Δd km walked: heading error ψ ← ψ + N(0, σ_ψ²·Δd)
σ_ψ = 0.15 · (1 + (250/vis)^0.7) · (1 − 0.6·skill_nav) · L_fix
L_fix = 0.3 if a landmark is in sight (river, lit fire, tower, lair), else 1
p = p̂ + e,  where e accumulates from ψ each step
```

- The party is **LOST** when |e| > max(r_sight, 30 m) and no fix is available.
- A fix happens when a landmark comes into sight: e ← 0 with probability `p_fix = 0.8·skill_nav + 0.2`.
- Torch light radius is 12 m. Without a torch at night, r_sight is 3 m.

In a blizzard (vis 25 m), σ_ψ ≈ 0.9 rad/√km. After 1 km the heading is about 50° off.

**The existing fixed 90-minute lost timer is removed.** A lost party walks a correlated random walk, and the thermal model (§1.4) kills them. Death has a physical cause.

### 4.3 Supplies FSM

Per party:

```
PREPARE → MARCH_OUT ─(target reached | 50% of food or light used | casualty)─▶ WORK_NODE / RETURN
MARCH_OUT/RETURN ─(|e| > threshold)─▶ LOST ─(fix)─▶ RETURN
any ─(ambush)─▶ ENGAGE ─(Π_party < 0.7·Π_enemy)─▶ FIGHTING_RETREAT
FIGHTING_RETREAT ─(safe: inside the town's sight)─▶ HOME
```

**Auto turn-back rule** (a default the player can override):

```
Return when food_kcal ≤ 1.2 × kcal_to_home  or  light_h ≤ 1.2 × h_to_home.
```

### 4.4 Extraction-node wake-up meter

Each wilderness node has a wake meter W_n ∈ [0, 100].

```
ΔW_n = c_n · Q_extracted + 0.5 · crew · Δt_h + 2 · L_blood_spilled_at_node
       + 5 · blasting_charges
Decay while idle: −r_n per game day, but never below 40 once the node has been AWAKENED (scar)
```

| W_n | State | Ambush hazard λ (per crew-hour) | Other |
|---|---|---|---|
| < 25 | DORMANT | 0 | – |
| 25–50 | SIGNS | 0 | tracks: a warning log line |
| 50–75 | STIRRING | 0.02·((W − 50)/50)² | patrols |
| 75–100 | HUNTING | 0.08·((W − 50)/50)² | patrols track the party home: +20 to the town's K channel |
| 100 | AWAKENED | guardian spawns | pursues; if not killed within 24 h it becomes a town raid with `origin` = node |

| Node | Yield per labour-hour | c_n | r_n per day | Guardian (bestiary) | Output |
|---|---|---|---|---|---|
| Bog iron | 4 kg ore (30% Fe) | 0.6/kg | 3 | kappa brood → hydra | bloomery: 10 kg ore + 15 kg charcoal → 2.5 kg bog iron |
| Rock salt | 6 kg | 0.5/kg | 2 | gargoyle | salt |
| Surface coal | 8 kg | 0.4/kg | 4 | salamander swarm | coal |
| Peat bog | 30 kg wet | 0.1/kg | 5 | wisp host | peat (MC 0.85, must dry) |
| Flint scar | 3 kg | 0.8/kg | 3 | tengu | flint |
| Silver seam | 0.3 kg | 12/kg | 1 | jorogumo | silver |

### 4.5 Fighting retreat, triage and abandonment

**Pursuit**

```
t_catch = gap / (v_pursuer − v_party)
t_safe  = distance_to_sight / v_party
Escape if t_safe < 0.8·t_catch.
```

**Cargo-drop decision.** Drop items in ascending order of value density (value per kg), recomputing v_party(L) with the Pandolf solve (§4.1), until the escape condition holds. Dropped cargo stays on the tile as a lootable lot. It raises the node's wake meter by +5 when the pursuers claim it.

**Casualties**

- A litter needs 2 bearers, each carrying +35 kg.
- Abandoning a comrade removes the load. Surviving party members take −25 sanity and the "Left them" trait (−0.1/h sanity for 3 days). The town's Hope takes −4.
- **Field wound infection**:
  ```
  λ_inf = 0.08·(1 + dirt)·(1 − 0.7·clean_dressing)·(1 + 0.5·cold_injury)   per game day
  ```
  Progression to gangrene is in §7.
- **Frostbite III or IV in the field** becomes gangrene in 2–5 days. Amputation in the field uses §6.5 "Triage without medicine" odds.

---

## 5. Structural Integrity, Load Transfer & Breach Pathfinding

### 5.1 Structural graph

Each structure is a graph G = (nodes, beams).

- **Nodes (posts)** stand at the four corners, along the perimeter every tile (2 m, typical post spacing for timber-framed houses), and on an interior grid wherever the clear span exceeds 3 tiles (6 m).
- **Beams** join adjacent nodes along grid lines.
- **Tributary area** A_trib,i is the Voronoi share of the roof plan.
- Walls in `s.map.overlay` are chains of one node per tile, carrying their own weight and wind load only.
- The graph is cached per structure and rebuilt when the building is upgraded or combined.

### 5.2 Loads (kPa)

```
q_i = q_dead + q_snow + q_ice,eave + q_wind,equiv

q_snow = μ_s(θ)·ρ_s·g·d_roof
μ_s(θ) = 0.8 (θ ≤ 30°);  0.8·(60 − θ)/30 (30–60°);  0 (> 60°)
```

**Roof snow balance**, per hour (depth d in m, w.e. in mm):

```
d_roof ← d_roof + snowfall − slide − melt_roof
melt_roof (mm w.e./h) = q_roof·3.6/334,   q_roof = U_roof·(T_z − 0)   while T_amb < 0
```

- Melt that refreezes at the eaves: when T_amb < −3, 50% of melt_roof becomes q_ice,eave on the perimeter nodes.
- **The insulation paradox**: a well-insulated thatch roof (U 0.35) sheds almost nothing and carries the full snow load. A leaky slate roof (U 4.5) melts about 11 mm of water per day but builds ice dams.
- **Wind**: dynamic pressure `q_w = 0.613·v²` Pa × C_p 0.8 on the windward wall, shared by that wall's nodes as a lateral load. It converts to an equivalent vertical utilisation with factor 0.4.

### 5.3 Capacities

The node capacity is its weakest link:

```
C_i = min(P_crush, P_Euler, P_joint, P_bearing) · φ_cond · φ_rot · φ_moist · φ_heave · φ_thaw

P_crush   = f_c·A_post
P_Euler   = π²·E·I/(K·ℓ)²      (square post: I = b⁴/12, K = 1)
P_joint   = n_pegs · 25 kN      (pegged mortise-tenon; iron-strapped ×2)
P_bearing = q_soil·A_pad        (q_soil: dry 100 kPa, wet clay 60, thawing silt 30; padstone 0.2 m², trench footing 1.0 m² per node)
```

| Timber | E (GPa) | f_c (MPa) | f_b (MPa) | Wet factor |
|---|---|---|---|---|
| Oak | 11 | 30 | 40 | 0.7 |
| Pine | 9 | 20 | 25 | 0.7 |

**Beams**

```
M   = q_line·L²/8,   q_line = q·trib_width
σ   = M/S,           S = b·h²/6
δ   = 5·q_line·L⁴/(384·E·I)·(1 + k_def)
k_def: dry 0.6, humid 0.8, wet 2.0
Fails if σ > f_b·φ, or δ > L/100 (sag: a warning at L/200).
```

**Worked**: a 10 m × 6 m log house has 16 perimeter posts (3.75 m² each) on 0.2 m² padstones, and a turf roof (q_dead 2.5 wet, plus 0.3 self-weight) under 0.8 m of settled snow (ρ 250, μ 0.8, so 1.57 kPa).

- q = 4.4 kPa, so a node carries ≈ 16.5 kN.
- On dry ground P_bearing = 20 kN, and u = 0.83: it holds.
- **At spring thaw, φ_thaw = 0.35 drops capacity to 7 kN and it fails.** That is the designed "thaw collapse" event.
- Trench footings (100 kN) remove the risk, at a stone-quarrying cost that feeds the B channel.

### 5.4 Frost heave, thaw and rot

**Freezing index and frost depth** (calendar clock):

```
FI = Σ_days max(0, −T̄_day)·κ_cal                           physical °C·day
z_f = √(2·k_f·FI·86400 / (w·ρ_d·L_f))
k_f = 1.8 W/mK,  w = 0.2,  ρ_d = 1600,  L_f = 334 kJ/kg
```

A 10-day winter at −14 °C gives FI ≈ 1820 and z_f ≈ 2.3 m.

**Heave damage** (per game day, if z_found < z_f and the soil is frost-susceptible):

```
Δφ_heave = −0.004·(z_f − z_found)·s_soil·(corner ? 1.5 : 1)·(heated interior ? 0.4 : 1)
s_soil: silt 1.0, clay 0.7, sand 0.2, gravel 0.05, drained ×0.5
```

| Footing | Depth | Cost |
|---|---|---|
| Padstone | 0.3 m | 2 stone per node |
| Trench footing | 0.8 m | 10 stone per node, 2 labour-h |
| Deep stone footing | 1.5 m | 25 stone per node, 6 labour-h |

**Thaw**: φ_thaw = 0.35 for `t_thaw = 0.6·z_f` game days after the last freezing day, then back to 1.

**Rot** (per game day, ground-contact timber, T > 5 °C):

```
Δφ_rot = −0.02·f(T)·f(W)·rot_class
f(T) = (T − 5)/15, clamped to [0, 1]
f(W) = 1 wet, 0.3 dry
Protection: tarred ×0.3; charred ×0.4; on a padstone ×0.2
```

### 5.5 Progressive collapse algorithm

Deterministic, event-driven. It runs when loads change (hourly snow update, a raid hit, a thaw) or a capacity changes.

```
function resolveStructure(G):
  queue ← nodes with u_i = L_i/C_i > 1, sorted by (u desc, id asc)
  while queue not empty and iter < 4·|nodes|:
    i ← pop(queue); if i.failed continue
    i.failed ← true; emit event NODE_FAIL(i)
    Nb ← intact neighbours of i
    if Nb empty:
      collapseRoof(A_trib,i)        → debris; occupants in area: injury p = 0.6, death p = 0.15·(q/2 kPa)
    else:
      for j in Nb: L_j += γ_dyn · L_i · k_j / Σ_{m∈Nb} k_m      (γ_dyn = 1.5; k = E·A/ℓ)
      for each beam b adjacent to i: recompute σ_b, δ_b with doubled span; beam failure → treat as node failures at both ends' load share
      push every j with u_j > 1
  collapsedFraction = Σ failed A_trib / A_roof
  structure.hp ← hp·(1 − collapsedFraction); if collapsedFraction ≥ 0.6 → ruin (existing Debris overlay)
```

Complexity is O(n log n) per event, with n ≤ 60 nodes per building. Walls use the same routine as 1-D chains. A wall tile failing drops the two adjacent tiles' capacity ×0.8 (loss of bracing).

### 5.6 Breach pathfinding

**Tile entry cost**, in seconds of risk-weighted time:

```
c(t) = c_move(terrain)
     + HP_t / (DPS_group · pen)                                        breaching
     + w_risk · Σ_defenders DPS_d · 𝟙(t ∈ range_d) · τ_exposure / HP_group   kill-box penalty
     + w_mem · deathMap(t)                                             learned danger
     − lure(t)
```

| Archetype | w_risk | Notes |
|---|---|---|
| Kinetic | 0.2 | tanks through |
| Weather-rider | 2.0 | avoids archers; lights are hard walls |
| Infiltrator | – | wind-borne; no pathing |
| Burrower | – | underground; uses the H_ground cost field instead |

- **Death map**: `deathMap(t) += 1` per hostile death within 2 tiles, decaying with a 3-day half-life. The wild learns the player's kill-boxes, so a static kill-box's value decays.
- **Target value density** V:

  | Target | V |
  |---|---|
  | food lot | 1e-4 × kcal |
  | sleeping villager | 40 |
  | heated zone (weather-riders ×3) | 0.01 × W of heat |
  | Kinetic only: node leverage | Λ_i = Σ value of structures that fall if i fails / HP_i |

  Leverage uses a dry-run of §5.5, cached per building and invalidated on damage or snow change.
- **Goal selection**: take the top K = 8 targets by V. Run a reverse Dijkstra from each (the flow field is shared by the pack). Choose:
  ```
  argmax  U = V / (T_path + T_breach + 10 s)
  ```
- **Replan** when a wall tile changes, a cost changes by more than 20%, or every 5 s of combat time.
- **Commitment**: continue a breach unless the new best U exceeds the current U by more than 50%.

The result is that hostiles bypass the kill-box and hit the thinnest wall in front of the granary, or the corner post of the dormitory.

---

## 6. Psychological Attrition & Emergency Decrees

### 6.1 Individual sanity S_i ∈ [0, 100]

This extends `Villager.happy`. Per hour:

```
ΔS = − 2.0·max(0, 36.5 − T_c)
     − 0.5·𝟙(awake ∧ lux < 5)
     − 1.5·clamp((0.3 − E_g/E_g,max)/0.3, 0, 1)
     − 4·(spoiled meals eaten this hour)
     − 1.2·Σ_corpses 1/(1 + (d/5 m)²)                    unburied corpses in sight
     − events (witness death 15, kin death 30, amputation witnessed 8, own amputation 25, sacked building 5)
     − 0.1·decreeWeight
     + 1.5·𝟙(sleeping, T_z ≥ 10) + 0.8·𝟙(sleeping, 5 ≤ T_z < 10)
     + 3·q_meal (per hot meal) + 0.5·𝟙(company ≥ 2 within 3 tiles, awake) + festival 3/h
```

Traits scale terms: Hardy ×0.6 cold; Pious ×0.5 corpses but ×2 on "Emergency protein"; Nyctophobe ×3 darkness.

### 6.2 Mental breaks

```
λ_break = 0.004·exp(0.12·(35 − S))   per hour, for S < 35
```

| S band | Break table (weights) |
|---|---|
| 20–35 (minor) | work refusal 6 h (0.5); comfort binge: eats 3 meals (0.3); wander to the fire (0.2) |
| 8–20 (major) | desertion into the fog with 2 days of food (0.35); arson of a random fuel store (0.2); catatonia 24 h (0.3); smash tools (0.15) |
| < 8 (extreme) | homicidal attack on the nearest agent (0.4, combat with dps ×0.5); self-harm / suicide (0.3); lead a mutiny cell (0.3, D_faction +10) |

A break witnessed by others costs each witness −5 sanity.

### 6.3 Community pools

**Hope** H ∈ [0, 100]. This replaces `mood`. Per game day:

```
dH = (S̄ − H)/7 + Σ events
```

| Event | ΔH |
|---|---|
| death | −4 (−8 for a child or long-time settler) |
| repelled raid | +5 |
| festival | +6 |
| unburied corpse, per day | −1 |
| decree enacted | −x (table) |
| new arrivals | +2 |
| building collapse | −3 |

**Discontent** D ∈ [0, 100], per agent, averaged by faction. Per game day:

```
dD = +10·(ration cut fraction) + 1.5·max(0, workHours − 10) + decree deltas − 3 (festival) − 0.03·D
```

**Factions.** Each agent has an ideology vector over {Tradition, Pragmatism, Faith}. Faction = argmax. Each decree carries a stance vector:

```
ΔD_i = base·(1 + 1.5·max(0, −stance·ideology_i))
```

**Ultimatum**: when D_f > 70 for a faction holding > 30% of the population, it demands one of: repeal the last decree, raise rations, or declare a rest day. The player has 48 h to comply. Refusing adds +15 D_f.

### 6.4 Societal collapse FSM (evaluated hourly)

```
STABLE      (H ≥ 50 ∧ D̄ < 40)
  ▼ H < 50 ∨ D̄ ≥ 40                          ▲ H ≥ 60 ∧ D̄ < 30
STRAINED    work ×0.95
  ▼ H < 30 ∨ D̄ ≥ 60 (6 h)                    ▲ H ≥ 40 ∧ D̄ < 50
UNREST      work ×0.85; sabotage hazard 0.01/h (tool smash, fire); decree costs ×1.5
  ▼ D_f ≥ 75 (24 h) ∨ ultimatum refused       ▲ demand met ∨ D_f < 60
STRIKE      the faction's workers idle (heating and cooking included)
  ▼ (H < 10 ∧ D̄ ≥ 85) ∨ strike > 72 h        ▲ never
MUTINY      the faction arms (hp/dps as militia L3); combat vs loyalists and garrison; arson ×5
  ▼ mutineers win ∨ loyalists < 25%
EXILE       the steward is overthrown → run ends (s.fallen with cause "deposed")
```

MUTINY has no path back to STRIKE. It resolves in combat or ends the run.

### 6.5 Desperation decrees (irreversible)

Each decree is enacted once and never repealed. Every one carries a permanent "decree weight" in the ΔS formula.

| Decree | Unlock | Immediate | Permanent effect | ΔH once | ΔD (by faction stance T/P/F) | Weight |
|---|---|---|---|---|---|---|
| **Triage without medicine** | first gangrene case | – | amputation allowed without a physician: gangrene or frostbite IV survival 0.55 (vs 0.2 untreated); amputees: manip cap 0.5 or move ×0.6; witnesses −8 | −3 | +2 / 0 / +4 | 1 |
| **Emergency protein** | food < 1 day for all ∧ corpses exist | each corpse gives 30 kg meat (2000 kcal/kg, k_20 as fresh meat) | eaters: −30 sanity once, "Hollow" trait (−0.2/h for 5 days); prion-analogue exposure: 2% per meal, incubation 8–14 game days, then fatal wasting; Faith faction may ultimatum at once | −25 | +20 / +5 / +40 | 5 |
| **Burn the houses** | T̄_zone < 0 ∧ fuel < 1 day | demolish a home and gain its timber mass as green wood (log house ≈ 6 t) | loses beds; survivors sleep in the hall (crowding → typhus transmission ×2) | −8 | +10 / 0 / +5 | 2 |
| **Extended shifts** | any time | workday 14 h | Φ build ×1.4; productivity +30% | −2 | +6 / 0 / +3 per day active | 1 |
| **Mass graves** | ≥ 5 unburied corpses | corpses buried at 0.2 labour-h each (vs 2) | bio stimulus from corpses ×0; Faith −; burial rites unavailable | −4 | +4 / 0 / +12 | 1 |
| **Seal the sick** | first epidemic | quarantine a building: disease transmission ×0.1 outside it | those inside get no care: mortality ×1.5; sanity −10 town-wide | −6 | +3 / 0 / +6 | 2 |
| **Leave none behind — reversed ("Cull the lame")** | ≥ 3 agents with a permanent disability | disabled agents are exiled into the fog with 1 day of food | saves food; the town learns the law; +1 break hazard multiplier ×1.2 for good | −15 | +15 / +2 / +25 | 4 |
| **Night watch by torchlight** | any time | 4 torches per night on the perimeter | weather-rider strike chance ×0.5 in lit areas; smoke +0.2 kg/night | +2 | 0 | 0 |

---

## 7. Disease, Injury and Combat Thresholds

| Condition | Vector / trigger | Incubation | Progression | Mortality | Treatment |
|---|---|---|---|---|---|
| Food poisoning | spoiled lot eaten | 2–6 h | 1 day: work ×0.5, water −2 L | 1% (5% if water deficit) | rest, water |
| Dysentery | contaminated well or fresh nightsoil | 1–2 days | 4–6 days: water −3 L/day, E_g −800/day | 8%; 25% with water deficit | boiled water (fuel), isolation |
| Ergotism | spore-contaminated grain (f_c > 0.2) | 1 day | convulsive: work 0, sanity −3/h; gangrenous: extremity F +60/h | 10% | stop eating the lot; there is no cure |
| Typhus | lice + crowding (> 1 person per 4 m²) + cold | 8 days | 12 days: fever (T_c set to 39.5, cold stress ×1.5) | 20% | delousing (boil clothes: fuel), space |
| Pneumonia | after HYPO_MODERATE or worse, or W > 0.8 for 12 h | 1–2 days | 7 days: work 0 | 15% (30% if T_z < 10) | warm dry bed |
| Scurvy | V < 300 mg | – | see §3.4 | II: 0.05/day | greens, sauerkraut, pine tea |
| Gangrene | frostbite ≥ III, trench foot III, infected wound | 2–5 days | – | 0.25/day untreated (gas gangrene 0.35) | amputation: survival 0.8 with a physician, 0.55 under the triage decree, 0.2 otherwise |
| CO poisoning | §1.9 | – | – | §1.9 | ventilate |

**Wounds and bleeding** (blood volume 5 L):

| Wound | Bleed (L/min) | Notes |
|---|---|---|
| Minor | 0.005 | – |
| Major | 0.03 | – |
| Arterial | 0.20 | death in about 10 minutes without a tourniquet |

| Blood lost | Effect |
|---|---|
| ≥ 0.75 L (15%) | work ×0.8 |
| ≥ 1.5 L (30%) | shock: move ×0.5; R_t locked at max (cold vulnerability) |
| ≥ 2.0 L (40%) | unconscious |
| ≥ 2.5 L | dead |

- Cold reduces the bleed rate: `×(0.6 + 0.4·clamp((T_x − 10)/20, 0, 1))` for limb wounds.
- **Spilled blood** that is not collected goes to the bio stimulus (§2.1). Every fight advertises the town.

**Combat to-hit / damage.** This extends the current `stepCombat`.

```
p_hit = clamp(0.7 + 0.03·(L_att − L_def) − 0.25·𝟙(vis < 50) − (1 − manip_att)·0.4, 0.05, 0.95)
dmg   = dmg_base·(1 + 0.1·L)·s_weapon^0.5·(1 − armour_def)
```

Every hit also rolls a wound class:

```
P(arterial) = 0.05·crit_mult
P(major)    = 0.25
P(minor)    = rest
```

---

## 8. Core Simulation Pipeline

The order within each tier is fixed and deterministic. All stochastic draws use the subsystem streams from §0.3.

### 8.1 Combat tick (dt_c = 0.05 s real; existing `stepCombat`)

1. Flow-field lookup and movement (§5.6). Replan if dirty.
2. Weather-rider light check: dissipate or flee.
3. Attacks: to-hit, damage, wound class, bleed onset. Blood goes to the ledger.
4. Structure hits: node damage → `resolveStructure` (§5.5).
5. Morale and retreat checks; field promotions (existing).
6. Deaths: corpse entities are created (they persist, and feed §2.1 and §6.1).

### 8.2 Minute tick (Δt = 60 s game)

1. **Weather sample**: interpolate the hourly keyframe to the minute (T_amb, v, P, vis).
2. **Vision and light fields**: `visionMap` memo, invalidated only when sources change.
3. **Agent microclimate** (§1.2): zone lookup or outdoor exposure, wind shelter, radiant gain.
4. **Agent physiology**, for each villager in id order:
   1. wetness and sweat (§1.3);
   2. core ODE, Euler (§1.4);
   3. extremities and injury doses (§1.5);
   4. energy stores (§1.6);
   5. COHb (§1.9);
   6. bleeding (§7);
   7. affliction FSM transitions and hazards (§1.7).
5. **Agent AI and jobs**:
   - Priority overrides: warmth, food, flee.
   - Labour output × productivity.
   - Tool wear (§3.6).
   - Stimulus emission to the ledger: canopy, acoustic.
6. **Expeditions** (§4): movement (Pandolf speed), drift, fixes, lost walk, node extraction, wake meter.
7. **Hostile movement outside combat**: roamers (existing `stepWilds`), burrower tunnelling, stalkers.
8. **Construction completion, crafts, returns** (existing minute block).

### 8.3 Ten-minute tick

1. Zone thermal update (exact exponential) and the masonry-stove node.
2. Zone CO update.
3. Combustion: fuel draw from grates (replaces the existing hourly pit-fire burn), and smoke to the ledger.

### 8.4 Hour tick (existing `hourAcc` block, reordered)

1. **Weather generator step**: regime Markov, AR(1) anomaly, wind draw.
2. **Snow**: ground and roof accumulation, settling, roof melt, eave ice.
3. **Heat stimulus**: Σ zone heat leak goes to the ledger.
4. **Spoilage**: every lot's q update (§3.1), thaw-rot events, miasma, rotten lots moved to waste (bio ledger), vitamin C decay of stored potatoes.
5. **Structures**: rebuild loads → `resolveStructure` for any structure whose load or capacity changed. Chimney-fire and ignition hazards; fire spread.
6. **Aggro integration** (§2.2): fold the ledger into A_j^hot and A_j^scar; clear the ledger.
7. **Director** (§2.3–2.4): purse accrual, trigger checks, wave build; lairs grow (existing `lairLevel`) with an added `+0.02·A_j` bias per brood channel.
8. **Psychology**: S_i hourly terms (§6.1), break hazards (§6.2), collapse FSM (§6.4), ultimatum timers.
9. **Economy**: production batch completion, storage caps, trades and caravans (existing), knights' pay (existing), clearing and wild crops (existing).
10. **Housing assignment and deaths cleanup** (existing).

### 8.5 Day tick (05:00, before dawn)

1. Calendar: season rollover, winter cull of trees (existing `winterCull`), wild-crop sowing (existing, at 06:00).
2. Frost: freezing index, z_f, heave damage, thaw window, rot (§5.4).
3. Wood seasoning MC updates (§1.9); peat drying.
4. Soil mineralisation and fallow; harvest resolution for fields whose cycle completed (§3.5).
5. Disease progression and incubation clocks, gangrene hazards, vitamin C and water pools, starvation states.
6. Community Hope, Discontent and factions (§6.3); decree per-day effects.
7. Director daily budget recompute (§2.3); node wake-meter decay (§4.4).
8. Invariant checks (debug builds): no NaN, energy conservation per zone within 1%, every lot q ∈ [0, 1], structural loads ≥ 0. Then save checkpoint (existing RLE `packSave`).

### 8.6 Performance budget (per game hour at 30× speed, i.e. 1 real second)

| Subsystem | n | Cost |
|---|---|---|
| Agent physiology | ≤ 300 agents × 60 min | ≈ 18k updates, ~2 ms |
| Zones | ≤ 200 × 6 | negligible |
| Lots | ≤ 2000 | 1 exp() each per hour |
| Structural | event-driven; hourly snow resolve ≤ 200 buildings × ≤ 60 nodes | ~12k node checks |
| Pathfinding | ≤ 8 reverse Dijkstra on 86 400 tiles, only on replan | ~5 ms each; flow fields cached |

---

## 9. Design Improvements Over the Current Build

The table maps current mechanics (`src/lib/town/sim/`) to their replacements.

| Current | Problem | Replacement |
|---|---|---|
| `raidChance(pop) = min(0.95, 0.3 + 0.02·pop)` every 6 h | Threat depends only on headcount. The optimal play is a small population with maximal walls, and the player's actions don't drive the threat. | Stimulus ledger → channel aggro with a permanent scar term → director purse (§2). Every productive act has a threat price. |
| Global `s.hunger`, flat −1.2 health/h when below 30 | Averaging hides individual starvation. There is no energy-versus-cold coupling. | Per-agent E_g and F (§1.6), with shivering drawing on glycogen (§1.4). Rationing becomes a decree with a discontent cost. |
| Pit fire "warm radius" as a boolean, and `houseWarm` | Binary. Wall blocking exists but no heat balance, so fuel type, stove and envelope don't matter. | Zone thermal model (§1.8), fuel table (§1.9), radiant falloff outdoors (§1.2). The existing ray-cast blocking is reused for radiation. |
| Health drain −2.2/h in a "cold house" | Not tied to clothing, wetness, labour or wind. | Core temperature ODE with the affliction FSM (§1.4, §1.7). |
| `fuel` per grate and `burnRate(season, night)` | Wood is wood. | Moisture-dependent LHV, seasoning lots, PM, CO and creosote. Burning green wood is a legitimate choice with three distinct costs. |
| Food resources as plain counts | No spoilage, so hoarding is free. | Lots with first-order kinetics, cold stores and thaw rot (§3.1–3.3). |
| Farms: flat yield × irrigation | Infinite fertility. | N–P–O with rotation and fallow (§3.5); nightsoil couples the privy to the field and to disease. |
| Tools: `tools` resource doubling earthworks | No wear. | Per-tool sharpness and fatigue with cold embrittlement (§3.6). |
| Adventure: 6 slots, 12 h ration, 2 h torch, 90-minute lost timer | Timer deaths feel arbitrary. | Mass-based carry, Pandolf energy, navigation drift and a physical death by exposure (§4). |
| Walls: HP pool per tile (`wallMeta`) | Hostiles hit whatever is nearest. | Structural graph and cascade (§5.5); leverage-seeking, kill-box-aware pathfinding with a death-memory field (§5.6). |
| `happy` / `mood` | Mood decays and recovers too readily, with no failure states. | Sanity, Hope, Discontent, factions, the collapse FSM and irreversible decrees (§6). |

**Counter-cost cycle.** No dominant strategy should exist. Each counter must feed a different threat channel:

| Threat | Counter | The counter's cost feeds… |
|---|---|---|
| Cold | more fuel | canopy + smoke → K, I; heat leak → Wr |
| Cold | better envelope (turf, stone) | quarrying acoustic → B; turf roof snow load → collapse |
| Kinetic breachers | deep footings, strapped joints, stone | quarrying → B; iron → bog-iron node wake-up |
| Burrowers | moats, flagstone floors, listening posts | digging acoustic → B (short-term); moats raise RH → spoilage |
| Weather-riders | lights, night watch | torches → smoke; labour at night → fatigue, cold |
| Infiltrators | sealed jars, smokehouse, lime | smoke → I (partly self-defeating), K; clay-firing kilns → smoke |
| Spoilage | smoking and salting | wood + smoke; salt node wake-up; thirst → water hauling in cold |
| Scurvy | fresh greens in winter | a heated greenhouse (fuel) or expeditions (§4) |

**Migration of saves** (`migrate()`):

- Villagers get default T_c 37, W 0, E_g 1500, F 12, V 1200, S = happy.
- Resources are converted to single lots with q = 1 and MC 0.2 (wood).
- Structures get material presets from their grade.
- Aggro starts at A_hot = 0 and A_scar = 2·days, so old towns inherit a scar proportional to their age.

**Implementation phases** (each ships behind a flag with its own headless check):

1. Weather + per-agent thermal/metabolic + affliction FSM (§1.1–1.7). Replaces hunger/health.
2. Zones, fuels, CO, seasoning (§1.8–1.9).
3. Stimulus ledger, aggro, director (§2). Replaces `raidChance`/`scheduleRaid`.
4. Spoilage lots and preservation (§3.1–3.4).
5. Soil and tools (§3.5–3.6).
6. Expedition physics (§4). Replaces the fixed timers in `wilds.ts`.
7. Structural graph, collapse, breach pathfinding (§5).
8. Psychology, factions, decrees (§6).

---

## 10. Balance Verification Harness

These are golden scenarios for `scripts/town-features-check.ts`. Each must fall inside its band. Bands are ±15% unless stated.

| # | Scenario | Expected |
|---|---|---|
| T1 | 0.5 clo, dry, standing, −20 °C, 8 m/s, from 37 °C, E_g 1500, cardiac hazard off | T_c < 35 at 25–35 min; < 32 at 115–150 min; ≤ 24 at 3.5–4.3 h |
| T2 | Same as T1 with W = 1 | < 32 at 60–80 min; ≤ 24 at 2.1–2.7 h |
| T3 | 2.5 clo kept on, moderate work, walking, −10 °C, 3 m/s, 4 h | T_c 36.9–37.7; W rises 0.05–0.20 (sweat). With the strip-a-layer rule the clothes stay drier |
| T4 | Bare hand, −10 °C, 3 m/s, T_c held at 35.5 | T_x ≈ −3 ± 1 °C; frostbite II within 60–80 min |
| Z1 | 60 m² log, thatch, chimney, −10 °C, 3 m/s, hold 10 °C | oak 100–130 kg/game day |
| Z2 | Same with masonry stove | 30–40 kg/game day |
| Z3 | 1 kg/h charcoal brazier, sealed 162 m³, ACH 1 | CO > 800 ppm within 3 h; sleepers dead by 8 h |
| F1 | Green wood all winter, chimney | K_c 4.5–6.5 kg; ≥ 1 chimney fire in 15–30 seeds out of 50 |
| S1 | Fresh meat at 20 °C | q < 0.6 in 3–5 game hours; in a root cellar (5 °C), 10–16 h |
| S2 | Potato in a root cellar | edible more than 20 game days |
| S3 | Winter cache through 2 thaw regimes | q drop ≥ 0.08 and kMul ≥ 1.69 |
| A1 | Idle 12-person town with one manned tower, 20 days (or until it falls) | A_scar + A_floor never falls and A_Σ ends higher than it began; ≥ 1 wave per 2 days after day 6 |
| A2 | Two identical towns, one mining 2 extra miners | B-channel waves ≥ 2× more frequent |
| A3 | Director after a 30% casualty wave | next wave Π ratio ρ drops ≥ 0.15, then recovers above the pre-loss level within 5 days |
| X1 | Knight, 25 kg, grass, 1.2 m/s, 8 h march | M_march 350–400 W; 3600–4800 kcal/day |
| X2 | Blizzard march of 1 km without landmarks | P(lost) ≥ 0.7 over 100 seeds |
| X3 | Bog-iron node, 40 kg/day extraction | STIRRING by day 2; AWAKENED by day 4–6 |
| B1 | Turf-roof log house, 0.8 m settled snow, dry ground | no failure; at thaw (φ 0.35), first node failure and cascade ≥ 30% |
| B2 | Kinetic wave from the north-west vs a granary in a stout wall ring: the west gate covered by two towers (the kill-box), one thin stretch on the north | ≥ 70% of runs break the thin wall |
| P1 | 5 unburied corpses beside the hall for 2 days | Hope 8–30 lower than a control town (the rot alone costs 10; the minds that break cost the rest); ≥ 1 minor break over 40 towns |
| P2 | "Emergency protein" decree | Faith-faction ultimatum within 24 h if Faith > 30% of population |
| G1 | Full scripted run (`town:check`, hard mode; `TOWN_SEED` picks the map) | collapse (sack, deposition or abandonment) between day 18 and day 45 in at least 80% of seeds. As built: 7 of 8 seeds, falling on days 19–24; seed 5 is abandoned on day 14 |

The design is correct when G1 holds across seeds. The player can move the collapse date, but cannot remove it.

---

## 11. As built: departures from the numbers above

Building and balancing the systems against §10 changed some numbers and rules. Each change is listed here with its reason. Where this section and an earlier one disagree, this section describes the code.

All eight phases of §9 shipped together and are always on: there are no feature flags. Older saves migrate on load (`initSurvival` in `survival.ts`) and inherit an aggro scar of half a point per channel per day of age.

### Body (§1)

- **A meal is 1100 kcal**, not 800. A hearty bowl of pottage and bread keeps the old economy's roughly three meals a day close to a real 3,400 kcal burn. Uncooked raw food is eaten at its own kcal per kilo.
- **Bedding.** Asleep in bed adds +1.5 clo. Without it every sleeper in an unheated room chilled, which no village ever did.
- **Drying.** Outdoors in dry air, clothes dry at 0.0005 a minute (not 0.0015), and they don't dry at all while the body is sweating into them. Otherwise sweat never accumulated (T3).
- **Strip a layer.** At moderate work or above with the core over 37.1 °C, clothing drops by 0.8 clo. Sensible labourers do this, and it is the counter to sweat-soaking.
- **Fatigue.** Twelve hours of heavy work reach exhaustion, not eight. Resting awake recovers 1/16 an hour. At the original rate, fatigue capped every worker's output at 40% within one shift.
- **Workplaces run 24 hours on shift averages.** A building's hourly output uses each worker's productivity (averaged over recent shifts) × their attendance, not the last minute's value.
- **Starvation.** Lean-tissue loss kills at 18 kg, not 8. At 8, a knight marching without food wasted away inside a day. Real starvation takes weeks at rest and days on the march, and 18 kg gives that.
- **Glycogen and marching.** Marching power is capped at (0.35 + 0.65·min(1, E_g/500)) of the budget. An empty store will not drive a hard march, and that is what lets the cold kill a lost, starving hero.
- **Winter water.** Snow is melted for water (paid in fuel) only in winter. Before that fix, autumn frosts killed people of thirst beside an unfrozen river.

### Shelter and fuel (§1.8–1.9)

- **No fire in empty rooms.** A zone with nobody in it is not heated, so a room left all day is cold when people come home. Banking every empty building at 4 °C burned more wood than the homes did.
- **Masonry stove control.** The stove is a setpoint controller: it burns to bring its mass to the temperature at which it gives out what the room needs, over an hour. As built: 35 kg of oak a day (Z2), with the room held at 10 °C.
- **Chimney fires:** λ = 4·10⁻⁵·exp(K_c) an hour. A green-wood winter builds about 5.8 kg of creosote, and 21 of 50 winters see a fire (F1).
- **Wood by moisture.** Green wood's smoke, CO and creosote are interpolated from seasoned oak's by moisture content, so one lumped wood stock with a moisture value stands in for lots. New wood arrives green (0.5) and seasons toward 0.18 under a storehouse roof, or 0.25 in the open.
- **Fuel units.** One unit of wood, coal, peat or charcoal is 10 kg.

### The director (§2)

- **Food weights:** 0.02 (B) and 0.05 (I) per tonne held per hour, not 0.15 and 0.30. At the original weights the larder alone outweighed every other stimulus.
- **ρ's aggro term** is 0.05·min(8, A_Σ/A_ref), not 0.10. With 0.10, waves matched a town's whole strength by day 8.
- **Lanchester, done properly.** Defence is (Σ dps) × (Σ hp that can absorb blows), local to the target:
  - guards count if their post's outer circle covers the target;
  - towers and the hall add their damage only if their range reaches the target's middle;
  - only the objective's own hit points soak.

  A wave of n identical units is n² as strong as one. The roster adds a unit only while the larger wave still fits the aim. The level steps down until one unit fits.
- **The purse.**
  - The next trigger is the purse left after a wave, plus 0.8–1.6 × a day and a half of budget.
  - Unspent purse makes the next wave up to 50% stronger. Without this, the leftover purse fired a small wave every twelve hours.
- **Lair bands answer to the director.** A roaming band strikes only if the purse can pay 12·L^1.5·count. Against a defended building it also holds back while it would exceed 1.5·ρ times the local defence; undefended buildings are always prey.
- **Pillage and go.** When the wave's objective falls, every raider withdraws (the design's PILLAGE → RETREAT). Previously they went on building by building to the hall.
- **Burrowers raid stores.** They make for storehouses, the hall or the kitchen. They surface, drag down 20 units of food a level (grain and meals first) and dig back down, leaving the building standing.
- **Spore swarms** cost a whole trigger's worth each. Dose = min(0.5, 0.15 · spend / B_day). Previously each cost almost nothing and fired every twelve hours.
- **Blizzard stalkers.** Hourly hazard λ = 0.02·(A_Wr/A_ref)·U, where U = (1/(1 + allies)) · max(0, 37.5 − T_c) · (1 − lit).

### Stores and soil (§3)

- **Two-lot spoilage.** Each food is a fresh and a spoiled pool: fresh → spoiled → rotten, each at rate k. This is the quality bands of §3.1 in closed form. Kitchens cook the spoiled share first, and meals carry its taint and vitamin C (half lost in the pot).
- **Stored meals** (pottage, bread) decay at k₂₀ = 0.6 a game day. The 3.9 in §3.1 is for a hot meal left out.
- **Preservation.**
  - Built: salt-curing meat and smoking fish (refinery recipes), and the ice house cooling the stores to 2 °C while it has ice.
  - Not built yet: pickling, silage, drying.
- **Compost.** 15 person-days of nightsoil make one unit. On a hungry field (N < 8) a unit adds 180/area g N, 25/area g P and 1.8/area % O per m². Lab fertiliser adds +3 N and +1 P.

### Expeditions (§4)

- **Map scale.** In the fog-country one tile stands for 0.72 km of walking, so the map's travel times stay what they were.
- **Carry capacity:** 30 kg on foot, 90 kg for a mounted knight (the horse carries).
- **Landmarks** that give a navigation fix: the town's sight, water, and lairs within the current sight range.

### Frames and breaches (§5)

- **Posts** stand at every perimeter tile (2 m), not every 4 m. This matches timber-framed post spacing and puts the §5.3 worked example at a 16.5 kN load.
- **Padstones** are 0.2 m² (20 kN dry). Stone-walled buildings default to trench footings.
- **Upper floors** add 2 kPa for two-storey homes.
- **Repairs.** Failed posts are shored up once a day from the wood store (2 wood each, back to 60%). Damaged posts recover 2% a day while Hope is at least 50.
- **Gates** stand open to monsters, as they always did in combat. Only walls cost breaking time.
- **Tower threat** costs 60 seconds per whole group's hit points of expected damage.
- **Breach fields** are cached per target, and rebuilt when a wall falls or every five seconds of fighting.

### Minds (§6)

- **Grief.** A death costs housemates 15 sanity and everyone else 3. Houses hold unrelated people, and a full 30 to every housemate set off murder cascades.
- **Unburied bodies** cost sanity by proximity (§6.1), not on arrival.
- **Abandonment.** Hope at 5 or below for 72 hours ends the run (fall cause "abandoned"). Refugees no longer come to a town with Hope under 10. Before this, dead towns lingered for weeks as refugees arrived to die.
- **Strikes** end with hysteresis: the strike clock resets when the faction's discontent falls below 60.
- **Emergency protein** brings an immediate Faith ultimatum if Faith is over 30% of the town.

### Known carry-over

- The town hall does not repair between raids. This is existing behaviour, kept unchanged.
