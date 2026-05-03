import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveWikiOsConfig, type WikiOsConfigInput } from "../src/lib/wiki-config";

const cacheKey = "__wikiUiCache";

async function loadWikiModule(
  root: string,
  {
    configInput,
    setupConfigPath,
  }: {
    configInput?: WikiOsConfigInput;
    setupConfigPath?: string;
  } = {},
) {
  process.env.WIKI_ROOT = root;
  process.env.WIKIOS_FORCE_WIKI_ROOT = root;
  if (setupConfigPath) {
    process.env.WIKIOS_SETUP_CONFIG = setupConfigPath;
  } else {
    delete process.env.WIKIOS_SETUP_CONFIG;
  }

  if (configInput) {
    vi.doMock("../src/server/wiki-config", () => ({
      getWikiOsConfig: async () => resolveWikiOsConfig(configInput),
      resetWikiOsConfigCache: () => {},
    }));
  } else {
    vi.doUnmock("../src/server/wiki-config");
  }

  vi.resetModules();
  delete (globalThis as typeof globalThis & { __wikiUiCache?: unknown })[cacheKey];

  const { configureServerWikiCore } = await import("../src/server/wiki-core-adapter");
  configureServerWikiCore();
  return import("../src/lib/wiki");
}

afterEach(() => {
  delete process.env.WIKI_ROOT;
  delete process.env.WIKIOS_FORCE_WIKI_ROOT;
  delete process.env.WIKIOS_SETUP_CONFIG;
  vi.doUnmock("../src/server/wiki-config");
  vi.resetModules();
  delete (globalThis as typeof globalThis & { __wikiUiCache?: unknown })[cacheKey];
});

describe("wiki snapshot", () => {
  it("derives homepage and article data from the cached snapshot", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wiki-ui-"));

    try {
      const alphaPath = path.join(root, "Alpha.md");
      const betaPath = path.join(root, "Beta.md");
      const gammaPath = path.join(root, "Gamma.md");

      await writeFile(
        alphaPath,
        "# Alpha\n\nAlpha links to [[Beta]] and [[Gamma]].\n\n## Deep Dive\nMore about alpha.\n",
      );
      await writeFile(betaPath, "# Beta\n\nBeta references [[Alpha]].\n");
      await writeFile(
        gammaPath,
        "# Gamma\n\nGamma references [[Alpha]].\n\n```ts\nconst gamma = true;\n```\n",
      );

      await utimes(alphaPath, new Date("2024-01-01T00:00:00Z"), new Date("2024-01-01T00:00:00Z"));
      await utimes(betaPath, new Date("2024-01-02T00:00:00Z"), new Date("2024-01-02T00:00:00Z"));
      await utimes(gammaPath, new Date("2024-01-03T00:00:00Z"), new Date("2024-01-03T00:00:00Z"));

      const wiki = await loadWikiModule(root);
      const homepage = await wiki.getHomepageData();
      const alpha = await wiki.getWikiPage(["Alpha"]);
      const gamma = await wiki.getWikiPage(["Gamma"]);

      expect(homepage.totalPages).toBe(3);
      expect(homepage.featured.length).toBeGreaterThan(0);
      expect(homepage.recentPages[0]?.file).toBe("Gamma.md");
      expect(homepage.topConnected[0]?.file).toBe("Alpha.md");

      expect(alpha.contentMarkdown).toBe(
        "Alpha links to [Beta](/wiki/Beta) and [Gamma](/wiki/Gamma).\n\n## Deep Dive\nMore about alpha.\n",
      );
      expect(alpha.hasCodeBlocks).toBe(false);
      expect(alpha.headings).toEqual([{ text: "Deep Dive", id: "deep-dive", level: 2 }]);

      expect(gamma.hasCodeBlocks).toBe(true);
      expect(gamma.headings).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("stays on the warmed snapshot until restart", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wiki-ui-"));

    try {
      const alphaPath = path.join(root, "Alpha.md");
      await writeFile(alphaPath, "# Alpha\n\nVersion one.\n");

      const wiki = await loadWikiModule(root);
      const before = await wiki.getWikiPage(["Alpha"]);

      await writeFile(alphaPath, "# Alpha\n\nVersion two.\n");

      const after = await wiki.getWikiPage(["Alpha"]);

      expect(before.contentMarkdown).toContain("Version one.");
      expect(after.contentMarkdown).toContain("Version one.");
      expect(after.contentMarkdown).not.toContain("Version two.");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("can be manually reindexed without restarting the process", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wiki-ui-"));

    try {
      await writeFile(path.join(root, "Alpha.md"), "# Alpha\n\nBase page.\n");

      const wiki = await loadWikiModule(root);
      const before = await wiki.getHomepageData();
      expect(before.totalPages).toBe(1);

      await writeFile(path.join(root, "Beta.md"), "# Beta\n\nAdded later.\n");

      const stale = await wiki.getHomepageData();
      expect(stale.totalPages).toBe(1);

      const reindexedStats = await wiki.reindexWikiSnapshot();
      expect(reindexedStats.total_pages).toBe(2);

      const after = await wiki.getHomepageData();
      expect(after.totalPages).toBe(2);
      expect(await wiki.getWikiPage(["Beta"])).toMatchObject({
        title: "Beta",
        fileName: "Beta.md",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("derives generic topics and only includes explicit people by default", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wiki-ui-"));

    try {
      await mkdir(path.join(root, "guides"), { recursive: true });
      await mkdir(path.join(root, "people"), { recursive: true });
      await mkdir(path.join(root, "topics"), { recursive: true });

      await writeFile(
        path.join(root, "guides", "Knowledge Graphs.md"),
        [
          "---",
          "tags:",
          "  - research",
          "  - systems",
          "---",
          "",
          "# Knowledge Graphs",
          "",
          "Knowledge graphs help teams organize systems thinking and connected research.",
          "",
          "## Deep Dive",
          "",
          "Systems become easier to explore when the graph stays richly linked.",
          "",
        ].join("\n"),
      );

      await writeFile(
        path.join(root, "people", "Ada Lovelace.md"),
        [
          "---",
          "type: person",
          "tags:",
          "  - computing",
          "---",
          "",
          "# Ada Lovelace",
          "",
          "Ada Lovelace wrote about computing and mathematical imagination.",
          "",
        ].join("\n"),
      );

      await writeFile(
        path.join(root, "Local Search.md"),
        "# Local Search\n\nSearch quality improves when search scoring and search snippets stay focused.\n",
      );

      await writeFile(
        path.join(root, "Elon Musk.md"),
        [
          "# Elon Musk",
          "",
          "Born 1971. Engineer, founder, and builder focused on space, energy, and manufacturing.",
          "",
          "## Personal",
          "",
          "Known for intensity, first-principles thinking, and relentless execution.",
          "",
        ].join("\n"),
      );

      await writeFile(
        path.join(root, "topics", "WikiOS.md"),
        [
          "---",
          "tags:",
          "  - product",
          "  - system",
          "---",
          "",
          "# WikiOS",
          "",
          "WikiOS is a local-first wiki experience built around markdown files.",
          "",
        ].join("\n"),
      );

      await writeFile(
        path.join(root, "Reading People.md"),
        [
          "# Reading People",
          "",
          "A concept note about understanding other people accurately in social settings.",
          "",
          "## Key Points",
          "",
          "- Study people carefully before trusting appearances.",
          "",
        ].join("\n"),
      );

      const wiki = await loadWikiModule(root);
      const homepage = await wiki.getHomepageData();
      const knowledgeGraphs = await wiki.getWikiPage(["guides", "Knowledge%20Graphs"]);
      const ada = await wiki.getWikiPage(["people", "Ada%20Lovelace"]);
      const elon = await wiki.getWikiPage(["Elon%20Musk"]);
      const readingPeople = await wiki.getWikiPage(["Reading%20People"]);

      expect(knowledgeGraphs.categories).toEqual(
        expect.arrayContaining(["Research", "Systems", "Guides"]),
      );
      expect(homepage.categories.map((category) => category.name)).toEqual(
        expect.arrayContaining(["Research", "Guides", "Search"]),
      );
      expect(homepage.categories.map((category) => category.name)).not.toContain("Topics");
      expect(ada.isPerson).toBe(true);
      expect(elon.isPerson).toBe(false);
      expect(readingPeople.isPerson).toBe(false);
      expect(homepage.people.map((person) => person.title)).toContain("Ada Lovelace");
      expect(homepage.people.map((person) => person.title)).not.toContain("Elon Musk");
      expect(homepage.people.map((person) => person.title)).not.toContain("Reading People");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("can opt into hybrid people detection when configured", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wiki-ui-"));

    try {
      await writeFile(
        path.join(root, "Elon Musk.md"),
        [
          "# Elon Musk",
          "",
          "Born 1971. Engineer, founder, and builder focused on space, energy, and manufacturing.",
          "",
          "## Personal",
          "",
          "Known for intensity, first-principles thinking, and relentless execution.",
          "",
        ].join("\n"),
      );

      const wiki = await loadWikiModule(root, {
        configInput: {
          people: {
            mode: "hybrid",
          },
        },
      });

      const homepage = await wiki.getHomepageData();
      const elon = await wiki.getWikiPage(["Elon%20Musk"]);

      expect(elon.isPerson).toBe(true);
      expect(homepage.people.map((person) => person.title)).toContain("Elon Musk");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("resolves bare-name wikilinks to nested files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wiki-ui-"));

    try {
      await mkdir(path.join(root, "System"), { recursive: true });
      await mkdir(path.join(root, "Knowledge", "people"), { recursive: true });

      await writeFile(
        path.join(root, "CULTURE.md"),
        "# Culture\n\nWe care about [[onboarding]] and [[adaggio-barone]]. See [[onboarding#process]] too.\n",
      );
      await writeFile(
        path.join(root, "System", "onboarding.md"),
        "# Onboarding\n\nHow we welcome new teammates.\n\n## Process\nSteps go here.\n",
      );
      await writeFile(
        path.join(root, "Knowledge", "people", "adaggio-barone.md"),
        "# Adaggio Barone\n\nA teammate.\n",
      );

      const wiki = await loadWikiModule(root);
      const homepage = await wiki.getHomepageData();
      const onboarding = await wiki.getWikiPage(["System", "onboarding"]);
      const adaggio = await wiki.getWikiPage(["Knowledge", "people", "adaggio-barone"]);

      expect(onboarding.neighbors.map((n) => n.slug)).toContain("CULTURE");
      expect(adaggio.neighbors.map((n) => n.slug)).toContain("CULTURE");

      const onboardingSummary = homepage.topConnected.find(
        (page) => page.file === "System/onboarding.md",
      );
      expect(onboardingSummary?.backlinkCount).toBe(2);

      const adaggioSummary = homepage.people.find(
        (person) => person.file === "Knowledge/people/adaggio-barone.md",
      );
      expect(adaggioSummary?.backlinkCount).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("re-resolves bare-name wikilinks when a root-level file is added later", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wiki-ui-"));

    try {
      await mkdir(path.join(root, "System"), { recursive: true });

      await writeFile(
        path.join(root, "CULTURE.md"),
        "# Culture\n\nSee [[onboarding]] for details.\n",
      );
      await writeFile(
        path.join(root, "System", "onboarding.md"),
        "# Onboarding (deep)\n\nNested onboarding doc.\n",
      );

      const wiki = await loadWikiModule(root);
      const initial = await wiki.getHomepageData();
      const initialNested = initial.topConnected.find(
        (page) => page.file === "System/onboarding.md",
      );
      expect(initialNested?.backlinkCount).toBe(1);

      await writeFile(
        path.join(root, "onboarding.md"),
        "# Onboarding (root)\n\nRoot-level onboarding doc.\n",
      );

      const stats = await wiki.reindexWikiSnapshot();
      expect(stats.total_pages).toBe(3);

      const after = await wiki.getHomepageData();
      const nested = after.topConnected.find((page) => page.file === "System/onboarding.md");
      const flat = after.topConnected.find((page) => page.file === "onboarding.md");
      expect(nested?.backlinkCount ?? 0).toBe(0);
      expect(flat?.backlinkCount).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("surfaces active projects on-deck and folder activity on the project page", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wiki-ui-"));

    try {
      await mkdir(path.join(root, "Action", "Projects", "alpha"), { recursive: true });
      await mkdir(path.join(root, "Action", "Projects", "beta"), { recursive: true });
      await mkdir(path.join(root, "Action", "Projects", "gamma"), { recursive: true });

      await writeFile(
        path.join(root, "Action", "Projects", "alpha", "_index.md"),
        [
          "---",
          "status: active",
          "owner: frank",
          "deadline: 2099-01-15",
          "area: tech",
          "---",
          "",
          "# Alpha",
          "",
          "Alpha project hub doc with a long summary line that meets the threshold for inclusion.",
          "",
        ].join("\n"),
      );
      await writeFile(
        path.join(root, "Action", "Projects", "alpha", "research.md"),
        "# Alpha research\n\nNotes about the alpha workstream and discoveries we made along the way.\n",
      );
      await writeFile(
        path.join(root, "Action", "Projects", "alpha", "build-log.md"),
        "# Alpha build log\n\nDay-by-day log of progress on the alpha implementation work.\n",
      );

      await writeFile(
        path.join(root, "Action", "Projects", "beta", "_index.md"),
        [
          "---",
          "status: on-deck",
          "owner: ada",
          "deadline: 2099-01-05",
          "---",
          "",
          "# Beta",
          "",
          "Beta project queued up next, summary content for indexing purposes here.",
          "",
        ].join("\n"),
      );

      await writeFile(
        path.join(root, "Action", "Projects", "gamma", "_index.md"),
        [
          "---",
          "status: archived",
          "---",
          "",
          "# Gamma",
          "",
          "Gamma archived hub doc that should not appear in projectsOnDeck.",
          "",
        ].join("\n"),
      );

      const wiki = await loadWikiModule(root, {
        configInput: {
          projects: {
            path: "Action/Projects",
            activeStatuses: ["active", "on-deck"],
          },
        },
      });

      const homepage = await wiki.getHomepageData();
      const slugs = homepage.projectsOnDeck.map((p) => p.slug);
      expect(slugs).toEqual(["Action/Projects/beta/_index", "Action/Projects/alpha/_index"]);
      expect(homepage.projectsOnDeck.map((p) => p.title)).toEqual(["Beta", "Alpha"]);
      expect(homepage.projectsOnDeck.find((p) => p.slug.endsWith("alpha/_index"))).toMatchObject({
        title: "Alpha",
        status: "active",
        owner: "frank",
        deadline: "2099-01-15",
        area: "tech",
      });

      const alpha = await wiki.getWikiPage(["Action", "Projects", "alpha", "_index"]);
      expect(alpha.title).toBe("Alpha");
      expect(alpha.isProjectIndex).toBe(true);
      expect(alpha.project?.status).toBe("active");
      expect(alpha.project?.siblings.map((s) => s.title).sort()).toEqual([
        "build-log",
        "research",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("applies local per-vault person overrides without editing the vault", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wiki-ui-"));
    const setupConfigPath = path.join(root, ".wiki-os-config.json");

    try {
      await writeFile(
        path.join(root, "Reading People.md"),
        [
          "# Reading People",
          "",
          "A concept note about understanding other people accurately in social settings.",
          "",
          "## Key Points",
          "",
          "- Study people carefully before trusting appearances.",
          "",
        ].join("\n"),
      );

      await writeFile(
        setupConfigPath,
        JSON.stringify(
          {
            wikiRoot: root,
            personOverridesByVault: {
              [root]: {
                "Reading People.md": "person",
              },
            },
          },
          null,
          2,
        ),
      );

      const wiki = await loadWikiModule(root, { setupConfigPath });
      const homepage = await wiki.getHomepageData();
      const readingPeople = await wiki.getWikiPage(["Reading%20People"]);

      expect(readingPeople.isPerson).toBe(true);
      expect(readingPeople.personOverride).toBe("person");
      expect(homepage.people.map((person) => person.title)).toContain("Reading People");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
