# Destructible environment

**Category:** world · **Seen in:** ep2 2:48–2:53.4 (hero shoots the elevator cables, the cab drops with the grunts inside), ep3 3:03.8–3:05.6 (hero is blasted through a wall, hole left behind), ep2 1:03 (grenade hole through the roof), ep3 3:13 (thrown into the vending machine) · **Confidence:** high

Clips (local only): `clip-1` cables shot, the cab falls, the hero hangs on and climbs · `clip-2` blasted through the wall into the next room.

## What happens on screen
- Specific things in the level can be broken to kill enemies or open routes: **cables, ceilings/roofs, walls**.
- Holes stay (scorch/jagged edges) and become entrances (the boss later flies in through the hole).

## Game translation
- Tag specific props/surfaces `destructible` with a trigger (shot count, explosion, or heavy body impact) and a result (drop the cab, open a hole = new entrance between rooms).
- Not a general destruction system: only scripted points per room, like the show.

## Episode 4 additions (2026-10-27)
Seen in: ep4 1:24.6–1:25.4 (vending machine), 2:28.9–2:30.9 (door). Confidence: medium.
- A grunt thrown into the vending machine **knocks it flat**; it stays on the floor (low cover).
- A door **smashed in** from outside flies into the room and crushes a grunt standing behind it.
- Game: props get a `toppled` state (thrown body ≥ 4 H/s, invented); doors get a scripted `smash` (slab becomes a floor prop, crush on its path).
