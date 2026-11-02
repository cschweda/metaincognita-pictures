# pictures

A self-hosted, cloud-based digital picture frame for one user. A single Nuxt app serves two audiences:

- **Admin:** log in from a computer or phone to upload and tag photos, pair frames, and change what each frame shows.
- **Frames:** a Raspberry Pi or mini-PC running a full-screen browser. Each frame pairs once with a Roku-style code and then runs on its own.

All logic lives on the server. The frame is a kiosk that shows what it's told, and it keeps running from its local cache if the network drops.

**Status:** in design. There is no application code yet; the next step is Phase 0, the deployable skeleton.

## Stack

Nuxt 4, Nuxt UI v4, TypeScript, and pnpm on Node 22, with SQLite (`better-sqlite3`) and `sharp`. It runs under pm2 behind nginx on a DigitalOcean droplet, at `pictures.metaincognita.com`.

## Documentation

| File | Contents |
|---|---|
| [`docs/00-master-design.md`](docs/00-master-design.md) | Architecture, data model, API, frame client, and phases |
| [`docs/06-security.md`](docs/06-security.md) | Threat model, controls, and the ship checklist |
| [`docs/phase-0-kickoff-prompt.md`](docs/phase-0-kickoff-prompt.md) | Build instructions for Phase 0 |

## Deploying

Run `./rebuild.sh` on the droplet. It pulls `origin/main`, builds beside the live site, backs up SQLite, swaps in the new build, reloads pm2, and checks `/api/health`. A failed build leaves the running site in place.

Setup and droplet instructions will be added here during Phase 0.

## License

[MIT](LICENSE)
