# /remote — Unified Tunnel Lifecycle Skill

**Status:** planning
**Target install path:** `~/.claude/skills/remote/SKILL.md`
**Depends on:** `/ports` (registry), `/dev` (local stack lifecycle)
**Deprecates:** `/publish_local` (aliased to `/remote up`)

---

## Motivation

### Today's pain points

1. **Dead URLs haunt sessions.** Quick tunnels (`*.trycloudflare.com`) rotate on every restart. Nothing tracks "what's the current URL for project X?" so stale hostnames linger in notes, commits, chat history.
2. **`/publish_local` is single-shot.** It prints a URL and exits-or-leaves-running with no way back. No `list`, `stop`, `restart`, `status`.
3. **No cross-project view.** Can't ask "which tunnels are up across all my projects right now?"
4. **One provider only.** Hard-coded to `cloudflared tunnel --url`. No ngrok, no Cloudflare named tunnels (persistent URL), no tailscale funnel, no zrok.
5. **No auth or expiry.** Every quick tunnel is world-readable. Demos leak. No basic-auth overlay, no TTL.
6. **No handoff to `/dev`.** If the stack is down, publish silently fails; if it's up but stale, publish succeeds but serves broken content.
7. **No persistence.** After `/clear`, reboot, or laptop sleep, there's no record that a tunnel ever existed.

### What's already solid (keep it)

- **`/ports`** owns port allocations. `~/.claude/ports.json` is the single source of truth. `/remote` must resolve ports via this registry, never hardcode.
- **`/dev`** owns the local stack lifecycle (up/down/restart/status/logs). `/remote` calls into `/dev` rather than reimplementing.
- **`.claude/docker.json`** per-project defines services and commands. `/remote` reads it for frontend port fallback and to detect API-only projects.

---

## Design

### Storage: `~/.claude/tunnels.json`

Mirror the shape and ergonomics of `ports.json`. One file, hand-editable, scanned at start of every command.

```json
{
  "version": 1,
  "defaults": {
    "provider": "cloudflared-quick"
  },
  "active": {
    "przychodnia_biss": {
      "provider": "cloudflared-quick",
      "target_port": 4212,
      "public_url": "https://mighty-snapshot-contributors-speech.trycloudflare.com",
      "pid": 27180,
      "log_file": "/Users/atlasjedi/.claude/tunnels/przychodnia_biss.log",
      "started_at": "2026-04-21T11:52:12Z",
      "project_path": "/Users/atlasjedi/P/przychodnia_biss"
    }
  },
  "named_tunnels": {
    "przychodnia_biss": {
      "provider": "cloudflared-named",
      "hostname": "dev.nzoz-gardno.pl",
      "tunnel_id": "abc-123-...",
      "config_path": "~/.cloudflared/przychodnia_biss.yml"
    }
  }
}
```

- `active.*` — currently running tunnels. Gets swept by `/remote maintain`.
- `named_tunnels.*` — persistent named-tunnel configs (Cloudflare account required). These survive restarts; `active.*` points at them when running.

### Log directory: `~/.claude/tunnels/`

Per-project log files. Replace ad-hoc `/tmp/<project>_tunnel.log` convention. Survives reboots long enough to debug the last failure.

### Commands

| Command | Behavior |
|---|---|
| `/remote up [project]` | Resolve project (cwd default). Verify `/dev status` → prompt to run `/dev up` if stack down. Look up frontend port from `ports.json`. Start tunnel (provider = per-project default or `--provider` override). Parse public URL from log. Write registry entry. Print URL. |
| `/remote down [project]` | Read registry entry. Kill PID. Remove entry. Report closed URL. |
| `/remote restart [project]` | `down` then `up`. Report whether URL changed (quick tunnels always change; named tunnels don't). |
| `/remote list` | Table of all `active.*` entries across all projects: project, provider, URL, uptime, status. |
| `/remote status [project]` | Liveness + reachability check: `kill -0 pid`, `curl -I public_url`, `curl health_endpoint`. Flag: `STALE` (PID dead, registry entry present), `ZOMBIE` (PID alive, URL unreachable), `OK`. |
| `/remote url [project]` | Print just the URL. No decoration. Script-friendly (`$(/remote url)`). |
| `/remote logs [project]` | `tail -f` on the tunnel log. |
| `/remote maintain` | Sweep all active entries. Reap dead PIDs. Warn on zombies. With `--auto-restart`, restart dead tunnels. Safe to run via `/schedule`. |
| `/remote provider <name> [project]` | Set per-project default provider. Persists in `tunnels.json → defaults.per_project.*`. |
| `/remote promote [project]` | Convert quick-tunnel to named-tunnel flow: walk user through `cloudflared tunnel login`, `tunnel create`, write `config.yml`, update DNS, move entry from `active` → `named_tunnels`. |
| `/remote share [project] --auth user:pass --expires 2h` | Wrap tunnel with a lightweight auth proxy (caddy one-liner or cloudflared access policy). Auto-expire via background sleep+kill. |

### Provider matrix

| Provider | Flag | Persistent URL? | Auth? | Setup cost |
|---|---|---|---|---|
| `cloudflared-quick` (default) | `--provider cloudflared-quick` | No (rotates each start) | None | Zero — just `cloudflared` binary |
| `cloudflared-named` | `--provider cloudflared-named` | Yes | Cloudflare Access (optional) | One-time: Cloudflare account + domain |
| `ngrok` | `--provider ngrok` | Paid only | Via `--basic-auth` flag | Zero — just `ngrok` binary (`~/.ngrok2/ngrok.yml` for auth token) |
| `tailscale-funnel` | `--provider tailscale-funnel` | Yes (tailnet hostname) | Tailnet ACL | Requires tailscale login |
| `zrok` | `--provider zrok` | Yes | Via zrok share policy | Requires zrok account |

`/remote` abstracts the start command, URL parser, and lifecycle semantics per provider. Each gets a small provider module (bash functions or a script under `scripts/providers/<name>.sh`).

### Integration points

- **`/ports status`** — extend to show a "Remote" column reading `tunnels.json`. One line change: join on project name.
- **`/dev up --remote`** — composed flag. Runs `/dev up` then `/remote up` in sequence.
- **`/manifest`** — include current remote URL in project manifest output.
- **`/publish_local`** — replace body with single line: "Use `/remote up` instead." Keep as alias for muscle memory.
- **`/schedule`** — document "schedule `/remote maintain --auto-restart` every 10 min" as a recipe for laptop-sleep recovery.

---

## Scope for v1

**In scope (must have):**
- [ ] `up` / `down` / `restart` / `list` / `status` / `url` / `logs`
- [ ] `cloudflared-quick` provider (only)
- [ ] `tunnels.json` registry with PID/URL/timestamp tracking
- [ ] Auto-resolve frontend port via `ports.json`
- [ ] Health preflight: refuse to tunnel if `/dev status` says stack is down
- [ ] Log directory at `~/.claude/tunnels/`

**Out of scope for v1 (design for, don't build):**
- `ngrok`, `tailscale-funnel`, `zrok` providers — stub in the provider dispatcher, implement later
- `promote` (quick → named tunnel) — document the manual flow, automate in v2
- `share --auth --expires` — mention in docs, implement in v2
- `maintain --auto-restart` — ship `maintain` as diagnostic-only first

---

## Open questions

1. **Should `/remote up` auto-run `/dev up` if stack is down?** Current proposal: no, prompt the user. Avoids unexpected builds during a demo.
2. **Where does the tunnel process actually live?** Option A: foreground process Claude tracks via background-task ID. Option B: proper daemon (launchd on macOS). Start with A, migrate to B if reliability is an issue.
3. **How do we handle multi-port projects?** (e.g., frontend + admin UI on different ports — should `up` tunnel both, or require explicit `--port`?) v1: frontend only, add `--port` override flag.
4. **Do we need `/remote list --all-machines`?** If multiple laptops share the Cloudflare account, named tunnels may be live on a different box. Defer — query Cloudflare API if/when needed.
5. **What about JSON output mode?** `/remote list --json` for scripts. Probably cheap to add in v1.

---

## File layout (when built)

```
skills/remote/
  PLAN.md                    # this file
  SKILL.md                   # skill frontmatter + command dispatch
  references/
    providers.md             # provider comparison, flags, quirks
    tunnels-json-schema.md   # registry schema reference
  scripts/
    start-cloudflared.sh     # wrapper that parses URL from cloudflared output
    start-ngrok.sh
    sweep.sh                 # maintain logic
```

---

## Success criteria

A user should be able to:

1. Run `/remote up` in any project with a registered port allocation → get a public URL in under 10 seconds.
2. Run `/remote list` from anywhere → see every active tunnel with its URL.
3. Run `/remote status` on a project where the tunnel died silently → get a diagnosis, not an empty response.
4. Switch providers without editing config files: `/remote provider ngrok przychodnia_biss && /remote restart`.
5. Find yesterday's tunnel log without grepping `/tmp`: `/remote logs przychodnia_biss`.

---

## Next steps (resume here)

1. Write `SKILL.md` with frontmatter (`name`, `description`, `allowed-tools`) matching the style of `~/.claude/skills/dev/SKILL.md`.
2. Implement command dispatch: parse first arg, route to section.
3. Build the `cloudflared-quick` provider module first — it's the only one exercised in v1.
4. Write `tunnels.json` read/write helpers (jq one-liners are fine; no need for a scripting language).
5. Wire the preflight: read `ports.json`, check `/dev status` output, refuse on failure.
6. Test end-to-end against `przychodnia_biss`.
7. Symlink `skills/remote/` into `~/.claude/skills/remote/` and dogfood across the other projects in `ports.json`.
