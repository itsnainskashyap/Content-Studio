import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../../lib/logger";

const MODEL = "claude-opus-4-5";
const MAX_TOKENS = 4096;

export async function generateJson<T>(args: {
  systemPrompt: string;
  userPrompt: string;
  schema: { parse: (input: unknown) => T };
  label: string;
}): Promise<T> {
  const { systemPrompt, userPrompt, schema, label } = args;

  const attempt = async (extraSystem?: string): Promise<T> => {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: extraSystem ? `${systemPrompt}\n\n${extraSystem}` : systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

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
    logger.warn(
      { label, err: (firstErr as Error).message },
      "First-pass LLM JSON failed; retrying with strict reminder",
    );
    try {
      return await attempt(
        "REMINDER: Return ONLY a single valid JSON object exactly matching the schema described above. Do not include markdown fences, comments, or any prose. The previous attempt failed parsing or validation.",
      );
    } catch (secondErr) {
      logger.error(
        {
          label,
          firstErr: (firstErr as Error).message,
          secondErr: (secondErr as Error).message,
        },
        "LLM JSON generation failed after retry",
      );
      throw new Error(
        `Generation failed for ${label}. The model returned an invalid response. Please try again.`,
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
