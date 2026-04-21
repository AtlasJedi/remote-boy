# remote-boy

Claude Code skill — share local dev environments with clients via cloudflared quick tunnels.

Zero cloudflare account needed. Just install, run `/remote up`, get a URL.

---

## Install

```bash
npm install -g remote-boy
```

Then in any Claude Code session:

```
/remote setup
```

That's it.

---

## Usage

```
/remote              smart status — shows what's running, suggests next steps
/remote up           start tunnel for current project, get public URL + credentials
/remote close        stop tunnel (current project or pick from list)
/remote close --all  stop all tunnels
/remote restart      bounce tunnel (URL will change on quick tunnels)
/remote list         all active tunnels across all projects
/remote status       deep health check (PID alive? URL reachable?)
/remote url          just the URL — pipe-friendly
/remote open         open tunnel URL in browser
/remote logs         tail the cloudflared output
/remote setup        first-time wizard
```

---

## How it works

Uses [cloudflared](https://github.com/cloudflare/cloudflared) quick tunnels — a temporary public HTTPS URL that proxies to a local port. No Cloudflare account, no API token, no signup. The tunnel lives as a background OS process (survives Claude Code session end).

State is stored in `~/.remote-boy/tunnels.json`. Each project gets an entry with its PID, URL, port, and start time. Dead PIDs are pruned automatically on `list` and `status`.

---

## Credentials

`/remote up` optionally shows your app's admin credentials alongside the tunnel URL — handy for handing off to a client.

Resolution order:

1. `--credentials /path/to/file` — point to any text file (Obsidian note, secrets file)
2. `--token value` — inline value
3. `credentials_file` in `~/.remote-boy/config.json`
4. `REMOTE_BOY_CREDENTIALS` env var
5. `.env` in current project (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_URL`)

Configure via `/remote setup` or edit `~/.remote-boy/config.json` directly.

Passwords are masked by default. Pass `--reveal` to show them.

---

## Requirements

- [Claude Code](https://claude.ai/code) CLI
- [cloudflared](https://github.com/cloudflare/cloudflared) binary (`brew install cloudflared` on macOS — `/remote setup` handles this)
- `jq` (`brew install jq`)
- Node.js ≥ 16 (for npm install only)

---

## State files

| Path | Purpose |
|---|---|
| `~/.remote-boy/tunnels.json` | Active tunnel registry |
| `~/.remote-boy/config.json` | Credentials path, provider defaults |
| `~/.remote-boy/<project>.log` | cloudflared output per project |
| `~/.claude/skills/remote/` | Symlink created by postinstall |

---

## Uninstall

```bash
npm uninstall -g remote-boy
```

Or manually:

```bash
remote-boy uninstall
rm -rf ~/.remote-boy   # optional: remove state and config
```

---

## Roadmap

- v1: cloudflared quick tunnels, single project per session
- v2: named tunnels (persistent URL), ngrok provider, `--auth` overlay for password-protected demos
- v3: multi-port projects, `/remote promote` (quick → named)
