export const promptSortOptions = [
  { value: "relevance", label: "相关" },
  { value: "combined", label: "综合" },
  { value: "rating", label: "评分" },
  { value: "latest", label: "最新" },
] as const;

export type PromptSort = typeof promptSortOptions[number]["value"];
export const isPromptSort = (value: string): value is PromptSort => promptSortOptions.some(option => option.value === value);

export const rankingPolicy = {
  priorMean: 3,
  priorVotes: 5,
  qualityWeight: 0.60,
  heatWeight: 0.20,
  freshnessWeight: 0.20,
  activityDays: 7,
  heatPriorUsers: 5,
  freshnessDays: 7,
} as const;
