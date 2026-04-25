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
import { generateJson } from "./llm";
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
            ? `\n  Use this pre-written script verbatim for [VOICEOVER: ...]: ${voiceoverScript}`
            : `\n  No script provided — AUTO-WRITE one for this part following the audio rules.`),
      );
    } else {
      audioBlock.push(
        `- Voiceover: NOT included for this video (omit the [VOICEOVER: ...] block and autoVoiceoverScript should be null).`,
      );
    }
    if (bgmStyle) {
      audioBlock.push(
        `- Background music: ${bgmStyle}` +
          (bgmTempo ? ` (${bgmTempo})` : "") +
          (bgmInstruments && bgmInstruments.length
            ? ` — instruments: ${bgmInstruments.join(", ")}`
            : ""),
      );
    } else {
      audioBlock.push(
        `- Background music: NOT included (omit the [BACKGROUND MUSIC: ...] block).`,
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
            ? `\n  Use this pre-written script verbatim for [VOICEOVER: ...]: ${voiceoverScript}`
            : `\n  No script provided — auto-write a fresh VO for the refined part if a VO was present originally.`),
      );
    } else {
      audioBlock.push(
        `- Voiceover: NOT included (omit the [VOICEOVER: ...] block; autoVoiceoverScript should be null).`,
      );
    }
    if (bgmStyle) {
      audioBlock.push(
        `- Background music: ${bgmStyle}` +
          (bgmTempo ? ` (${bgmTempo})` : "") +
          (bgmInstruments && bgmInstruments.length
            ? ` — instruments: ${bgmInstruments.join(", ")}`
            : ""),
      );
    } else {
      audioBlock.push(
        `- Background music: NOT included (omit the [BACKGROUND MUSIC: ...] block).`,
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
