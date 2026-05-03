import type { WikiOsConfigInput } from "./src/lib/wiki-config";

const config: WikiOsConfigInput = {
  siteTitle: "WikiOS",
  tagline: "Plug-and-play Obsidian wiki for search, browsing, and local knowledge graphs.",
  searchPlaceholder: "Search notes, ideas, and people...",
  navigation: {
    headerLinks: [{ label: "Culture", href: "/wiki/CULTURE" }],
  },
  homepage: {
    labels: {
      featured: "Discover",
      topConnected: "Most Connected",
      people: "People",
      recentPages: "Recently Added",
    },
  },
  people: {
    mode: "explicit",
  },
  projects: {
    path: "Action/Projects",
    activeStatuses: ["active", "on-deck", "in-progress"],
    maxOnDeck: 8,
  },
};

export default config;
