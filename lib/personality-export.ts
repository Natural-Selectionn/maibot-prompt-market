import type { PromptItem } from "./prompts.ts";
import { DEFAULT_CHAT_PROMPTS } from "./maibot-chat-defaults.ts";

export const MAX_PERSONALITY_JSON_LENGTH = 65536;
export const PERSONALITY_JSON_LIMIT_ERROR = "人设总内容超过 65536 字符，请精简。";
export const REQUIRED_PERSONALITY_FIELDS = ["personality", "behavior_style", "reply_style"] as const;
const requiredLabels = { personality: "人格设定", behavior_style: "行为风格", reply_style: "表达风格" };

export function requiredPersonalityError(fields: Pick<PromptItem, "fields">["fields"]): string | undefined {
  const missing = REQUIRED_PERSONALITY_FIELDS.filter(key => !fields[key]?.trim());
  return missing.length ? `请填写${missing.map(key => requiredLabels[key]).join("、")}。` : undefined;
}

function serializePersonality(item: Pick<PromptItem, "title" | "fields">): string {
  const fields = item.fields;
  const text = JSON.stringify({
    format: "maibot.personality",
    version: 1,
    profile: {
      name: item.title.trim() || "未命名作品",
      personality: fields.personality ?? "",
      behavior_style: fields.behavior_style ?? "",
      reply_style: fields.reply_style ?? "",
      group_chat_prompt: fields.group_chat_prompt?.trim() ? fields.group_chat_prompt : DEFAULT_CHAT_PROMPTS.group_chat_prompt,
      private_chat_prompts: fields.private_chat_prompts?.trim() ? fields.private_chat_prompts : DEFAULT_CHAT_PROMPTS.private_chat_prompts,
      multiple_reply_style: fields.multiple_reply_style ?? [],
      multiple_probability: fields.multiple_probability ?? 0,
    },
  }, null, 2);
  return text;
}

// Source-file imports and in-progress drafts may be partial. They still share
// the final export budget, including chat defaults, without inventing a persona.
export function personalityJsonLength(item: Pick<PromptItem, "title" | "fields">): number {
  return serializePersonality(item).length;
}

/** Export complete public personalities; historical partial works stay readable. */
export function toPersonalityJson(item: Pick<PromptItem, "title" | "fields">): string {
  const error = requiredPersonalityError(item.fields);
  if (error) throw new Error(error);
  const text = serializePersonality(item);
  if (text.length > MAX_PERSONALITY_JSON_LENGTH) throw new Error(PERSONALITY_JSON_LIMIT_ERROR);
  return text;
}
