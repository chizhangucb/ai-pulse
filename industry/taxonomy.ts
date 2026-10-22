// This industry's classification: categories, the tag vocabulary, the company (subject) directory, and the identity
// dictionary that keeps write-ups from naming the wrong company. Models tag items from these lists, topic pages
// (topics.json) group items by tag, and the filter bar groups by category.
// Category keys appear in addresses (/all?category=...); keep them once the site is live. Tags and companies can change.

/**
 * Categories on the site (filter bar, card badges, category RSS). key is the identity in addresses and the API.
 * section is the heading in the daily brief (several categories may share one, in this order); guide tells the
 * structuring model what belongs here and where the border with neighbors is (general rules are in prompts/structure.md).
 * commentary marks commentary (how-tos, opinion): a follow-up of this kind on a story the daily brief already covered
 * gets only a one-line brief item (unless enough sources report it).
 * Items with no category go into the section of the category keyed "industry" (or the last section if there is none).
 * tagColor is the Feishu card tag color. feedLabel is the name in category RSS titles (defaults to label).
 */
export const CATEGORIES = [
  { key: "ai-models", tagColor: "indigo", label: "Models", feedLabel: "AI models", section: "Models", guide: "A model itself: a release, a new version, open weights, changes in capability or price, and results of a model on an existing leaderboard. Publishing one benchmark score is not a new benchmark and not a how-to." },
  { key: "ai-products", tagColor: "turquoise", label: "Products & agents", feedLabel: "AI products", section: "Products & agents", guide: "AI products people can use: apps, features, agents, tools, APIs, platforms and developer components, launched or updated. An inference engine or kernel library from a model lab is still a product, not a model." },
  { key: "compute", tagColor: "carmine", label: "Chips & compute", feedLabel: "AI chips and compute", section: "Chips & compute", guide: "AI chips, accelerators, servers, data centers, cloud capacity deals, power for AI, and supply of compute. A lab buying compute belongs here; a lab raising money belongs in Business." },
  { key: "industry", tagColor: "orange", label: "Business", feedLabel: "AI business", section: "Business & funding", guide: "Things that happened at companies: funding rounds, valuations, acquisitions, earnings, hires and departures, partnerships and lawsuits. A post by the people involved with an attitude is still news, not opinion." },
  { key: "policy", tagColor: "red", label: "Policy & safety", feedLabel: "AI policy and safety", section: "Policy & safety", guide: "Laws, regulation, government action, export controls, court rulings on AI, real safety or security incidents and their investigations, and labs' safety frameworks. A safety research paper belongs in Research." },
  { key: "paper", tagColor: "violet", label: "Research", feedLabel: "AI research", section: "Research", guide: "Papers, technical reports, new benchmarks and research datasets whose core is a new method, experiment or finding. Systematic red-teaming is research; a model's score on an existing leaderboard belongs in Models." },
  { key: "tip", tagColor: "green", label: "How-to", feedLabel: "AI how-to", section: "How-to & opinion", guide: "Methods readers can follow: prompts, tool usage, engineering write-ups and technical explainers. The point is a reusable way of doing something; a plain tool launch is a product, and views without a method are opinion.", commentary: true },
  { key: "opinion", tagColor: "purple", label: "Opinion", feedLabel: "AI opinion", section: "How-to & opinion", guide: "The point is the author's explanation, judgment, argument, prediction, commentary or interview views. Talking about markets is not automatically Business, and a famous author is not automatically Opinion.", commentary: true },
] as const satisfies ReadonlyArray<{ key: string; tagColor: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

/**
 * The release this industry watches most (new models in AI): the "N new models" count on the daily nameplate, and
 * recounts of published briefs after a category change. Both category and tag must match; unit follows the number.
 * Industries without such a release set null, and the nameplate leaves the count out.
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = { category: "ai-models", tag: "Model release", unit: "new models" };

/** Common words the weekly and monthly overviews may use without finding them in an item (lower case). The site name counts too. */
export const PLAIN_TERMS: readonly string[] = ["ai", "api", "llm", "gpu", "agi", "ceo", "ipo", "agent", "agents", "open source", "open-weight", "chip", "chips"];

/**
 * The content type the understanding step gives each item (listed in prompts/content-understanding.md; change both
 * together). The score prompt (prompts/selection-score.md) weighs its five dimensions by type.
 */
export const ITEM_TYPES = ["model_release", "product_launch", "tool_or_prompt", "research_paper", "industry_event", "opinion_analysis", "tutorial_explainer"] as const;

// ── Tag vocabulary ─────────────────────────────────────────────────────────────────────────

/** The first tag of every item must be one of these category tags. */
export const CATEGORY_TAGS = [
  "Product update", "Model release", "Research", "Open source", "How-to", "Trend", "Expert view", "Benchmark", "Safety",
  "Business", "Funding & deals", "Chips & compute", "Policy", "Not AI", "Other",
] as const;

/** Optional topic tags. */
export const TOPIC_TAGS = [
  "Agents", "Coding", "Reasoning", "Multimodal", "Voice", "Video", "Image generation", "RAG", "On-device", "Data & training", "Search",
  "Deployment", "Open-weight models", "Robotics", "MCP & tool use", "Data centers",
] as const;

/** Optional entity tags (companies, institutions, platforms). */
export const ENTITY_TAGS = ["OpenAI", "Anthropic", "Google", "DeepMind", "Meta", "Microsoft", "xAI", "Mistral", "NVIDIA", "DeepSeek", "Hugging Face", "GitHub", "arXiv"] as const;

/** Synonyms models often write, mapped to the vocabulary above. */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  product: "Product update", products: "Product update", "product launch": "Product update", update: "Product update", launch: "Product update",
  model: "Model release", models: "Model release", "new model": "Model release", release: "Model release",
  paper: "Research", papers: "Research", "research paper": "Research", study: "Research",
  "open-source": "Open source", opensource: "Open source", repo: "Open source", github: "Open source",
  tutorial: "How-to", guide: "How-to", tips: "How-to", "best practices": "How-to", explainer: "How-to",
  trends: "Trend", opinion: "Expert view", interview: "Expert view", commentary: "Expert view",
  benchmarks: "Benchmark", eval: "Benchmark", evals: "Benchmark", evaluation: "Benchmark", leaderboard: "Benchmark",
  alignment: "Safety", security: "Safety", "ai safety": "Safety",
  industry: "Business", company: "Business", partnership: "Business", partnerships: "Business", hiring: "Business", lawsuit: "Business",
  funding: "Funding & deals", investment: "Funding & deals", acquisition: "Funding & deals", "m&a": "Funding & deals", ipo: "Funding & deals", valuation: "Funding & deals",
  chips: "Chips & compute", compute: "Chips & compute", hardware: "Chips & compute", gpu: "Chips & compute", gpus: "Chips & compute", semiconductors: "Chips & compute",
  regulation: "Policy", government: "Policy", law: "Policy", "export controls": "Policy",
  agent: "Agents", "ai agents": "Agents", "video generation": "Video", "text-to-video": "Video", "text-to-image": "Image generation",
  robots: "Robotics", "embodied ai": "Robotics", "open weights": "Open-weight models", "data center": "Data centers", datacenter: "Data centers",
  "tool use": "MCP & tool use", mcp: "MCP & tool use", "function calling": "MCP & tool use",
  "non-ai": "Not AI", "not ai": "Not AI", devops: "Not AI",
};

// ── Companies and subjects ────────────────────────────────────────────────────────────────

/**
 * Company topics: id → display name, the tag shown on cards (null means only entity:<id> grouping), aliases.
 * aliases are for the structuring model; orgNames are the organization names a company's own posts start with (lab,
 * team), which its own topic page may leave out; otherNames are other names of the company (official accounts,
 * sub-brands). All of them identify which company an item is about, for example to match a fact to its publisher.
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; orgNames?: string[]; otherNames?: string[] }> = {
  openai: { name: "OpenAI", displayTag: "OpenAI", aliases: ["OpenAI", "ChatGPT", "Sora", "Codex", "GPT"], orgNames: ["OpenAI"], otherNames: ["OpenAI Developers"] },
  anthropic: { name: "Anthropic", displayTag: "Anthropic", aliases: ["Anthropic", "Claude"], orgNames: ["Anthropic"], otherNames: ["Claude Code", "Claude"] },
  google: { name: "Google", displayTag: "Google", aliases: ["Google", "DeepMind", "Gemini"], orgNames: ["Google DeepMind", "Google Research", "Google", "DeepMind"], otherNames: ["Google AI", "Google Labs", "Google Cloud"] },
  meta: { name: "Meta", displayTag: "Meta", aliases: ["Meta", "Llama"], orgNames: ["Meta Superintelligence Labs", "Meta AI", "Meta"], otherNames: ["AI at Meta", "Muse"] },
  microsoft: { name: "Microsoft", displayTag: "Microsoft", aliases: ["Microsoft", "Copilot", "Azure"], orgNames: ["Microsoft Research", "Microsoft AI", "Microsoft"] },
  xai: { name: "xAI", displayTag: "xAI", aliases: ["xAI", "Grok"], orgNames: ["SpaceX Super Intelligence", "SpaceXAI", "SpaceXSI", "xAI"], otherNames: ["Grok Bot"] },
  mistral: { name: "Mistral AI", displayTag: "Mistral", aliases: ["Mistral", "Le Chat"], orgNames: ["Mistral AI", "Mistral"] },
  nvidia: { name: "NVIDIA", displayTag: "NVIDIA", aliases: ["NVIDIA", "CUDA", "Blackwell"], orgNames: ["NVIDIA"] },
  amd: { name: "AMD", displayTag: null, aliases: ["AMD", "Advanced Micro Devices", "Instinct"], orgNames: ["AMD"] },
  apple: { name: "Apple", displayTag: null, aliases: ["Apple Intelligence", "Apple"], orgNames: ["Apple"] },
  amazon: { name: "Amazon / AWS", displayTag: null, aliases: ["Amazon", "AWS", "Bedrock", "Trainium"], orgNames: ["Amazon", "AWS", "Amazon Web Services"] },
  "hugging-face": { name: "Hugging Face", displayTag: "Hugging Face", aliases: ["Hugging Face"], orgNames: ["Hugging Face", "HuggingFace"] },
  deepseek: { name: "DeepSeek", displayTag: "DeepSeek", aliases: ["DeepSeek"], orgNames: ["DeepSeek"] },
  qwen: { name: "Alibaba Qwen", displayTag: null, aliases: ["Qwen", "Alibaba"], orgNames: ["Qwen Team", "Qwen", "Alibaba", "Alibaba Cloud"] },
  kimi: { name: "Moonshot AI / Kimi", displayTag: null, aliases: ["Kimi", "Moonshot"], orgNames: ["Moonshot AI", "Kimi"] },
  "thinking-machines": { name: "Thinking Machines Lab", displayTag: null, aliases: ["Thinking Machines"] },
  "world-labs": { name: "World Labs", displayTag: null, aliases: ["World Labs"] },
  cursor: { name: "Cursor", displayTag: null, aliases: ["Cursor", "Anysphere"], orgNames: ["Cursor"] },
  openrouter: { name: "OpenRouter", displayTag: null, aliases: ["OpenRouter"], orgNames: ["OpenRouter"] },
};

/**
 * Identity dictionary: a company named in a title or summary must also appear in the original, or the original title
 * is kept and the summary dropped (so the model cannot pin news on the wrong company). Leave empty if not needed.
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "openai", name: "OpenAI", patterns: [/openai|chatgpt|\bgpt-?[o\d]|\bsora\b|\bcodex\b/i] },
  { id: "anthropic", name: "Anthropic", patterns: [/anthropic|\bclaude\b/i, /\b(?:opus|sonnet|haiku)\s*\d+(?:[.\-]\d+)*\b/i, /\bfable\s*\d+(?:[.\-]\d+)*\b|\bmythos\b/i] },
  { id: "google", name: "Google / Gemini", patterns: [/google|deepmind|\bgemini\b|notebooklm|\bveo\s?\d|\bAlphaFold\b|\bAMIE\b/i] },
  { id: "deepseek", name: "DeepSeek", patterns: [/deepseek/i] },
  { id: "xai", name: "xAI / Grok", patterns: [/\bxai\b|\bgrok\b/i] },
  { id: "meta", name: "Meta / Llama", patterns: [/\bMeta\b/, /\bmeta\s?ai\b|\bllama\b/i] },
  { id: "microsoft", name: "Microsoft / Copilot", patterns: [/microsoft|copilot/i] },
  { id: "nvidia", name: "NVIDIA", patterns: [/nvidia|\bnemotron\b|\bnemo\b|\bblackwell\b|\brubin(?:\s+ultra)?\b|\bcuda\b/i] },
  { id: "qwen", name: "Alibaba Qwen", patterns: [/\bqwen|\balibaba\b/i] },
  { id: "hugging-face", name: "Hugging Face", patterns: [/hugging\s?face/i] },
  { id: "cursor", name: "Cursor", patterns: [/\bCursor\b/] },
  { id: "kimi", name: "Moonshot AI / Kimi", patterns: [/\bkimi\b|\bmoonshot\s?ai\b/i] },
  { id: "openrouter", name: "OpenRouter", patterns: [/openrouter/i] },
  { id: "minimax", name: "MiniMax", patterns: [/minimax/i] },
  { id: "zhipu", name: "Zhipu GLM", patterns: [/\bzhipu\b|\bglm-?[4-9]/i] },
  { id: "hunyuan", name: "Tencent Hunyuan", patterns: [/hunyuan|\btencent\b/i] },
  { id: "doubao", name: "ByteDance Doubao", patterns: [/doubao|bytedance/i] },
  { id: "mistral", name: "Mistral", patterns: [/mistral/i] },
  { id: "perplexity", name: "Perplexity", patterns: [/\bPerplexity\b/] },
  { id: "runway", name: "Runway", patterns: [/\brunway\b/i] },
  { id: "suno", name: "Suno", patterns: [/\bsuno\b/i] },
  { id: "midjourney", name: "Midjourney", patterns: [/midjourney/i] },
  { id: "stability-ai", name: "Stability AI", patterns: [/stability\s?ai/i] },
  { id: "elevenlabs", name: "ElevenLabs", patterns: [/eleven\s?labs/i] },
  { id: "vllm", name: "vLLM", patterns: [/\bvllm\b/i] },
  { id: "ollama", name: "Ollama", patterns: [/\bollama\b/i] },
  { id: "windsurf", name: "Windsurf", patterns: [/windsurf/i] },
  { id: "devin", name: "Devin", patterns: [/\bdevin\b/i] },
  { id: "manus", name: "Manus", patterns: [/\bmanus\b/i] },
  { id: "apple", name: "Apple AI", patterns: [/\bapple\s?(intelligence|silicon|ai)\b/i] },
  { id: "amazon", name: "Amazon / AWS", patterns: [/amazon|\baws\b/i] },
  { id: "amd", name: "AMD", patterns: [/\bamd\b/i] },
  { id: "baidu", name: "Baidu ERNIE", patterns: [/baidu|\bernie\s?bot\b/i] },
];

/** Articles on these domains are published by the company (hosting platforms such as GitHub and arXiv do not count). */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "openai", domains: ["openai.com"] },
  { entityId: "anthropic", domains: ["anthropic.com", "claude.com"] },
  { entityId: "google", domains: ["deepmind.google", "ai.google", "blog.google"] },
  { entityId: "deepseek", domains: ["deepseek.com"] },
  { entityId: "xai", domains: ["x.ai"] },
  { entityId: "meta", domains: ["ai.meta.com"] },
  { entityId: "microsoft", domains: ["microsoft.com", "microsoft.ai"] },
  { entityId: "mistral", domains: ["mistral.ai"] },
  { entityId: "hugging-face", domains: ["huggingface.co"] },
  { entityId: "nvidia", domains: ["nvidia.com"] },
  { entityId: "qwen", domains: ["qwen.ai"] },
  { entityId: "cursor", domains: ["cursor.com"] },
  { entityId: "openrouter", domains: ["openrouter.ai"] },
];

/** These spellings in the original also count as naming the company. */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "meta", pattern: /@AIatMeta\b/i },
  { entityId: "zhipu", pattern: /\bZhipu(?:\s+AI\b|['’]s\b)/i },
];
