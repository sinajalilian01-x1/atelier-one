// The three hands in the studio that bid on every commission. Ids match the on-chain style registry
// (`get_styles` on the studio contract), which holds the price floor, the artist and the royalty.
export type StyleId = "paper-fox" | "grid-ink" | "sina-neon";

export interface Persona {
  id: StyleId;
  name: string;          // who bids
  style: string;         // what the style is called
  human: boolean;        // a real artist behind it (paid a royalty on-chain)
  artist?: string;       // their NEAR account
  artistBps: number;
  minNear: number;       // mirrors the on-chain min_price
  tagline: string;
  colors: [string, string, string];
  imagePrompt: (subject: string) => string;
}

export const PERSONAS: Persona[] = [
  {
    id: "paper-fox", name: "Pip", style: "Paper Fox", human: false, artistBps: 0, minNear: 0.03,
    tagline: "House style: warm paper cut-outs, the island's own look",
    colors: ["#F4E9D8", "#E0662C", "#2F4A3A"],
    imagePrompt: (s) => `${s}. Flat paper-cutout illustration, layered cut paper with soft shadows, warm autumn palette of rust, ochre, cream and forest green, simple bold shapes, gentle grain, no text, no letters, no words.`,
  },
  {
    id: "grid-ink", name: "Ora", style: "Grid & Ink", human: false, artistBps: 0, minNear: 0.05,
    tagline: "House style: Swiss grid, big type, one hot colour",
    colors: ["#EEEAE1", "#111111", "#E8432E"],
    imagePrompt: (s) => `${s}. High-contrast black and white graphic photograph, bold silhouette, strong geometric shapes, lots of negative space, editorial, no text, no letters, no words.`,
  },
  {
    id: "sina-neon", name: "Sina Jalilian", style: "Neon Mark", human: true, artist: "sina.atelier-one.testnet", artistBps: 2000, minNear: 0.08,
    tagline: "Real artist: Sina's own neon style, he earns 20% of the commission on-chain",
    colors: ["#07080B", "#FF3B5C", "#3DF2E0"],
    imagePrompt: (s) => `${s}. Night scene lit by hot coral-red and cyan neon rim light, deep black background, cinematic, glossy reflections, high contrast, no text, no letters, no words.`,
  },
];
export const persona = (id: string) => PERSONAS.find((p) => p.id === id);
