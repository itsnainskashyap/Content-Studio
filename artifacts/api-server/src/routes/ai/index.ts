import { Router, type IRouter, type Request, type Response } from "express";
import {
  GenerateStoryBody,
  GenerateStoryResponse,
  ContinueStoryBody,
  ContinueStoryResponse,
  GenerateVideoPromptsBody,
  GenerateVideoPromptsResponse,
  EditVideoPromptsBody,
  EditVideoPromptsResponse,
  GenerateMusicBriefBody,
  GenerateMusicBriefResponse,
  GenerateVoiceoverBody,
  GenerateVoiceoverResponse,
} from "@workspace/api-zod";
import { logger } from "../../lib/logger";
import {
  generateJson,
  type ValidationFailure,
  type FinalRecover,
} from "./llm";
import {
  STORY_SYSTEM_PROMPT,
  CONTINUE_STORY_SYSTEM_PROMPT,
  VIDEO_PROMPTS_SYSTEM_PROMPT,
  EDIT_VIDEO_PART_SYSTEM_PROMPT,
  MUSIC_BRIEF_SYSTEM_PROMPT,
  VOICEOVER_SYSTEM_PROMPT,
} from "./prompts";

const router: IRouter = Router();

interface ZodIssueLike {
  path: Array<string | number>;
  message: string;
}
interface ZodErrorLike {
  issues: ZodIssueLike[];
}

function formatZodError(err: ZodErrorLike): string {
  return err.issues
    .map((i) => {
      const path = i.path.length ? i.path.join(".") : "(body)";
      return `${path}: ${i.message}`;
    })
    .join("; ");
}

function handleError(res: Response, label: string, err: unknown) {
  logger.error({ err, label }, "AI route error");
  const message = err instanceof Error ? err.message : "Unknown server error";
  res.status(500).json({ error: message });
}

// Relaxed safety range for the all-in-one Seedance prompt. The strict
// 4200-4500 char band has been retired — the new prompt embeds dialogue,
// BGM cues, lip-sync directives and per-shot SFX. With the skill-mandated
// shot counts (8-14 shots for a 15s part, 12-20 shots for 30s, etc.), the
// per-shot detail multiplied by shot count produces roughly 12000-26000
// chars for typical 15-30s parts. These bounds only catch pathological
// responses (truncated stub or runaway megaprompt), NOT the normal range.
const COPYABLE_PROMPT_MIN = 5000;
const COPYABLE_PROMPT_MAX = 28000;

function validateCopyablePromptLength(result: {
  copyablePrompt: string;
}): ValidationFailure | null {
  const len = result.copyablePrompt.length;
  if (len >= COPYABLE_PROMPT_MIN && len <= COPYABLE_PROMPT_MAX) return null;
  if (len > COPYABLE_PROMPT_MAX) {
    const overBy = len - COPYABLE_PROMPT_MAX;
    return {
      reason: `copyablePrompt was ${len} chars (max ${COPYABLE_PROMPT_MAX})`,
      retryInstruction: `LENGTH SAFETY — your previous copyablePrompt was ${len} characters, ${overBy} characters OVER the safety ceiling of ${COPYABLE_PROMPT_MAX}. The prompt is rambling. Rewrite the JSON now with the SAME structure (all 4 [BRACKET] header lines, all 6 mandatory sections in canonical order, all the same shots, 7 bullets per shot) but with TIGHTER prose: trim hype words and adjectives, merge repetitive sentences, and shorten any bullet that has more than one core idea. DO NOT drop shots — keep the same number of shots. Aim for somewhere in the 12000-22000 char range. Return ONLY the JSON, no prose.`,
    };
  }
  const underBy = COPYABLE_PROMPT_MIN - len;
  return {
    reason: `copyablePrompt was ${len} chars (min ${COPYABLE_PROMPT_MIN})`,
    retryInstruction: `LENGTH SAFETY — your previous copyablePrompt was ${len} characters, ${underBy} characters UNDER the safety floor of ${COPYABLE_PROMPT_MIN}. The prompt is too thin to be the all-in-one Seedance prompt the user asked for. Rewrite the JSON now with the SAME structure but FILL OUT every shot with concrete detail: explicit lens, exact speed %, transition mechanic, the actual dialogue line + lip-sync directive, the BGM beat sync + ambient bed + SFX. Make sure all 6 sections are present (## SHOT-BY-SHOT EFFECTS TIMELINE, ## MASTER EFFECTS INVENTORY, ## EFFECTS DENSITY MAP, ## ENERGY ARC, ## DIALOGUE & VOICEOVER, ## AUDIO DESIGN). Aim for 12000-22000 chars. Return ONLY the JSON, no prose.`,
  };
}

/**
 * Per the video-prompt-builder skill, shot counts are tied to part duration.
 * We only enforce the MINIMUM (skill mandates rapid-cut density); going over
 * is acceptable and just logged.
 */
function expectedShotRange(durationSec: number): [number, number] {
  if (durationSec <= 10) return [4, 7];
  if (durationSec <= 20) return [8, 14];
  if (durationSec <= 30) return [12, 20];
  // 30s+: scale linearly at ~0.5-0.7 shots per second.
  return [Math.ceil(durationSec * 0.5), Math.ceil(durationSec * 0.7)];
}

const REQUIRED_SECTIONS = [
  "## SHOT-BY-SHOT EFFECTS TIMELINE",
  "## MASTER EFFECTS INVENTORY",
  "## EFFECTS DENSITY MAP",
  "## ENERGY ARC",
  "## DIALOGUE & VOICEOVER",
  "## AUDIO DESIGN",
] as const;

const REQUIRED_BRACKET_HEADER = "[VISUAL STYLE";
const PART_BRACKET_HEADER = "[PART";

/**
 * Returns the first missing required-section name, or null if every
 * required section is present in canonical order.
 */
function findMissingSection(prompt: string): string | null {
  let cursor = 0;
  for (const heading of REQUIRED_SECTIONS) {
    const next = prompt.indexOf(heading, cursor);
    if (next < 0) return heading;
    cursor = next + heading.length;
  }
  return null;
}

/**
 * Single source of truth for the structural shape of a video-prompt
 * response. Used both by the live validator (which produces retry
 * instructions) and by the final-recovery filter (which silently rejects
 * malformed candidates). Returning the same predicate from both code
 * paths means recovery cannot accept anything the validator would have
 * rejected on shape grounds.
 *
 * Checks (in priority order):
 *  - [VISUAL STYLE: ...] header present
 *  - [PART: ...] header present
 *  - All 6 mandatory ## sections in canonical order
 *  - Per-shot bullet shape: each shot has at least one "• DIALOGUE:" and
 *    one "• AUDIO:" bullet. Per-shot DIALOGUE/AUDIO is the entire reason
 *    we embed audio inside copyablePrompt — without these bullets the
 *    paste-into-Seedance promise is broken.
 *  - Shot count within the skill's per-duration range (both bounds).
 */
type ShapeIssue = { code: string; message: string; retry: string };

function checkVideoPromptShape(
  result: { copyablePrompt: string; shots: ReadonlyArray<unknown> },
  durationSec: number,
): ShapeIssue | null {
  const [minShots, maxShots] = expectedShotRange(durationSec);
  const cp = result.copyablePrompt;

  if (cp.indexOf(REQUIRED_BRACKET_HEADER) < 0) {
    return {
      code: "missing-visual-style-header",
      message: "copyablePrompt missing [VISUAL STYLE ...] header",
      retry: `STRUCTURE — your previous copyablePrompt is missing the required "[VISUAL STYLE: ...]" bracket header line at the very top. Rewrite the JSON now with the same content but ensure copyablePrompt opens with all required header lines: [VISUAL STYLE: ...], [BACKGROUND MUSIC: ...] if BGM is enabled, [VOICEOVER: ...] if voiceover is enabled, then [PART: N of M | ...]. Then continue with all 6 mandatory ## sections in canonical order. Return ONLY the JSON, no prose.`,
    };
  }
  if (cp.indexOf(PART_BRACKET_HEADER) < 0) {
    return {
      code: "missing-part-header",
      message: "copyablePrompt missing [PART ...] header",
      retry: `STRUCTURE — your previous copyablePrompt is missing the required "[PART: N of M | ...]" bracket header line. Rewrite the JSON now keeping every shot and section but add the [PART: ${durationSec}s ...] line in the headers block at the top of copyablePrompt. Return ONLY the JSON, no prose.`,
    };
  }
  const missing = findMissingSection(cp);
  if (missing !== null) {
    return {
      code: "missing-section",
      message: `copyablePrompt missing "${missing}" section`,
      retry: `STRUCTURE — your previous copyablePrompt is missing the "${missing}" section (or it appears out of order). All 6 mandatory ## sections must appear in this exact order: ## SHOT-BY-SHOT EFFECTS TIMELINE, ## MASTER EFFECTS INVENTORY, ## EFFECTS DENSITY MAP, ## ENERGY ARC, ## DIALOGUE & VOICEOVER, ## AUDIO DESIGN. Rewrite the JSON now keeping every shot and the same prose detail but ensure all 6 sections appear in order. Return ONLY the JSON, no prose.`,
    };
  }

  const shotsCount = result.shots?.length ?? 0;
  if (shotsCount < minShots) {
    return {
      code: "too-few-shots",
      message: `only ${shotsCount} shots for a ${durationSec}s part (skill requires ${minShots}-${maxShots})`,
      retry: `SHOT-COUNT ENFORCEMENT — your previous response had only ${shotsCount} shots in shots[] for a ${durationSec}-second part. The video-prompt-builder skill REQUIRES at least ${minShots} shots (recommended range: ${minShots}-${maxShots}). The Seedance look depends on rapid cuts. Rewrite the JSON now with ${minShots}-${maxShots} shots, each 1-2 seconds long. Each shot must still carry all 7 bullets in copyablePrompt (EFFECT, visual, camera, speed/timing, transition, DIALOGUE, AUDIO). Update effectsInventory, densityMap, the per-shot SFX entries inside ## AUDIO DESIGN, and the per-shot dialogue entries inside ## DIALOGUE & VOICEOVER to match the new shot list. Keep all 6 ## sections and the 4 [BRACKET] headers. Return ONLY the JSON, no prose.`,
    };
  }
  if (shotsCount > maxShots) {
    return {
      code: "too-many-shots",
      message: `${shotsCount} shots for a ${durationSec}s part (skill ceiling is ${maxShots})`,
      retry: `SHOT-COUNT ENFORCEMENT — your previous response had ${shotsCount} shots in shots[] for a ${durationSec}-second part. The video-prompt-builder skill caps a ${durationSec}s part at ${maxShots} shots (range: ${minShots}-${maxShots}). Going over makes Seedance pacing feel hectic and breaks per-shot timing math. Consolidate or trim shots so the total is between ${minShots} and ${maxShots}. Each remaining shot must still carry all 7 bullets in copyablePrompt (EFFECT, visual, camera, speed/timing, transition, DIALOGUE, AUDIO). Update effectsInventory, densityMap, the per-shot SFX entries inside ## AUDIO DESIGN, and the per-shot dialogue entries inside ## DIALOGUE & VOICEOVER to match the new shot list. Keep all 6 ## sections and the 4 [BRACKET] headers. Return ONLY the JSON, no prose.`,
    };
  }

  // Per-shot bullet shape: each shot needs at least one DIALOGUE and one
  // AUDIO line. We count global occurrences inside copyablePrompt — a
  // strictly correct count proves every shot block has the embedded
  // audio that makes the Seedance paste-and-go promise hold.
  const dialogueBullets = (cp.match(/^•\s*DIALOGUE:/gm) || []).length;
  const audioBullets = (cp.match(/^•\s*AUDIO:/gm) || []).length;
  if (dialogueBullets < shotsCount) {
    return {
      code: "missing-dialogue-bullets",
      message: `only ${dialogueBullets} • DIALOGUE: bullets for ${shotsCount} shots`,
      retry: `PER-SHOT EMBEDDED AUDIO — your previous copyablePrompt has only ${dialogueBullets} "• DIALOGUE:" bullets but ${shotsCount} shots. Every shot block in ## SHOT-BY-SHOT EFFECTS TIMELINE must include a "• DIALOGUE:" bullet (use "• DIALOGUE: (silent)" for shots with no spoken line) AND a "• AUDIO:" bullet. This is what lets Seedance render embedded voice + SFX from a single paste. Rewrite the JSON now keeping every shot and section but ensure each shot has both DIALOGUE and AUDIO bullets in the prescribed 7-bullet order. Return ONLY the JSON, no prose.`,
    };
  }
  if (audioBullets < shotsCount) {
    return {
      code: "missing-audio-bullets",
      message: `only ${audioBullets} • AUDIO: bullets for ${shotsCount} shots`,
      retry: `PER-SHOT EMBEDDED AUDIO — your previous copyablePrompt has only ${audioBullets} "• AUDIO:" bullets but ${shotsCount} shots. Every shot block in ## SHOT-BY-SHOT EFFECTS TIMELINE must include a "• AUDIO:" bullet describing the per-shot SFX and BGM cue, and a "• DIALOGUE:" bullet (use "(silent)" if no line). This is what makes the Seedance paste produce a complete audio-visual scene. Rewrite the JSON now keeping every shot and section but ensure each shot has both DIALOGUE and AUDIO bullets in the prescribed 7-bullet order. Return ONLY the JSON, no prose.`,
    };
  }

  return null;
}

/**
 * Build a validator that runs the length safety check first (cheap to
 * verify, retry instructions are length-specific) and then the unified
 * shape predicate.
 */
function makeVideoPromptValidator(
  durationSec: number,
  label: string,
): (result: {
  copyablePrompt: string;
  shots: ReadonlyArray<unknown>;
}) => ValidationFailure | null {
  return (result) => {
    const lenFailure = validateCopyablePromptLength(result);
    if (lenFailure) return lenFailure;
    const shape = checkVideoPromptShape(result, durationSec);
    if (shape) {
      return {
        reason: `${label}: ${shape.message}`,
        retryInstruction: shape.retry,
      };
    }
    return null;
  };
}

/**
 * Build a final-attempt fallback when validation retries don't all pass.
 * Every recovered candidate must pass the SAME unified shape predicate
 * the validator uses (`checkVideoPromptShape`) — that means required
 * bracket headers, all 6 ## sections in canonical order, per-shot
 * DIALOGUE/AUDIO bullets, and a shot count inside the skill's range.
 * Recovery never accepts something the validator would have rejected.
 *
 *  1. If any retry lands in the safety range AND is fully shape-compliant,
 *     use it (closest to TARGET wins).
 *  2. Else, accept the closest-to-range fully shape-compliant candidate,
 *     but only if it's within 1500 chars of the safety range (i.e.
 *     between 3500 and 29500 chars). Anything further is too malformed
 *     to silently ship.
 *  3. As a last resort, truncate the smallest-overshoot attempt at a line
 *     boundary, but only if the truncated prompt still passes the full
 *     shape predicate after the cut.
 *  4. If nothing meets these bars, return null so generateJson surfaces a
 *     clean error to the caller.
 */
function makeRecoverCopyablePrompt(
  durationSec: number,
  label: string,
): FinalRecover<{ copyablePrompt: string; shots: ReadonlyArray<unknown> }> {
  return (attempts) => {
    const TARGET = Math.round((COPYABLE_PROMPT_MIN + COPYABLE_PROMPT_MAX) / 2);
    type Cand = {
      result: { copyablePrompt: string; shots: ReadonlyArray<unknown> };
      len: number;
      overshoot: number;
      undershoot: number;
      shotsCount: number;
      inSafetyRange: boolean;
      shapeOk: boolean;
    };
    const cands: Cand[] = attempts.map(({ result }) => {
      const len = result.copyablePrompt.length;
      const shotsCount = result.shots?.length ?? 0;
      return {
        result,
        len,
        overshoot: Math.max(0, len - COPYABLE_PROMPT_MAX),
        undershoot: Math.max(0, COPYABLE_PROMPT_MIN - len),
        shotsCount,
        inSafetyRange:
          len >= COPYABLE_PROMPT_MIN && len <= COPYABLE_PROMPT_MAX,
        shapeOk: checkVideoPromptShape(result, durationSec) === null,
      };
    });

    // 1. In safety range AND fully shape-compliant. Closest to TARGET wins.
    const inRange = cands
      .filter((c) => c.inSafetyRange && c.shapeOk)
      .sort((a, b) => Math.abs(TARGET - a.len) - Math.abs(TARGET - b.len));
    if (inRange[0]) {
      logger.warn(
        { label, len: inRange[0].len, shots: inRange[0].shotsCount },
        "Recovered: in-safety-range candidate from earlier attempt",
      );
      return inRange[0].result;
    }

    // 2. Fully shape-compliant but slightly outside the length safety
    //    range. Tolerance: 1500 chars (so 3500–29500). Overshoot is
    //    penalised 2x undershoot — a short-but-complete prompt is more
    //    useful than a runaway one.
    const TOLERANCE = 1500;
    const scored = cands
      .filter((c) => c.shapeOk)
      .map((c) => ({ c, dist: c.overshoot * 2 + c.undershoot }))
      .sort((a, b) => a.dist - b.dist);
    if (scored[0] && scored[0].dist <= TOLERANCE) {
      logger.warn(
        {
          label,
          len: scored[0].c.len,
          shots: scored[0].c.shotsCount,
          overshoot: scored[0].c.overshoot,
          undershoot: scored[0].c.undershoot,
        },
        "Recovered: closest-to-range fully shape-compliant candidate",
      );
      return scored[0].c.result;
    }

    // 3. Last-resort truncation, only when the truncated prompt still
    //    passes the unified shape check (sections + headers + per-shot
    //    DIALOGUE/AUDIO bullets + shot count). Truncation typically
    //    drops the tail, so passing the predicate after the cut is the
    //    only safe acceptance criterion.
    const overshooters = cands
      .filter((c) => c.overshoot > 0)
      .sort((a, b) => a.len - b.len);
    for (const c of overshooters) {
      const slice = c.result.copyablePrompt.slice(0, COPYABLE_PROMPT_MAX);
      const lastBreak = slice.lastIndexOf("\n");
      const cut =
        lastBreak >= COPYABLE_PROMPT_MIN ? slice.slice(0, lastBreak) : slice;
      const truncated = { ...c.result, copyablePrompt: cut };
      if (checkVideoPromptShape(truncated, durationSec) === null) {
        logger.warn(
          {
            label,
            originalLen: c.len,
            recoveredLen: cut.length,
            shots: c.shotsCount,
          },
          "Recovered: truncated over-length attempt while preserving full shape",
        );
        return truncated;
      }
    }

    return null;
  };
}

function describePreviousParts(previousParts: string[] | undefined): string {
  if (!previousParts || previousParts.length === 0) return "";
  return `\nALREADY-GENERATED PARTS (full memory of what was already shown — do NOT repeat shots, voiceover lines, or signature beats; build on what came before):\n${previousParts
    .map((p, i) => `--- Part ${i + 1} digest ---\n${p}`)
    .join("\n\n")}\n`;
}

const GenerateVideoPromptsBodyChecked = GenerateVideoPromptsBody.refine(
  (v) => v.part <= v.totalParts,
  { message: "part must be <= totalParts", path: ["part"] },
);

function describeStory(story: {
  title: string;
  synopsis: string;
  acts: Array<{
    actNumber: number;
    title: string;
    description: string;
    keyMoment: string;
  }>;
  characters: Array<{ name: string; description: string }>;
  mood: string;
  colorPalette: string[];
  musicSuggestion: string;
}): string {
  return `Title: ${story.title}
Synopsis: ${story.synopsis}
Mood: ${story.mood}
Color palette: ${story.colorPalette.join(", ")}
Music suggestion: ${story.musicSuggestion}

Characters:
${story.characters.map((c) => `- ${c.name}: ${c.description}`).join("\n")}

Acts:
${story.acts
  .map(
    (a) =>
      `Act ${a.actNumber} — ${a.title}\n  Description: ${a.description}\n  Key moment: ${a.keyMoment}`,
  )
  .join("\n")}`;
}

router.post("/generate-story", async (req: Request, res: Response) => {
  const parsed = GenerateStoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  const {
    brief,
    genre,
    duration,
    totalDurationSeconds,
    partsCount,
    style,
    voiceoverLanguage,
  } = parsed.data;
  const totalDur = totalDurationSeconds ?? duration;
  const parts = partsCount ?? Math.max(1, Math.ceil(totalDur / 15));
  const userPrompt = `Create a structured cinematic story from the following brief.

BRIEF:
${brief}

GENRE: ${genre}
TOTAL DURATION: ${totalDur} seconds
PARTS COUNT: ${parts} (the video will be ${parts} parts of ~15 seconds each — structure your acts so they map cleanly to that)
STYLE: ${style ?? "(creator has not picked a style yet — keep it style-agnostic)"}
VOICEOVER LANGUAGE: ${voiceoverLanguage ?? "none"}

Output the structured story as JSON.`;

  try {
    const result = await generateJson({
      systemPrompt: STORY_SYSTEM_PROMPT,
      userPrompt,
      schema: GenerateStoryResponse,
      label: "generate-story",
    });
    res.json(result);
  } catch (err) {
    handleError(res, "generate-story", err);
  }
});

router.post("/continue-story", async (req: Request, res: Response) => {
  const parsed = ContinueStoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  const { existingStory, direction } = parsed.data;
  const userPrompt = `Apply the writer's instruction to the existing story. Honor the instruction LITERALLY — append, refine a specific act, change a character, change tone/mood/title/synopsis, full rewrite, or fix a single detail. Preserve any field the writer did not mention. Return the COMPLETE updated story as JSON with sequential actNumber values starting at 1.

EXISTING STORY:
${describeStory(existingStory)}

WRITER'S INSTRUCTION:
${direction}

Output the full updated story as JSON.`;

  try {
    const result = await generateJson({
      systemPrompt: CONTINUE_STORY_SYSTEM_PROMPT,
      userPrompt,
      schema: ContinueStoryResponse,
      label: "continue-story",
    });
    res.json(result);
  } catch (err) {
    handleError(res, "continue-story", err);
  }
});

router.post(
  "/generate-video-prompts",
  async (req: Request, res: Response) => {
    const parsed = GenerateVideoPromptsBodyChecked.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: formatZodError(parsed.error) });
      return;
    }
    const {
      story,
      style,
      duration,
      part,
      totalParts,
      previousLastFrame,
      previousParts,
      voiceoverLanguage,
      voiceoverTone,
      voiceoverScript,
      bgmStyle,
      bgmTempo,
      bgmInstruments,
    } = parsed.data;

    const audioBlock: string[] = [];
    if (voiceoverLanguage) {
      audioBlock.push(
        `- Voiceover language: ${voiceoverLanguage}` +
          (voiceoverTone ? ` (tone: ${voiceoverTone})` : "") +
          (voiceoverScript
            ? `\n  Use this pre-written script verbatim, distributing its lines across the per-shot DIALOGUE bullets and re-stating the full script in the ## DIALOGUE & VOICEOVER section: ${voiceoverScript}`
            : `\n  No script provided — AUTO-WRITE the dialogue per shot. Embed it inside copyablePrompt: per-shot DIALOGUE bullet (with character + language tag + lip-sync directive) AND a top-level ## DIALOGUE & VOICEOVER section listing every line. Also extract the same spoken text as a plain readable string into autoVoiceoverScript for the UI's voiceover panel.`) +
          `\n  REMINDER: Seedance 2.0 GENERATES dialogue + lip-sync at video-generation time, so the dialogue MUST be embedded in copyablePrompt. autoVoiceoverScript is only a UI convenience field — never the only place dialogue lives.`,
      );
    } else {
      audioBlock.push(
        `- Voiceover: NOT included. autoVoiceoverScript = null, audioSummary.voiceoverIncluded = false. The [VOICEOVER: ...] header line is omitted from copyablePrompt; per-shot DIALOGUE bullets all read "(silent — ambient only)"; the ## DIALOGUE & VOICEOVER section says exactly: "No voiceover for this part — ambient sound only."`,
      );
    }
    if (bgmStyle) {
      audioBlock.push(
        `- Background music: ${bgmStyle}` +
          (bgmTempo ? ` (${bgmTempo})` : "") +
          (bgmInstruments && bgmInstruments.length
            ? ` — instruments: ${bgmInstruments.join(", ")}`
            : "") +
          `\n  Embed the BGM cues inside copyablePrompt: include the [BACKGROUND MUSIC: ...] header, the per-shot AUDIO bullet (with the BGM beat at that moment), and a BGM TRACK + BGM SYNC MAP block inside ## AUDIO DESIGN. Seedance generates the music itself; the prompt must give it explicit beat-sync points.`,
      );
    } else {
      audioBlock.push(
        `- Background music: NOT included. Omit the [BACKGROUND MUSIC: ...] header line and the BGM TRACK / BGM SYNC MAP block inside ## AUDIO DESIGN — keep only AMBIENT BED and SFX. audioSummary.bgmIncluded = false.`,
      );
    }

    const userPrompt = `Generate Seedance 2.0 video prompts for ONE part of a multi-part video.

STORY (full context for all parts):
${describeStory(story)}
${describePreviousParts(previousParts)}
THIS PART:
- Part number: ${part} of ${totalParts}
- Duration of this part: ${duration} seconds (build shots whose timestamps sum to roughly this duration)
- Style: ${style}
${previousLastFrame ? `- Previous part ended on this frame (the FIRST shot of this part must continue from it):\n  ${previousLastFrame}` : "- This is the FIRST part — no previous frame to continue from."}

AUDIO FOR THIS PART:
${audioBlock.join("\n")}

Output the JSON described in the system prompt.`;

    try {
      const result = await generateJson({
        systemPrompt: VIDEO_PROMPTS_SYSTEM_PROMPT,
        userPrompt,
        schema: GenerateVideoPromptsResponse,
        label: "generate-video-prompts",
        validate: makeVideoPromptValidator(duration, "generate-video-prompts"),
        finalRecover: makeRecoverCopyablePrompt(
          duration,
          "generate-video-prompts",
        ),
      });
      res.json(result);
    } catch (err) {
      handleError(res, "generate-video-prompts", err);
    }
  },
);

router.post(
  "/edit-video-prompts",
  async (req: Request, res: Response) => {
    const parsed = EditVideoPromptsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const {
      story,
      style,
      duration,
      part,
      totalParts,
      instruction,
      existingPart,
      previousLastFrame,
      previousParts,
      nextFirstShot,
      voiceoverLanguage,
      voiceoverTone,
      voiceoverScript,
      bgmStyle,
      bgmTempo,
      bgmInstruments,
    } = parsed.data;

    const audioBlock: string[] = [];
    if (voiceoverLanguage && voiceoverLanguage !== "none") {
      audioBlock.push(
        `- Voiceover language: ${voiceoverLanguage}` +
          (voiceoverTone ? ` (tone: ${voiceoverTone})` : "") +
          (voiceoverScript
            ? `\n  Use this pre-written script verbatim, distributing its lines across the per-shot DIALOGUE bullets and re-stating it in the ## DIALOGUE & VOICEOVER section: ${voiceoverScript}`
            : `\n  No script provided — keep / refresh the dialogue per shot inside copyablePrompt: per-shot DIALOGUE bullet (with character + language tag + lip-sync directive) AND a top-level ## DIALOGUE & VOICEOVER section. Also extract the spoken text into autoVoiceoverScript for the UI.`) +
          `\n  REMINDER: Seedance 2.0 GENERATES dialogue + lip-sync at video-generation time, so the dialogue MUST be embedded in copyablePrompt. autoVoiceoverScript is only a UI convenience field.`,
      );
    } else {
      audioBlock.push(
        `- Voiceover: NOT included. autoVoiceoverScript = null. Omit the [VOICEOVER: ...] header; per-shot DIALOGUE bullets read "(silent — ambient only)"; the ## DIALOGUE & VOICEOVER section says exactly: "No voiceover for this part — ambient sound only."`,
      );
    }
    if (bgmStyle) {
      audioBlock.push(
        `- Background music: ${bgmStyle}` +
          (bgmTempo ? ` (${bgmTempo})` : "") +
          (bgmInstruments && bgmInstruments.length
            ? ` — instruments: ${bgmInstruments.join(", ")}`
            : "") +
          `\n  Embed the BGM cues inside copyablePrompt: [BACKGROUND MUSIC: ...] header, per-shot AUDIO bullet, and a BGM TRACK + BGM SYNC MAP block inside ## AUDIO DESIGN.`,
      );
    } else {
      audioBlock.push(
        `- Background music: NOT included. Omit the [BACKGROUND MUSIC: ...] header and the BGM TRACK / BGM SYNC MAP block inside ## AUDIO DESIGN — keep only AMBIENT BED and SFX.`,
      );
    }

    const userPrompt = `Refine ONE existing part of a multi-part Seedance 2.0 video. Apply the writer's instruction LITERALLY. Preserve continuity to the surrounding parts per the rules in the system prompt.

STORY (full context for all parts):
${describeStory(story)}
${describePreviousParts(previousParts)}
THIS PART:
- Part number: ${part} of ${totalParts}
- Duration of this part: ${duration} seconds (keep the refined part roughly the same total duration)
- Style: ${style}
${previousLastFrame ? `- ENTRY CONTINUITY — the previous part ended on this frame; the FIRST shot of the refined part must continue from it (unless the writer's instruction explicitly retargets the opening):\n  ${previousLastFrame}` : "- This is the FIRST part — no entry frame to continue from."}
${nextFirstShot ? `- EXIT CONTINUITY — the NEXT part has already been generated. Its first shot is:\n  ${nextFirstShot}\n  Your refined lastFrameDescription MUST end in a state that allows that next shot to enter seamlessly.` : "- This is the FINAL part — no next-shot constraint on lastFrameDescription."}

AUDIO FOR THIS PART:
${audioBlock.join("\n")}

EXISTING PART (the JSON the writer is refining — preserve everything they did NOT mention):
${JSON.stringify(existingPart)}

WRITER'S INSTRUCTION (apply LITERALLY, this is the only thing that should change unless side-effects are unavoidable):
${instruction}

Output the COMPLETE refined VideoPromptsResponse JSON.`;

    try {
      const result = await generateJson({
        systemPrompt: EDIT_VIDEO_PART_SYSTEM_PROMPT,
        userPrompt,
        schema: EditVideoPromptsResponse,
        label: "edit-video-prompts",
        validate: makeVideoPromptValidator(duration, "edit-video-prompts"),
        finalRecover: makeRecoverCopyablePrompt(duration, "edit-video-prompts"),
      });
      res.json(result);
    } catch (err) {
      handleError(res, "edit-video-prompts", err);
    }
  },
);

router.post("/generate-music-brief", async (req: Request, res: Response) => {
  const parsed = GenerateMusicBriefBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  const { story, style, mood, duration, language, energyLevel, tempo, totalParts } =
    parsed.data;

  const userPrompt = `Create a music brief that scores the following video.

STORY:
${describeStory(story)}

VIDEO SETTINGS:
- Visual style: ${style}
- Override mood (creator-specified): ${mood}
- Total duration: ${duration} seconds
- Language / cultural context: ${language}
- Energy level (1=calm, 10=explosive): ${energyLevel ?? "(not specified — pick a fitting energy)"}
- Tempo bucket: ${tempo ?? "(not specified — pick a fitting tempo)"}
- Total video parts: ${totalParts ?? 1} (provide one partBreakdown entry per part)

Output the music brief as JSON. The sunoPrompt MUST follow Suno's bracketed tag format.`;

  try {
    const result = await generateJson({
      systemPrompt: MUSIC_BRIEF_SYSTEM_PROMPT,
      userPrompt,
      schema: GenerateMusicBriefResponse,
      label: "generate-music-brief",
    });
    res.json(result);
  } catch (err) {
    handleError(res, "generate-music-brief", err);
  }
});

router.post("/generate-voiceover", async (req: Request, res: Response) => {
  const parsed = GenerateVoiceoverBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  const { story, style, language, tone, duration, part, pace } = parsed.data;

  const userPrompt = `Write a voiceover script in ${language.toUpperCase()} for ONE part of the following video.

STORY (full context):
${describeStory(story)}

THIS PART:
- Part number: ${part}
- Duration: ${duration} seconds
- Visual style: ${style ?? "(not specified)"}
- Tone: ${tone}
- Pace: ${pace ?? "normal"}

Output the voiceover as JSON. Remember: if language is "hindi", write the script and copyableScript in Devanagari. If "hinglish", use natural code-switched Hindi-English with Hindi in Roman script.`;

  try {
    const result = await generateJson({
      systemPrompt: VOICEOVER_SYSTEM_PROMPT,
      userPrompt,
      schema: GenerateVoiceoverResponse,
      label: "generate-voiceover",
    });
    res.json(result);
  } catch (err) {
    handleError(res, "generate-voiceover", err);
  }
});

export default router;
