---
name: remote
description: |
  Expose local dev apps to the internet via cloudflared quick tunnels for client demos.
  Use when the user says "remote", "tunnel", "expose", "share", "demo", "publish locally",
  "give me a URL", "show client", or wants to share their local dev environment.
  Commands: up, close, restart, list, status, url, open, logs, setup.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# /remote — Demo Tunnel Manager

Shares local dev environments with clients via cloudflared quick tunnels.
Zero cloudflare account needed — just the binary.

State:  `~/.remote-boy/tunnels.json`
Config: `~/.remote-boy/config.json`

---

## Step 0 — Parse command

Read the first word after `/remote`:

| Arg | Go to |
|---|---|
| (none) | **Default** |
| `up` | **up** |
| `close` or `down` | **close** |
| `restart` | **restart** |
| `list` | **list** |
| `status` | **status** |
| `url` | **url** |
| `open` | **open** |
| `logs` | **logs** |
| `setup` | **setup** |
| anything else | print usage and stop |

Second word (if present) is an explicit project name override.

---

## Step 1 — Ensure state files

Run before every command:

```bash
mkdir -p ~/.remote-boy
[ -f ~/.remote-boy/tunnels.json ] || echo '{"version":1,"active":{}}' > ~/.remote-boy/tunnels.json
[ -f ~/.remote-boy/config.json ]  || echo '{}' > ~/.remote-boy/config.json
```

---

## Resolve project

```bash
PROJECT=""
if [ -f ~/.claude/ports.json ]; then
  PROJECT=$(jq -r --arg p "$(pwd)" \
    '.allocations | to_entries[] | select(.value.path == $p) | .key' \
    ~/.claude/ports.json 2>/dev/null | head -1)
fi
[ -z "$PROJECT" ] && PROJECT=$(basename "$(pwd)")
```

---

## Resolve port

```bash
PORT=""
[ -n "$PROJECT" ] && [ -f ~/.claude/ports.json ] && \
  PORT=$(jq -r --arg p "$PROJECT" '.allocations[$p].ports.frontend // empty' ~/.claude/ports.json 2>/dev/null)
[ -z "$PORT" ] && [ -f .claude/docker.json ] && \
  PORT=$(jq -r '.services.frontend.port // empty' .claude/docker.json 2>/dev/null)
```

---

## Resolve credentials

Check in order — use first match:

1. `credentials_file` in `~/.remote-boy/config.json` → grep that file for `email:`, `password:`, `user:`, `pass:`, `url:` (case-insensitive, first match per key)
2. `.env` in current dir → look for `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_URL`
3. Nothing → skip credentials block silently

Display email and URL in plain text. Mask password as `••••••` unless `--reveal` was passed.

---

## Default

Show smart status for the current project, then global summary.

1. Resolve project
2. Read `~/.remote-boy/tunnels.json`, check `.active[$PROJECT]`
3. If entry exists: verify PID with `kill -0 $PID 2>/dev/null`
   - Alive → show RUNNING block
   - Dead → remove stale entry, show STALE warning
4. Count remaining entries in `.active` for the "other tunnels" line

Output when tunnel is RUNNING:
```
remote-boy

  Project:  <PROJECT>
  Status:   RUNNING
  URL:      https://xxxx.trycloudflare.com
  Uptime:   2h 14m

  Next steps:
    /remote close      stop this tunnel
    /remote restart    bounce (URL will change)
    /remote url        just the URL, no decoration

──────────────────────────────────────────────
Other active tunnels: 2   (/remote list to see all)
Commands: up · close · restart · list · status · url · open · logs · setup
```

Output when NO tunnel for current project:
```
remote-boy

  Project:  <PROJECT>
  Status:   no active tunnel

  Next steps:
    /remote up         start a tunnel and get a public URL
    /remote setup      first-time setup (install cloudflared, configure credentials)

──────────────────────────────────────────────
Other active tunnels: 2   (/remote list to see all)
Commands: up · close · restart · list · status · url · open · logs · setup
```

---

## Command: setup

First-time wizard. Run this before anything else on a new machine.

### 1. Check cloudflared

```bash
which cloudflared
```

If missing:
- macOS: `brew install cloudflared`
- Linux: download from https://github.com/cloudflare/cloudflared/releases (show the user the direct link, do not auto-run curl | bash)

### 2. Ask about credentials source

Ask the user:
```
Where do you keep project credentials?
  1) .env file in each project  (auto-detected, no config needed)
  2) A file path  (e.g. Obsidian note, secrets file)
  3) Skip — show URL only, no credentials
```

If option 2: ask for the full file path, then write it:
```bash
jq --arg path "<USER_PATH>" '.credentials_file = $path' \
  ~/.remote-boy/config.json > /tmp/rb.json && mv /tmp/rb.json ~/.remote-boy/config.json
```

### 3. Confirm

```
Setup complete.

  cloudflared:   ✓ installed
  credentials:   <source>

Run /remote up in any project to get a public URL.
```

---

## Command: up

Start a tunnel for the current project.

### 1. Preflight

```bash
# cloudflared installed?
which cloudflared 2>/dev/null || { echo "cloudflared not found. Run /remote setup"; exit 1; }

# port resolved?
# (run Resolve port section above)
[ -z "$PORT" ] && { echo "Cannot resolve port. Run /ports allocate or add a port to .claude/docker.json"; exit 1; }

# port actually listening?
lsof -iTCP:$PORT -sTCP:LISTEN -t >/dev/null 2>&1 || \
  { echo "Nothing listening on :$PORT — start the dev stack first, then re-run /remote up"; exit 1; }

# already running?
EXISTING_PID=$(jq -r --arg p "$PROJECT" '.active[$p].pid // empty' ~/.remote-boy/tunnels.json)
if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
  EXISTING_URL=$(jq -r --arg p "$PROJECT" '.active[$p].public_url' ~/.remote-boy/tunnels.json)
  echo "Already running: $EXISTING_URL"
  exit 0
fi
```

### 2. Start tunnel

```bash
LOG=~/.remote-boy/$PROJECT.log
# truncate log if over 1MB
[ -f "$LOG" ] && [ $(wc -c < "$LOG") -gt 1048576 ] && > "$LOG"
nohup cloudflared tunnel --url http://localhost:$PORT > "$LOG" 2>&1 < /dev/null &
PID=$!
disown $PID 2>/dev/null || true
```

### 3. Poll for URL (15 second timeout)

```bash
URL=""
for i in $(seq 1 30); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1)
  [ -n "$URL" ] && break
  sleep 0.5
done
if [ -z "$URL" ]; then
  kill $PID 2>/dev/null
  echo "Tunnel failed to start. Check $LOG for details."
  exit 1
fi
```

### 4. Write registry entry

```bash
STARTED=$(date -u +%Y-%m-%dT%H:%M:%SZ)
ENTRY=$(jq -n \
  --arg provider "cloudflared-quick" \
  --argjson port "$PORT" \
  --arg url "$URL" \
  --argjson pid "$PID" \
  --arg log "$LOG" \
  --arg started "$STARTED" \
  --arg path "$(pwd)" \
  '{provider:$provider,target_port:$port,public_url:$url,pid:$pid,log_file:$log,started_at:$started,project_path:$path}')
jq --arg p "$PROJECT" --argjson e "$ENTRY" '.active[$p] = $e' \
  ~/.remote-boy/tunnels.json > /tmp/rb.json && mv /tmp/rb.json ~/.remote-boy/tunnels.json
```

### 5. Resolve and display credentials (see Resolve credentials section)

Output:
```
Tunnel is live!

  URL:      https://bright-frost-demo.trycloudflare.com
  Project:  przychodnia_biss
  Port:     4212

  Credentials:
    Email:    admin@example.com
    Password: ••••••  (pass --reveal to show)
    Panel:    /admin

  /remote close    stop when done
  /remote url      just the URL
```

If no credentials found, omit the Credentials block entirely.

---

## Command: close

### With explicit project name or current project has a tunnel:

```bash
PID=$(jq -r --arg p "$PROJECT" '.active[$p].pid // empty' ~/.remote-boy/tunnels.json)
[ -z "$PID" ] && { echo "No active tunnel for $PROJECT"; exit 1; }
kill "$PID" 2>/dev/null || true
jq --arg p "$PROJECT" 'del(.active[$p])' \
  ~/.remote-boy/tunnels.json > /tmp/rb.json && mv /tmp/rb.json ~/.remote-boy/tunnels.json
echo "Closed: $PROJECT"
```

### With `--all`:

```bash
jq -r '.active | to_entries[] | .value.pid' ~/.remote-boy/tunnels.json | \
  xargs -I{} kill {} 2>/dev/null || true
echo '{"version":1,"active":{}}' > ~/.remote-boy/tunnels.json
echo "All tunnels closed."
```

### No arg, no tunnel for current project:

List all active tunnels as a numbered menu and ask which to close.

---

## Command: restart

1. Run **close** for the project
2. Run **up** for the project
3. After up succeeds, note: "URL changed (quick tunnels always get a new URL on restart)"

---

## Command: list

1. Read all entries from `.active`
2. For each: verify PID with `kill -0`, compute uptime from `started_at`
3. Auto-prune any dead entries (delete from json)
4. Display table:

```
Active tunnels

  Project               URL                                          Uptime   Status
  przychodnia_biss      https://bright-frost-demo.trycloudflare.com  2h 14m   OK
  monkey_concept        https://gentle-moon-abc.trycloudflare.com    45m      OK

2 active  ·  1 stale entry pruned
```

If `.active` is empty: "No active tunnels."

Uptime calculation:
```bash
STARTED=$(jq -r --arg p "$PROJECT" '.active[$p].started_at' ~/.remote-boy/tunnels.json)
SECONDS_UP=$(( $(date +%s) - $(date -d "$STARTED" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$STARTED" +%s) ))
```

---

## Command: status [project]

Deep health check.

1. Resolve project (current dir default, or explicit arg)
2. Read registry entry — if missing: "No tunnel registered for `<PROJECT>`"
3. PID check: `kill -0 $PID 2>/dev/null`
4. URL reachability: `curl -sI "$URL" --max-time 5 -o /dev/null -w "%{http_code}"`
5. Diagnose:
   - `OK` — PID alive, URL reachable
   - `STALE` — PID dead, registry entry still present (offer to prune)
   - `ZOMBIE` — PID alive, URL unreachable (cloudflared running but not serving)
6. Print full entry details (port, pid, log path, started_at)

---

## Command: url

Resolve project. Print only the public URL:

```bash
jq -r --arg p "$PROJECT" \
  '.active[$p].public_url // "No active tunnel for \($p). Run /remote up"' \
  ~/.remote-boy/tunnels.json
```

---

## Command: open

Get URL via url logic, then open in browser:

```bash
URL=$(jq -r --arg p "$PROJECT" '.active[$p].public_url // empty' ~/.remote-boy/tunnels.json)
[ -z "$URL" ] && { echo "No active tunnel. Run /remote up first."; exit 1; }
open "$URL" 2>/dev/null || xdg-open "$URL" 2>/dev/null || echo "Open manually: $URL"
```

---

## Command: logs [project]

```bash
LOG=$(jq -r --arg p "$PROJECT" '.active[$p].log_file // empty' ~/.remote-boy/tunnels.json)
[ -z "$LOG" ] && { echo "No log found for $PROJECT. Run /remote up first."; exit 1; }
tail -f "$LOG"
```

---

## Usage (shown on unknown command)

```
remote-boy — demo tunnel manager

Commands:
  /remote              smart status for current project
  /remote up           start tunnel, get public URL + credentials
  /remote close        stop tunnel (current project, or pick from list)
  /remote close --all  stop all tunnels
  /remote restart      bounce tunnel (URL will change)
  /remote list         all active tunnels across all projects
  /remote status       deep health check
  /remote url          just the URL, pipe-friendly
  /remote open         open tunnel URL in browser
  /remote logs         tail the cloudflared log
  /remote setup        first-time setup wizard
```
