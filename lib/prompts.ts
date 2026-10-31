import { normalizeVersion, readVersionRange } from "./version-range.mjs";
import { templateCatalog } from "./template-catalog.ts";
import { MAX_PERSONALITY_JSON_LENGTH, PERSONALITY_JSON_LIMIT_ERROR, personalityJsonLength, requiredPersonalityError } from "./personality-export.ts";

export const templateCategories = ["回复与规划", "表达与行为", "图片与表情", "黑话理解", "记忆", "其他工具"] as const;
export const locales = ["zh-CN", "en-US", "ja-JP"] as const;
export const fieldLabels = {
  personality: "人格设定",
  behavior_style: "行为风格",
  reply_style: "表达风格",
  multiple_reply_style: "备用表达风格",
  multiple_probability: "备用风格概率",
  group_chat_prompt: "群聊提示词",
  private_chat_prompts: "私聊提示词",
} as const;
export const fieldPaths: Record<keyof typeof fieldLabels, string> = {
  personality: "personality.personality",
  behavior_style: "personality.behavior_style",
  reply_style: "personality.reply_style",
  multiple_reply_style: "personality.multiple_reply_style",
  multiple_probability: "personality.multiple_probability",
  group_chat_prompt: "chat.reply_style.group_chat_prompt",
  private_chat_prompts: "chat.reply_style.private_chat_prompts",
};

export type FieldName = keyof typeof fieldLabels;
export type TextFieldName = Exclude<FieldName, "multiple_reply_style" | "multiple_probability">;
export type PromptFields = Partial<Record<TextFieldName, string>> & { multiple_reply_style?: string[]; multiple_probability?: number };
export type Category = "" | typeof templateCategories[number];
export type Kind = "config" | "template";
export type Locale = typeof locales[number];
export type CommunityStats = { average: number | null; ratingsCount: number; commentCount: number; copyCount: number; downloadCount: number };
export type TemplateFile = { name: string; locale: string; content: string };
// Text limits use JavaScript UTF-16 code units; personality fields share the
// final serialized JSON budget rather than separate per-field quotas.
export const MAX_TEMPLATE_FILES = 20;
export const MAX_TEMPLATE_TOTAL_LENGTH = 200000;
export const MAX_PROMPT_REQUEST_BYTES = 2 * 1024 * 1024;
export type PromptItem = {
  id: string;
  title: string;
  author: string;
  authorTag?: string;
  authorProfileTag?: string;
  description: string;
  kind: Kind;
  category: Category;
  scene: "";
  minVersion: string;
  maxVersion: string | null;
  tags: string[];
  fields: PromptFields;
  templateName?: string;
  templateLocale?: string;
  templateContent?: string;
  templateFiles?: TemplateFile[];
  templateBasis?: "snapshot-1.2.5" | "unverified";
  createdAt: string;
  updatedAt?: string | null;
  mine?: boolean;
  sample?: boolean;
  searchMatch?: import("./search.ts").SearchMatch;
};
type PromptInput = Omit<PromptItem, "id" | "createdAt" | "mine" | "sample">;
const textFields: TextFieldName[] = ["personality", "behavior_style", "reply_style", "group_chat_prompt", "private_chat_prompts"];

export function filledConfigFields(fields: PromptFields): FieldName[] {
  return (Object.keys(fieldLabels) as FieldName[]).filter(key => {
    const value = fields[key];
    return typeof value === "number" ? Number.isFinite(value) : Array.isArray(value) ? value.some(text => text.trim()) : typeof value === "string" && !!value.trim();
  });
}

// Historical records may contain fields that are no longer shared.
export function sharedConfigFields(fields: PromptFields): PromptFields {
  return Object.fromEntries(filledConfigFields(fields).map(key => [key, fields[key]]));
}

export function promptTitle(item: Pick<PromptItem, "title">): string {
  return item.title || "未命名作品";
}

// Old single-file records remain readable without rewriting their contents.
export function templateFilesFor(item: { kind?: string; templateFiles?: TemplateFile[]; templateName?: string; templateLocale?: string; templateContent?: string }): TemplateFile[] {
  if (item.kind === "config") return [];
  if (item.templateFiles?.length) return item.templateFiles;
  return [{ name: item.templateName ?? "", locale: item.templateLocale ?? "", content: item.templateContent ?? "" }];
}

export function templateDownloadName(file: TemplateFile, index = 0): string {
  return `${file.name || `prompt-${index + 1}`}.prompt`;
}

export function isValidVersion(version: string): boolean {
  return normalizeVersion(version) !== null;
}

export function getTemplate(name: string) {
  return templateCatalog.templates.find(item => item.name === name);
}
export function templateVariables(name: string, locale: string): readonly string[] | undefined {
  const item = getTemplate(name);
  return item ? (item.locales as Record<string, readonly string[]>)[locale] : undefined;
}

// The inspected MaiBot snapshots use simple fields. Escaped double braces are
// literal text; reject nested fields because the reference templates do not use them.
export function extractPlaceholders(value: string): string[] {
  const fields = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === "{") {
      if (value[index + 1] === "{") { index++; continue; }
      const end = value.indexOf("}", index + 1);
      if (end < 0) throw new Error("花括号未闭合。");
      const expression = value.slice(index + 1, end);
      if (expression.includes("{")) throw new Error("不支持嵌套花括号。");
      const conversion = expression.match(/!([^:]*)(?:\:|$)/);
      if (conversion && !["s", "r", "a"].includes(conversion[1])) throw new Error("占位符转换格式无效。");
      const field = expression.split(/[!:]/, 1)[0].split(/[.[]/, 1)[0];
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) throw new Error("占位符名称无效。");
      fields.add(field);
      index = end;
    } else if (char === "}") {
      if (value[index + 1] === "}") { index++; continue; }
      throw new Error("出现单独的右花括号。");
    }
  }
  return [...fields].sort();
}

export function validateConfigFields(title: string, rawFields: Record<string, unknown>): { fields?: PromptFields; error?: string } {
  const string = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const fields: PromptFields = {};
  for (const key of textFields) {
    const text = string(rawFields[key]);
    if (text) fields[key] = text;
  }
  if (rawFields.multiple_reply_style !== undefined) {
    if (!Array.isArray(rawFields.multiple_reply_style)) return { error: "备用表达风格格式错误。" };
    const styles = rawFields.multiple_reply_style.map(string).filter(Boolean);
    if (styles.length > 10) return { error: "备用表达风格最多 10 项。" };
    if (styles.length) fields.multiple_reply_style = styles;
  }
  if (rawFields.multiple_probability !== undefined && rawFields.multiple_probability !== null && rawFields.multiple_probability !== "") {
    const probability = rawFields.multiple_probability;
    if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) return { error: "备用风格概率需在 0 到 1 之间。" };
    fields.multiple_probability = probability;
  }
  if (Object.keys(fields).length === 0) return { error: "请填写至少一个配置字段。" };
  try { if (personalityJsonLength({ title, fields }) > MAX_PERSONALITY_JSON_LENGTH) return { error: PERSONALITY_JSON_LIMIT_ERROR }; }
  catch (cause) { return { error: cause instanceof Error ? cause.message : "人设内容无法导出。" }; }
  return { fields };
}

export function validatePrompt(value: unknown): { data?: PromptInput; error?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "内容格式有误。" };
  const item = value as Record<string, unknown>;
  const string = (v: unknown) => typeof v === "string" ? v.trim() : "";
  const title = string(item.title), author = string(item.author) || "匿名作者", description = string(item.description);
  const kind = item.kind === undefined ? "config" : string(item.kind);
  const category = kind === "config" ? "" : string(item.category);
  const range = readVersionRange(item.minVersion, item.maxVersion);
  if (!title) return { error: "请填写作品名称。" };
  if (title.length > 60) return { error: "作品名称不能超过 60 字。" };
  if (author.length > 24) return { error: "作者名称不能超过 24 字。" };
  if (description.length > 240) return { error: "简介不能超过 240 字。" };
  if (!["config", "template"].includes(kind)) return { error: "请选择分享类型。" };
  if (kind === "template" && category && !templateCategories.some(value => value === category)) return { error: "请选择内容分类。" };
  if (range.error !== undefined) return { error: range.error };
  const tags = Array.isArray(item.tags) ? [...new Set(item.tags.map(string).filter(Boolean))] : [];
  if (tags.length > 5 || tags.some(tag => tag.length > 12)) return { error: "标签最多 5 个，每个不超过 12 字。" };
  let fields: PromptFields = {};
  let templateName = "", templateLocale = "", templateContent = "";
  const templateFiles: TemplateFile[] = [];
  let templateBasis: "snapshot-1.2.5" | "unverified" = "snapshot-1.2.5";
  if (kind === "config") {
    if (!item.fields || typeof item.fields !== "object" || Array.isArray(item.fields)) return { error: "请填写至少一个配置字段。" };
    const result = validateConfigFields(title, item.fields as Record<string, unknown>);
    if (!result.fields) return { error: result.error };
    fields = result.fields;
    const requiredError = requiredPersonalityError(fields);
    if (requiredError) return { error: requiredError };
  } else {
    templateBasis = "unverified";
    const rawFiles = item.templateFiles === undefined
      ? [{ name: item.templateName, locale: item.templateLocale, content: item.templateContent }]
      : item.templateFiles;
    if (!Array.isArray(rawFiles) || !rawFiles.length || rawFiles.length > MAX_TEMPLATE_FILES) return { error: `请上传 1–${MAX_TEMPLATE_FILES} 个提示词文件。` };
    const targets = new Set<string>();
    for (const [index, raw] of rawFiles.entries()) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: `第 ${index + 1} 个提示词文件格式有误。` };
      const file = raw as Record<string, unknown>;
      const name = string(file.name).replace(/\.prompt$/i, ""), locale = string(file.locale);
      const content = typeof file.content === "string" ? file.content : "";
      if (!name && !locale && !content.trim()) continue;
      const prefix = `第 ${index + 1} 个文件：`;
      if (!content.trim() || content.length > 30000) return { error: `${prefix}模板正文需为 1–30000 字。` };
      if (name && (!/^[A-Za-z0-9_.-]{1,80}$/.test(name) || [".", ".."].includes(name))) return { error: `${prefix}模板文件名只能包含字母、数字、点、下划线和横线。` };
      if (locale && (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale) || locale.length > 24)) return { error: `${prefix}请填写有效的语言代码，例如 zh-CN。` };
      const target = `${name.toLowerCase()}\0${locale.toLowerCase()}`;
      if (name && targets.has(target)) return { error: `${prefix}文件名和语言与前面的文件重复。` };
      if (name) targets.add(target);
      templateFiles.push({ name, locale, content });
    }
    if (!templateFiles.length) return { error: "请填写至少一个提示词文件的正文。" };
    if (templateFiles.reduce((total, file) => total + file.content.length, 0) > MAX_TEMPLATE_TOTAL_LENGTH) return { error: `提示词文件正文合计不能超过 ${MAX_TEMPLATE_TOTAL_LENGTH} 字符。` };
    // Keep the original fields as a first-file compatibility view for older clients.
    ({ name: templateName, locale: templateLocale, content: templateContent } = templateFiles[0]);
  }
  return { data: { title, author, description, kind: kind as Kind, category: category as Category, scene: "", minVersion: range.minVersion, maxVersion: range.maxVersion, tags, fields, templateName, templateLocale, templateContent, templateFiles, templateBasis } };
}

export function toToml(fields: PromptFields): string {
  const personal = (["personality", "behavior_style", "reply_style"] as TextFieldName[]).filter(key => fields[key]);
  const chat = (["group_chat_prompt", "private_chat_prompts"] as TextFieldName[]).filter(key => fields[key]);
  const blocks: string[] = [];
  const encode = (value: string) => JSON.stringify(value).replace(/\u007f/g, "\\u007f");
  const personalLines = personal.map(key => `${key} = ${encode(fields[key]!)}`);
  if (fields.multiple_reply_style?.length) personalLines.push(`multiple_reply_style = [${fields.multiple_reply_style.map(encode).join(", ")}]`);
  if (fields.multiple_probability !== undefined) personalLines.push(`multiple_probability = ${Number.isInteger(fields.multiple_probability) ? fields.multiple_probability.toFixed(1) : fields.multiple_probability}`);
  if (personalLines.length) blocks.push(`[personality]\n${personalLines.join("\n")}`);
  if (chat.length) blocks.push(`[chat.reply_style]\n${chat.map(key => `${key} = ${encode(fields[key]!)}`).join("\n")}`);
  return blocks.join("\n\n");
}

// Subsequence matching tolerates missing characters; each space-separated term
// must still occur in one of the searchable values.
export function fuzzyMatches(values: string[], query: string): boolean {
  const haystacks = values.map(value => value.toLocaleLowerCase());
  return query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean).slice(0, 5).every(term => haystacks.some(value => {
    if (Array.from(term).length > 8) return value.includes(term);
    let position = 0;
    for (const character of value) if (character === Array.from(term)[position]) position++;
    return position === Array.from(term).length;
  }));
}

// The public catalog starts empty; content comes only from published works.
export const samples: PromptItem[] = [];
