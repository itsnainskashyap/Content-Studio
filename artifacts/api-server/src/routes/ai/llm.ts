import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../../lib/logger";

const MODEL = "claude-sonnet-4-6";
// Per-route max output token budget. The video-prompts JSON has a strict
// copyablePrompt size of 4200-4500 chars (~1100-1500 tokens) plus the
// structured shots / effectsInventory / densityMap / energyArc / audio
// fields (~1000-1500 tokens). 6000 leaves ~2x headroom while keeping
// output (and therefore latency) much smaller than the previous 16k cap.
const DEFAULT_MAX_TOKENS = 8192;
const VIDEO_PROMPTS_MAX_TOKENS = 6000;

function maxTokensForLabel(label: string): number {
  if (label === "generate-video-prompts") return VIDEO_PROMPTS_MAX_TOKENS;
  if (label === "edit-video-prompts") return VIDEO_PROMPTS_MAX_TOKENS;
  return DEFAULT_MAX_TOKENS;
}

export async function generateJson<T>(args: {
  systemPrompt: string;
  userPrompt: string;
  schema: { parse: (input: unknown) => T };
  label: string;
}): Promise<T> {
  const { systemPrompt, userPrompt, schema, label } = args;
  const maxTokens = maxTokensForLabel(label);

  const attempt = async (extraSystem?: string): Promise<T> => {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: extraSystem ? `${systemPrompt}\n\n${extraSystem}` : systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    // If the model hit the output cap mid-response we'll have invalid JSON
    // — surface that as a distinct, actionable error instead of letting
    // JSON.parse blow up at a confusing position.
    if (message.stop_reason === "max_tokens") {
      throw new Error(
        `Model response was truncated at the ${maxTokens}-token output cap for ${label}. Increase max_tokens or shorten the request.`,
      );
    }

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Anthropic response did not contain a text block");
    }

    const raw = textBlock.text.trim();
    const jsonText = extractJson(raw);
    const parsed = JSON.parse(jsonText);
    return schema.parse(parsed);
  };

  try {
    return await attempt();
  } catch (firstErr) {
    const firstMsg = (firstErr as Error).message;
    logger.warn(
      { label, err: firstMsg },
      "First-pass LLM JSON failed; retrying with strict reminder",
    );
    // Tailor the retry reminder: if the first failure was truncation, ask
    // the model to be MORE CONCISE; otherwise nudge it to fix JSON shape.
    const reminder = firstMsg.includes("truncated")
      ? "REMINDER: Your previous response was cut off because it was too long. Be MORE CONCISE this time — keep descriptions tight, drop any redundancy, but still return ONLY a single complete valid JSON object exactly matching the schema. No markdown fences, no comments, no prose."
      : "REMINDER: Return ONLY a single valid JSON object exactly matching the schema described above. Do not include markdown fences, comments, or any prose. The previous attempt failed parsing or validation.";
    try {
      return await attempt(reminder);
    } catch (secondErr) {
      const secondMsg = (secondErr as Error).message;
      logger.error(
        { label, firstErr: firstMsg, secondErr: secondMsg },
        "LLM JSON generation failed after retry",
      );
      // Distinguish truncation from invalid JSON so the user sees a useful
      // message in the toast/error card instead of a generic one.
      const truncated =
        firstMsg.includes("truncated") || secondMsg.includes("truncated");
      throw new Error(
        truncated
          ? `Generation failed for ${label}: the AI's response was too long and got cut off twice in a row. Try a shorter story or fewer shots per part, then try again.`
          : `Generation failed for ${label}. The model returned an invalid response. Please try again.`,
      );
    }
  }
}

function extractJson(raw: string): string {
  const fenced = raw.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenced) {
    return fenced[1].trim();
  }
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }
  return raw;
}
