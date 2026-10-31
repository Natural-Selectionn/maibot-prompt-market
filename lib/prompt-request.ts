import { MAX_PROMPT_REQUEST_BYTES } from "./prompts.ts";

// Return null for oversized requests. Count received bytes before decoding so
// missing/inaccurate Content-Length headers cannot bypass the body limit.
export async function readPromptRequestText(request: Request): Promise<string | null> {
  if (Number(request.headers.get("content-length")) > MAX_PROMPT_REQUEST_BYTES) return null;
  if (!request.body) return "";
  const reader = request.body.getReader(), decoder = new TextDecoder();
  const parts: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_PROMPT_REQUEST_BYTES) {
        await reader.cancel().catch(() => {});
        return null;
      }
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join("");
  } finally {
    reader.releaseLock();
  }
}
