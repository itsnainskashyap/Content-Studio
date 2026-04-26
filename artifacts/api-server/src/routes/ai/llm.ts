import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../../lib/logger";

const MODEL = "claude-sonnet-4-6";
// Per-route max output token budget. The video-prompts JSON has a strict
// copyablePrompt size of 4200-4500 chars (~1500-2000 tokens) plus the
// structured shots / effectsInventory / densityMap / energyArc fields
// (~1500 tokens) plus an autoVoiceoverScript that can be HEAVY in
// Devanagari (Hindi) where each character costs ~2x the tokens of English
// — a 90s Hindi VO can easily reach 1500+ tokens by itself. Realistic
// worst-case output is ~5.5-7.5K tokens, so we cap at 12000 for safe ~2x
// headroom. The cap doesn't affect latency — actual generation time
// scales with tokens produced, not with the cap. The latency win comes
// from the strict 4200-4500 char copyablePrompt rule baked into the
// system prompt, which keeps the model from rambling.
const DEFAULT_MAX_TOKENS = 8192;
const VIDEO_PROMPTS_MAX_TOKENS = 12000;

function maxTokensForLabel(label: string): number {
  if (label === "generate-video-prompts") return VIDEO_PROMPTS_MAX_TOKENS;
  if (label === "edit-video-prompts") return VIDEO_PROMPTS_MAX_TOKENS;
  return DEFAULT_MAX_TOKENS;
}

export type ValidationFailure = {
  /** Human-readable reason the result is unacceptable. */
  reason: string;
  /** Extra system-side instruction appended for the next retry. */
  retryInstruction: string;
};

export async function generateJson<T>(args: {
  systemPrompt: string;
  userPrompt: string;
  schema: { parse: (input: unknown) => T };
  label: string;
  /**
   * Optional post-parse validator. Return null if the result is acceptable, or
   * a ValidationFailure to trigger a retry with a targeted instruction. Used
   * by video-prompts to enforce the strict 4200-4500 char copyablePrompt band
   * even when the model ignores the system prompt's word limit.
   */
  validate?: (result: T) => ValidationFailure | null;
}): Promise<T> {
  const { systemPrompt, userPrompt, schema, label, validate } = args;
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
    const result = schema.parse(parsed);

    if (validate) {
      let failure: ValidationFailure | null;
      try {
        failure = validate(result);
      } catch (validatorErr) {
        // A throw from `validate` itself indicates a bug in OUR validation
        // code, not in the model output. Surface it immediately rather than
        // burning more LLM calls on a request that will never succeed.
        const msg =
          validatorErr instanceof Error
            ? validatorErr.message
            : "unknown validator error";
        throw new ValidatorBugError(
          `Internal validator threw for ${label}: ${msg}`,
        );
      }
      if (failure) {
        throw new ValidationRetryError(failure);
      }
    }

    return result;
  };

  // We allow up to 3 attempts (initial + 2 retries) so a length-band
  // violation has two chances to self-correct with explicit feedback before
  // we give up.
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;
  let lastValidationFailure: ValidationFailure | null = null;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      let extra: string | undefined;
      if (i > 0) {
        const prevMsg = (lastErr as Error)?.message ?? "";
        if (lastValidationFailure) {
          extra = lastValidationFailure.retryInstruction;
        } else if (prevMsg.includes("truncated")) {
          extra =
            "REMINDER: Your previous response was cut off because it was too long. Be MORE CONCISE this time — keep descriptions tight, drop any redundancy, but still return ONLY a single complete valid JSON object exactly matching the schema. No markdown fences, no comments, no prose.";
        } else {
          extra =
            "REMINDER: Return ONLY a single valid JSON object exactly matching the schema described above. Do not include markdown fences, comments, or any prose. The previous attempt failed parsing or validation.";
        }
        logger.warn(
          { label, attempt: i + 1, reason: lastValidationFailure?.reason ?? prevMsg },
          "Retrying LLM call with corrective instruction",
        );
      }
      return await attempt(extra);
    } catch (err) {
      // A bug in our own validator code is non-recoverable — bail out
      // immediately so we don't burn more model calls on a request that
      // will never pass validation.
      if (err instanceof ValidatorBugError) {
        logger.error({ label, err: err.message }, "Validator bug — aborting");
        throw err;
      }
      lastErr = err;
      lastValidationFailure =
        err instanceof ValidationRetryError ? err.failure : null;
    }
  }

  const finalMsg = (lastErr as Error)?.message ?? "unknown error";
  logger.error(
    { label, finalErr: finalMsg },
    "LLM JSON generation failed after all retries",
  );

  if (lastValidationFailure) {
    throw new Error(
      `Generation failed for ${label}: ${lastValidationFailure.reason}. Please try again.`,
    );
  }
  const truncated = finalMsg.includes("truncated");
  throw new Error(
    truncated
      ? `Generation failed for ${label}: the AI's response was too long and got cut off. Try a shorter story or fewer shots per part, then try again.`
      : `Generation failed for ${label}. The model returned an invalid response. Please try again.`,
  );
}

class ValidationRetryError extends Error {
  failure: ValidationFailure;
  constructor(failure: ValidationFailure) {
    super(failure.reason);
    this.name = "ValidationRetryError";
    this.failure = failure;
  }
}

class ValidatorBugError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidatorBugError";
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
