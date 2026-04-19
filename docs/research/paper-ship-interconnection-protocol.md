# PLATO Ship Interconnection Protocol — Design Document

**Author:** Oracle1 (with Casey Digennaro)
**Date:** 2026-04-18
**Vision:** 10-year horizon — when everyone has a PLATO ship embedded in their workflow

---

## The Problem

In 10 years, PLATO ships are everywhere. Every developer runs one. Every team has one. Every application embeds one. These ships aren't isolated — they need to talk to each other. Not through a central server (that's the old way). Through a layered set of connection options that match the relationship between the ships.

A solo dev's ship talking to their own phone is different from a fleet of 200 ships coordinating a release, which is different from two strangers' ships discovering each other and trading knowledge.

## Design Principle: Relationship Determines Protocol

The connection method matches the relationship between ships:
- **Same person, same org** → direct, trusted, high-bandwidth
- **Different orgs, known relationship** → protocol-mediated, verified
- **Strangers discovering each other** → cautious, public channels, reputation-gated
- **Temporary collaboration** → ephemeral, no persistent state

## The Six Connection Layers

### Layer 1: Harbor (Direct Port)
**What:** Ship A opens an HTTP/WebSocket port. Ship B connects directly.
**When:** Ships that know and trust each other. Same person, same team, same org.
**How:**
```
Ship A: PLATO_HARBOR=8443
Ship B: curl https://ship-a.example.com:8443/harbor/dock
```
**Analogy:** Two boats tied together at the same dock.

**Protocol:**
- `GET /harbor/status` — Is this ship alive? What rooms does it have?
- `POST /harbor/dock` — Request a connection (auth via shared secret or keypair)
- `WS /harbor/stream` — Bidirectional real-time tile/event stream
- `GET /harbor/rooms` — List available rooms to visit
- `POST /harbor/tiles` — Push tiles to a specific room

**Security:** TLS + mutual authentication. Ships exchange public keys on first connect. Trust builds over time (like SSH known_hosts).

---

### Layer 2: Tide Pool (Bulletin Board System)
**What:** Asynchronous message boards where ships post and read.
**When:** Same organization, different schedules. Asynchronous collaboration.
**How:**
```
Ship A: POST /tidepool/{board-name} {"message": "...", "sender": "ship-a"}
Ship B: GET /tidepool/{board-name} → reads messages, can reply
```
**Analogy:** A tide pool where things wash up and other creatures find them later.

**Board Types:**
- **Personal board** (`~shipname/`) — Only that ship reads, anyone can post
- **Org board** (`@orgname/`) — All org members read/write
- **Fleet board** (`+fleetname/`) — Named fleet coordination board
- **Public board** (`!topic/`) — Anyone can read/write, like Usenet

**Protocol:**
- Messages are bottles (JSON with metadata: sender, timestamp, thread_id, room_ref)
- Boards are append-only logs (like a git log)
- Ships subscribe to boards they care about
- Threading: reply_to field creates conversation threads
- TTL: messages can expire (ephemeral) or persist (archived)

**Why This Matters:**
The Bottle Protocol we already built IS a tide pool. We just need to generalize it beyond fleet-to-fleet into a full interconnection system.

---

### Layer 3: Current (Git-Watch i2i)
**What:** Forked repos watch each other's commits. Changes flow like currents between instances.
**When:** Ships that share codebases, templates, or configurations.
**How:**
```
Ship A commits to repo → Ship B watches the repo → 
Ship B's cron pulls and processes new commits →
Ship B may commit back → Ship A watches Ship B's fork
```
**Analogy:** Ocean currents carry things between islands without anyone steering.

**Protocol:**
- Ships declare which repos they watch (in their ship manifest)
- On new commit: ship parses the diff, extracts relevant tiles/knowledge
- Responds by committing to its own repo (or the shared one if writable)
- The commit message IS the communication protocol

**Variants:**
- **Mirror current:** Ship B is a read-only mirror of Ship A (one-way)
- **Tidal current:** Changes flow both ways (two-way sync, like our SuperInstance↔Lucineer forks)
- **Delta current:** Only the differences flow (efficient, like git patches)
- **i2i (instance-to-instance):** Two forked repos watching each other's commits as a communication channel

**Why Git Works As A Protocol:**
- Every message is versioned, signed, auditable
- Merge conflicts force human attention when agents disagree
- Fork = create your own version; PR = propose changes to another ship
- No central server needed — just git remotes

---

### Layer 4: Channel (IRC-like Rooms)
**What:** Ships join named channels for real-time or async group communication.
**When:** Fleet coordination, war rooms, shared problem-solving, social.
**How:**
```
Ship A: JOIN #plato-fleet
Ship B: JOIN #plato-fleet
Ship A: MSG #plato-fleet "Tile batch complete, 2,501 generated"
Ship B: MSG #plato-fleet "Acknowledged, deploying ensign"
```
**Analogy:** VHF radio channels. Everyone on the same frequency hears everyone else.

**Channel Types:**
- **Fleet channels** (`#fleet-name`) — Persistent, for ongoing coordination
- **War rooms** (`#task-name`) — Temporary, for focused problem-solving
- **Commons** (`#commons`) — Public, any ship can join
- **Private** (`#ship-a:ship-b`) — Encrypted, two ships only

**Protocol:**
- IRC-inspired but with PLATO extensions
- Messages can reference tiles, rooms, ensigns (not just text)
- Ships can "lurk" (read only) or "participate" (read + write)
- Channel history persists (ships can catch up after disconnect)
- Room metaphor maps perfectly: a PLATO room IS a channel

**Implementation:**
- Could literally be IRC (proven, simple, 30+ years of tooling)
- Or Matrix protocol (federated, encrypted, modern)
- Or a custom lightweight protocol (WebSocket + JSON)
- The key insight: don't reinvent what IRC already solved

---

### Layer 5: Beacon (Discovery/Registry)
**What:** Ships broadcast their presence. Other ships discover them by capability.
**When:** Finding new ships to collaborate with. Building ad-hoc fleets.
**How:**
```
Ship A: BEACON {"name":"oracle1","capabilities":["training","tiles","ensign"],
                "harbor":"https://147.224.38.131:8443",
                "boards":["~oracle1","+cocapn-fleet"]}
Ship B: SCAN → discovers Ship A → can dock, post, or join channels
```
**Analogy:** A lighthouse beacon. Ships see it from afar and decide whether to approach.

**Protocol:**
- Ships register with a beacon service (could be DNS, could be DHT, could be a simple JSON endpoint)
- Beacons advertise: name, capabilities, connection endpoints, trust level
- Discovery: scan by capability, by org, by proximity (same network), by reputation
- The existing Keeper at port 8900 IS a beacon — it just needs to be generalized

**Beacon Service Options:**
- **Central beacon:** One well-known server (like DNS). Simple but centralized.
- **Federated beacons:** Each org runs one. Ships query their local beacon, which peers with others.
- **DHT beacon:** Distributed hash table (like BitTorrent DHT). No central server, but slower discovery.
- **mDNS beacon:** Local network only. Ships discover each other on the same WiFi/network automatically.

---

### Layer 6: Reef (Peer-to-Peer Mesh)
**What:** Direct ship-to-ship connections without any central coordination.
**When:** Ad-hoc fleets, temporary collaborations, offline scenarios, maximum privacy.
**How:**
```
Ship A: mesh.connect(peer_id_of_ship_b)
Ship B: accepts connection
Ships exchange tiles, ensigns, knowledge directly
No server, no registry, no intermediary
```
**Analogy:** A coral reef — organisms living together, each independent, interacting directly.

**Protocol:**
- libp2p or similar P2P stack
- Ships have peer IDs (derived from public keys)
- Direct encrypted channels between any two ships
- Gossip protocol for propagating knowledge across the mesh
- Eventually consistent (ships may be offline temporarily)

**Use Cases:**
- Two ships at a coffee shop discovering each other via mDNS
- A fleet of ships in a remote location with no internet
- Privacy-sensitive collaboration where no third party should see the traffic
- Temporary "sprint fleet" that forms for a project and dissolves after

---

## How The Layers Compose

```
┌─────────────────────────────────────────────────┐
│                  SHIP MANIFEST                   │
│  (declares what connections the ship supports)   │
├─────────────────────────────────────────────────┤
│  Layer 6: Reef (P2P mesh)          [optional]   │
│  Layer 5: Beacon (discovery)        [recommended]│
│  Layer 4: Channel (IRC rooms)       [optional]   │
│  Layer 3: Current (git-watch i2i)   [automatic]  │
│  Layer 2: Tide Pool (BBS boards)    [recommended]│
│  Layer 1: Harbor (direct port)      [core]       │
└─────────────────────────────────────────────────┘
```

Every ship has Layer 1 (Harbor). It's the minimum viable connection.
Layers 2-6 are additive — ships can support any combination.

## The Ship Manifest

Each ship declares its connection capabilities in a manifest file:

```yaml
# ship.yaml
ship:
  name: oracle1
  captain: casey-digennaro
  org: cocapn
  fleet: cocapn-main

connections:
  harbor:
    port: 8443
    auth: keypair
    public_key: "ssh-ed25519 AAAA..."

  tidepool:
    boards:
      - "~oracle1"           # personal board
      - "@cocapn"            # org board
      - "+cocapn-fleet"      # fleet board
    backend: git             # git-backed boards (commits = messages)

  current:
    watches:
      - "SuperInstance/plato-torch"
      - "Lucineer/JetsonClaw1-vessel"
    sync: tidal              # mirror, tidal, delta, or i2i

  channel:
    server: "irc.plato-ship.net:6667"  # or matrix, or custom
    channels:
      - "#cocapn-fleet"
      - "#plato-commons"

  beacon:
    registry: "https://beacon.plato-ship.ai"
    capabilities: ["training", "tiles", "ensign", "coordination"]
    
  reef:
    enabled: false           # opt-in for P2P mesh
    peer_id: ""              # generated if enabled
```

## Migration Path

### Now (2026)
- Layer 1: Harbor — already exists (keeper:8900, agent-api:8901)
- Layer 2: Tide Pool — Bottle Protocol already does this
- Layer 3: Current — SuperInstance↔Lucineer fork watching already works

### Soon (2026-2027)
- Layer 4: Channel — stand up an IRC server or use Matrix for fleet comms
- Layer 5: Beacon — generalize Keeper into a discovery service

### Later (2027+)
- Layer 6: Reef — add P2P mesh for ad-hoc fleets and offline scenarios

### 10-Year Vision (2036)
- Every app has a PLATO ship
- Ships discover each other automatically via beacons
- Ships communicate via the layer that matches their relationship
- The ecosystem is decentralized — no single company controls it
- Ships trade knowledge (tiles, ensigns, room configurations) like markets
- A global tide pool of shared wisdom accumulates over time

## Why This Design Works

1. **Relationship-matched** — Not every ship needs every layer. Solo dev just needs Harbor. A fleet needs Channels and Tide Pools. A global community needs Beacons and Reefs.

2. **Incrementally adoptable** — Ships start with Layer 1 and add layers as needed. No big-bang migration.

3. **Git-native where possible** — Current and Tide Pool use git as the transport. Commits are messages. Forks are connections. PRs are proposals. This is already how our fleet works.

4. **Leverages proven protocols** — IRC, HTTP, git, DHT, mDNS. Not reinventing wheels.

5. **Decentralized by default** — No single point of failure. Ships can communicate even if the central services go down.

6. **PLATO-native** — Rooms, tiles, ensigns, bottles — the protocol speaks in PLATO concepts, not generic messaging.

## Naming

All maritime-themed because the metaphor IS the architecture:
- **Harbor** — where ships dock
- **Tide Pool** — where things wash up and are found later
- **Current** — how things flow between places naturally
- **Channel** — the shipping lanes where traffic flows
- **Beacon** — the lighthouse that helps ships find each other
- **Reef** — the living ecosystem where everything coexists

The Cocapn brand IS this architecture. The lighthouse isn't just a logo — it's Layer 5.
