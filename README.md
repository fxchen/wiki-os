# WikiOS

WikiOS turns an Obsidian vault into a local web app. It lets you browse notes through a homepage, search, article pages, a graph view, and stats.

Built by [Ansub](http://twitter.com/ansubkhan), co-founder of [Supafast](https://withsupafast.com/?utm_source=github&utm_medium=readme&utm_campaign=wikios) - we build websites for B2B SaaS & AI companies.


<img width="3024" height="1324" alt="CleanShot 2026-04-12 at 21 10 31@2x" src="https://github.com/user-attachments/assets/86ca9f3e-db4b-4a21-96bc-fe18ba346ece" />

## What it does

- Connects to an Obsidian-compatible markdown folder
- Builds a local searchable index
- Gives you a clean web interface for exploring your notes
- Watches the vault for changes and updates the index automatically

## How to get started

Clone and launch:

```bash
git clone https://github.com/Ansub/wiki-os.git wiki-os && cd wiki-os && npm run first-run
```

WikiOS will open in your browser and guide you through choosing a vault. You can also use the bundled demo vault on first run.

## Features

- Homepage with featured notes, recent notes, and people highlights
- Fast local search
- Clean article pages
- Graph view
- Stats view
- Manual reindex support
- Automatic file watching
- Local-first setup with no cloud requirement

### Docker

You can run WikiOS with Docker if you want a simple container setup.

This starts WikiOS with the bundled demo vault:

```bash
docker compose up --build
```

The `docker-compose.yml` file is in the main project folder.

By default, Docker uses the demo notes in `sample-vault/`.

If you want to use your own Obsidian vault instead:

1. Open `docker-compose.yml`
2. Find this line:

```yml
- ./sample-vault:/vault:ro
```

3. Replace `./sample-vault` with the path to your own vault

Example:

```yml
- /Users/your-name/Documents/MyVault:/vault:ro
```

Leave `WIKI_ROOT: /vault` as it is.

For a direct build and run:

```bash
docker build -t wiki-os .
docker run --rm -p 5211:5211 -e WIKI_ROOT=/vault -v /path/to/your/vault:/vault:ro -v wiki-os-data:/data wiki-os
```

## Contributor mode

For normal users, use:

```bash
npm start
```

For contributors working on WikiOS itself, use:

```bash
npm run dev
```

`dev` runs a split frontend/backend setup for faster iteration.

## Folder structure

- `src/client/` contains the React app, routes, and UI components
- `src/server/` contains the Fastify server, setup flow, runtime config, and platform helpers
- `src/lib/` contains the wiki core
- `sample-vault/` contains the bundled demo content
- `scripts/` contains launch, deploy, and smoke-test helpers

## Advanced

### Useful commands

- `npm run first-run` installs dependencies and starts the guided first-run flow
- `npm start` starts the app in user mode
- `npm run dev` starts the contributor split client/server setup
- `npm run build` builds the client and server
- `npm run serve` runs the already-built server
- `npm run deploy` runs the deployment helper
- `npm run smoke-test` runs the smoke test helper
- `docker compose up --build` runs the app in Docker with the bundled demo vault

### Environment variables

- `WIKI_ROOT` bootstraps the app with a vault path
- `WIKIOS_FORCE_WIKI_ROOT` forces a temporary per-process vault override
- `PORT` sets the server port
- `WIKIOS_INDEX_DB` overrides the SQLite index path
- `WIKIOS_ADMIN_TOKEN` protects the manual reindex endpoint
- `WIKIOS_DISABLE_WATCH=1` disables filesystem watching

By default, WikiOS saves the selected vault in `~/.wiki-os/config.json` and stores hashed SQLite indexes under `~/.wiki-os/indexes/`.

### People model

WikiOS treats `People` as an explicit, user-controlled concept first. By default it recognizes people from:

- frontmatter keys like `person`, `people`, `type`, `kind`, and `entity`
- tags like `person`, `people`, `biography`, and `biographies`
- folders like `people/`, `person/`, `biographies/`, and `biography/`

You can customize this in `wiki-os.config.ts` with `people.mode`:

- `explicit` is the safest default
- `hybrid` allows broader inference after explicit metadata
- `off` hides People entirely

Local person overrides are saved in `~/.wiki-os/config.json` and do not rewrite your notes.

### Projects on-deck

WikiOS can surface a "Projects on-deck" section on the homepage, sourced from a folder of project hub notes. Each project is a subfolder containing an `_index.md` whose frontmatter drives the card. Sibling files in the same folder show up as "Project activity" on the hub page.

**Folder shape:**

```
Action/Projects/
  alpha/
    _index.md      # project hub — drives the on-deck card
    research.md    # sibling files surface as "Project activity" on the hub
    build-log.md
  beta/
    _index.md
```

**`_index.md` frontmatter:**

```yaml
---
status: active           # filtered by projects.activeStatuses
owner: frank
deadline: 2026-08-15     # ISO date; cards sort by deadline then last activity
area: tech               # optional grouping
---
```

**`wiki-os.config.ts`:**

```ts
projects: {
  path: "Action/Projects",                              // empty string disables the section
  indexFile: "_index.md",
  activeStatuses: ["active", "on-deck", "in-progress"],
  statusFrontmatterKey: "status",
  maxOnDeck: 6,
},
navigation: {
  headerLinks: [
    { label: "Culture", href: "/wiki/CULTURE" },        // pinned to the top bar
  ],
},
```

#### Adopting this for an ARKS vault

If your vault follows the ARKS convention (`Action/`, `Resources/`, `Knowledge/`, `sources/`), paste the prompt below into Claude Code (or any LLM with vault access) to retrofit existing project notes into the layout this feature expects:

````
You're retrofitting my Obsidian vault to work with WikiOS's "Projects on-deck"
homepage section.

My vault follows ARKS (Action/, Resources/, Knowledge/, sources/). Projects live
under Action/Projects/. Today they're a mix of:
- Flat files:  Action/Projects/<name>.md
- Folders:     Action/Projects/<name>/...

WikiOS expects each project to be a folder containing an _index.md hub:
  Action/Projects/<slug>/_index.md

Sibling .md files inside that folder appear as "Project activity" on the hub.

The _index.md frontmatter drives the homepage card:
  ---
  status: active | on-deck | in-progress | done | archived
  owner: <person>
  deadline: YYYY-MM-DD     (optional; cards sort by deadline)
  area: <grouping>         (optional)
  ---

Do this:
1. List every project under Action/Projects/ — both flat files and folders.
2. For flat project files, move them to Action/Projects/<kebab-slug>/_index.md,
   preserving content.
3. For folder projects without an _index.md, identify the hub note (root-level
   note, name matches folder, or longest content) and rename it to _index.md.
   Ask me if it's ambiguous.
4. For each _index.md, ensure frontmatter has at least `status`. If missing,
   infer:
     - active     → edited within the last 14 days
     - on-deck    → has open TODOs but no recent edits
     - archived   → explicit "done" or "archived" tag/frontmatter
   Ask before applying any inferred status.
5. Don't touch anything outside Action/Projects/.
6. Show a summary table (project · status · changes) before applying.

After this runs, set `projects.path: "Action/Projects"` in wiki-os.config.ts.
````

If your projects live elsewhere (e.g. `2-Areas/Projects/` for PARA, or the vault root), edit both the prompt and `projects.path` to match.

## License

MIT
