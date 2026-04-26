import { anthropic } from "@workspace/integrations-anthropic-ai";
import { logger } from "../../lib/logger";

const MODEL = "claude-sonnet-4-6";
// Per-route max output token budget. The all-in-one Seedance video-prompts
// JSON has a relaxed copyablePrompt size of ~5000-28000 chars
// (typically 12000-22000 for a 15s part — embeds 7-bullet shots with
// dialogue + audio, plus the ## DIALOGUE & VOICEOVER and ## AUDIO DESIGN
// sections). That's ~3000-5000 tokens just for copyablePrompt. Plus the
// structured shots / effectsInventory / densityMap / energyArc fields
// (~1500-2500 tokens) plus an autoVoiceoverScript that can be HEAVY in
// Devanagari/Hinglish (each Devanagari char costs ~2x the tokens of
// English — a 90s Hindi VO can easily reach 1500+ tokens by itself).
// Realistic worst-case output is ~12-16K tokens (a 28K-char copyablePrompt
// is ~7K tokens, plus ~2-3K tokens for the structured shots / inventory /
// densityMap / energyArc, plus an autoVoiceoverScript), so we cap at
// 20000 to give comfortable headroom. The cap doesn't affect latency —
// actual generation time scales with tokens produced, not with the cap.
const DEFAULT_MAX_TOKENS = 8192;
const VIDEO_PROMPTS_MAX_TOKENS = 20000;

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

/**
 * Allows a route to recover from final validation failure by post-processing
 * the model's attempts (e.g. picking the closest-to-band copyablePrompt
 * across retries). If present and it returns a non-null value, that value is
 * returned to the caller instead of throwing. Receives every parsed-but-
 * failed attempt in chronological order alongside the last validation
 * failure.
 */
export type FinalRecover<T> = (
  attempts: Array<{ result: T; failure: ValidationFailure }>,
) => T | null;

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
  /**
   * Optional final-attempt recovery. After all validation retries are
   * exhausted, this is called with the last parsed result and the last
   * validation failure. If it returns a value, that value is returned to
   * the caller; otherwise a generation-failed error is thrown. Used by
   * video-prompts to fall back to truncating an over-length copyablePrompt
   * rather than failing the whole request.
   */
  finalRecover?: FinalRecover<T>;
}): Promise<T> {
  const { systemPrompt, userPrompt, schema, label, validate, finalRecover } =
    args;
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
        throw new ValidationRetryError(failure, result);
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
  const validationAttempts: Array<{ result: T; failure: ValidationFailure }> = [];

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
      if (err instanceof ValidationRetryError) {
        lastValidationFailure = err.failure;
        validationAttempts.push({
          result: err.result as T,
          failure: err.failure,
        });
      } else {
        lastValidationFailure = null;
      }
    }
  }

  const finalMsg = (lastErr as Error)?.message ?? "unknown error";
  logger.error(
    { label, finalErr: finalMsg },
    "LLM JSON generation failed after all retries",
  );

  // Try recovery whenever earlier attempts produced parsed-but-failed
  // candidates, even if the LAST attempt failed for a different reason
  // (e.g. truncation or invalid JSON). Otherwise we'd discard usable
  // candidates just because the model's final retry happened to be a
  // different kind of failure.
  if (finalRecover && validationAttempts.length > 0) {
    const recovered = finalRecover(validationAttempts);
    if (recovered !== null) {
      logger.warn(
        {
          label,
          attemptCount: validationAttempts.length,
          finalErr: finalMsg,
        },
        "Recovered from validation failure via finalRecover",
      );
      return recovered;
    }
  }

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
  result: unknown;
  constructor(failure: ValidationFailure, result: unknown) {
    super(failure.reason);
    this.name = "ValidationRetryError";
    this.failure = failure;
    this.result = result;
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
