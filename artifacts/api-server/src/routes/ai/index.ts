import { Router, type IRouter, type Request, type Response } from "express";
import {
  GenerateStoryBody,
  GenerateStoryResponse,
  ContinueStoryBody,
  ContinueStoryResponse,
  GenerateVideoPromptsBody,
  GenerateVideoPromptsResponse,
  GenerateMusicBriefBody,
  GenerateMusicBriefResponse,
  GenerateVoiceoverBody,
  GenerateVoiceoverResponse,
} from "@workspace/api-zod";
import { logger } from "../../lib/logger";
import { generateJson } from "./llm";
import {
  STORY_SYSTEM_PROMPT,
  CONTINUE_STORY_SYSTEM_PROMPT,
  VIDEO_PROMPTS_SYSTEM_PROMPT,
  MUSIC_BRIEF_SYSTEM_PROMPT,
  VOICEOVER_SYSTEM_PROMPT,
} from "./prompts";

const router: IRouter = Router();

function handleError(res: Response, label: string, err: unknown) {
  logger.error({ err, label }, "AI route error");
  const message =
    err instanceof Error ? err.message : "Unknown server error";
  res.status(500).json({ error: message });
}

router.post("/generate-story", async (req: Request, res: Response) => {
  const parseResult = GenerateStoryBody.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.message });
    return;
  }
  const body = parseResult.data;

  const beatCount = body.beatCount ?? 6;
  const targetDuration = body.targetDuration ?? 30;
  const userPrompt = `Create a structured cinematic story from the following brief.

CONCEPT:
${body.concept}

GENRE: ${body.genre ?? "(creator's choice — pick a fitting genre)"}
TONE: ${body.tone ?? "(creator's choice — pick a fitting tone)"}
TARGET TOTAL DURATION: ${targetDuration} seconds
NUMBER OF BEATS: ${beatCount}

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
  const parseResult = ContinueStoryBody.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.message });
    return;
  }
  const body = parseResult.data;

  const additional = body.additionalBeats ?? 4;
  const userPrompt = `Continue the following cinematic story by adding ${additional} new beats. Return the FULL story including all existing beats plus the new ones.

EXISTING STORY:
Title: ${body.title}
Logline: ${body.logline ?? "(not provided)"}
Genre: ${body.genre ?? "(not provided)"}
Tone: ${body.tone ?? "(not provided)"}

EXISTING BEATS (in order):
${body.existingBeats.map((b) => `${b.order}. [${b.id}] ${b.title} (${b.duration}s) — ${b.description}`).join("\n")}

GUIDANCE FOR CONTINUATION:
${body.guidance ?? "(no specific guidance — extend the story naturally toward a satisfying close)"}

Output the full extended story as JSON, with continuous order numbers.`;

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
    const parseResult = GenerateVideoPromptsBody.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.message });
      return;
    }
    const body = parseResult.data;

    const aspectRatio = body.aspectRatio ?? "16:9";
    const resolution = body.resolution ?? "1080p";
    const defaultDuration = body.defaultDuration ?? 5;
    const userPrompt = `Generate Seedance 2.0 video prompts for the following story. Produce exactly ${body.beats.length} prompts — one per beat — in the same order.

STORY TITLE: ${body.title}
LOGLINE: ${body.logline ?? "(not provided)"}
GENRE: ${body.genre ?? "(not provided)"}
TONE: ${body.tone ?? "(not provided)"}

GLOBAL SETTINGS:
- Aspect ratio: ${aspectRatio}
- Resolution: ${resolution}
- Default per-shot duration: ${defaultDuration} seconds (use this unless a beat's own duration suggests otherwise)
- Style notes: ${body.styleNotes ?? "(none — use a clean live-action cinematic look)"}

BEATS:
${body.beats.map((b) => `${b.order}. [${b.id}] ${b.title} (${b.duration}s) — ${b.description}`).join("\n")}

Output JSON with the prompts array. Each prompt's beatId and beatTitle must match the corresponding input beat exactly.`;

    try {
      const result = await generateJson({
        systemPrompt: VIDEO_PROMPTS_SYSTEM_PROMPT,
        userPrompt,
        schema: GenerateVideoPromptsResponse,
        label: "generate-video-prompts",
      });
      res.json(result);
    } catch (err) {
      handleError(res, "generate-video-prompts", err);
    }
  },
);

router.post("/generate-music-brief", async (req: Request, res: Response) => {
  const parseResult = GenerateMusicBriefBody.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.message });
    return;
  }
  const body = parseResult.data;

  const duration = body.durationSeconds ?? 60;
  const vocal = body.vocal ?? false;
  const userPrompt = `Create a detailed music brief for AI music generators (Suno, Udio).

CONCEPT:
${body.concept}

GENRE: ${body.genre ?? "(creator's choice)"}
MOOD: ${body.mood ?? "(creator's choice)"}
DURATION: ${duration} seconds
VOCAL: ${vocal ? "Yes — include actual lyrics" : "No — instrumental"}
REFERENCE ARTISTS: ${body.referenceArtists ?? "(none specified — pick 2 fitting reference artists in your output if relevant)"}

STORY CONTEXT (for sync — may be empty):
${body.storyContext ?? "(no story context — write a standalone music brief based on the concept)"}

Output the music brief as JSON.`;

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
  const parseResult = GenerateVoiceoverBody.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.message });
    return;
  }
  const body = parseResult.data;

  const beats = body.beats ?? [];
  const wpm =
    body.wordsPerMinute ??
    (body.pacing === "slow" ? 120 : body.pacing === "fast" ? 180 : 150);
  const userPrompt = `Write a voiceover script in ${body.language.toUpperCase()} for the following story. Produce exactly one VoiceoverLine per beat — in the same order — and a fullScript that concatenates them.

STORY:
Title: ${body.title ?? "(untitled)"}
Logline: ${body.logline ?? "(not provided)"}

BEATS:
${beats.length > 0 ? beats.map((b) => `${b.order}. [${b.id}] ${b.title} (${b.duration}s) — ${b.description}`).join("\n") : "(no beats provided — write a single short voiceover line addressing the logline)"}

VOICEOVER SETTINGS:
- Language: ${body.language}
- Voice profile: ${body.voiceProfile ?? "(creator's choice — pick a fitting profile)"}
- Pacing: ${body.pacing ?? "medium"}
- Words per minute: ${wpm}
- Style notes: ${body.styleNotes ?? "(none)"}

Output the voiceover as JSON. Remember: if language is "hindi", write the text field in Devanagari script. If "hinglish", use natural code-switched Hindi-English with Hindi in Roman script.`;

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
