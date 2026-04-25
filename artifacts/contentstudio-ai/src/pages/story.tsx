import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGenerateStory, useContinueStory } from "@workspace/api-client-react";
import { storage, Project } from "@/lib/storage";
import { StoryBeat } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plus, Save, Copy, Check, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const formSchema = z.object({
  concept: z.string().min(5, "Concept is required"),
  genre: z.string().optional(),
  tone: z.string().optional(),
  targetDuration: z.coerce.number().optional(),
  beatCount: z.coerce.number().optional(),
});

export default function StoryBuilder() {
  const [, setLocation] = useLocation();
  const generateStory = useGenerateStory();
  const continueStory = useContinueStory();
  
  const [currentBeats, setCurrentBeats] = useState<StoryBeat[]>([]);
  const [storyMeta, setStoryMeta] = useState<{title: string, logline: string, genre: string, tone: string} | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      concept: "",
      genre: "Cinematic",
      tone: "Dramatic",
      targetDuration: 60,
      beatCount: 5,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const result = await generateStory.mutateAsync({ data: values });
      setCurrentBeats(result.beats);
      setStoryMeta({
        title: result.title,
        logline: result.logline,
        genre: result.genre,
        tone: result.tone,
      });
      toast.success("Story generated successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate story");
    }
  }

  async function handleContinue() {
    if (!storyMeta || currentBeats.length === 0) return;
    try {
      const result = await continueStory.mutateAsync({
        data: {
          title: storyMeta.title,
          logline: storyMeta.logline,
          genre: storyMeta.genre,
          tone: storyMeta.tone,
          existingBeats: currentBeats,
          additionalBeats: 3,
        }
      });
      setCurrentBeats(result.beats);
      toast.success("Story continued");
    } catch (error: any) {
      toast.error("Failed to continue story");
    }
  }

  function saveAsProject() {
    if (!storyMeta) return;
    
    const newProject: Project = {
      id: crypto.randomUUID(),
      title: storyMeta.title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      story: {
        title: storyMeta.title,
        logline: storyMeta.logline,
        genre: storyMeta.genre,
        tone: storyMeta.tone,
        beats: currentBeats,
      }
    };
    
    storage.saveProject(newProject);
    storage.setCurrentProjectId(newProject.id);
    toast.success("Saved to new project");
    setLocation(`/history?id=${newProject.id}`);
  }

  function copyToClipboard() {
    if (!storyMeta) return;
    const text = `Title: ${storyMeta.title}\nLogline: ${storyMeta.logline}\n\nBeats:\n${currentBeats.map(b => `[${b.duration}s] ${b.title}: ${b.description}`).join('\n')}`;
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    toast.success("Copied to clipboard");
  }

  function updateBeat(index: number, field: keyof StoryBeat, value: string | number) {
    const newBeats = [...currentBeats];
    newBeats[index] = { ...newBeats[index], [field]: value };
    setCurrentBeats(newBeats);
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-display mb-2">Story Builder</h1>
        <p className="text-muted-foreground">Generate structured beat sheets from a raw concept.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <Card className="bg-card border-border rounded-none">
            <CardHeader className="border-b border-border pb-4 mb-4">
              <CardTitle className="font-display text-xl">Parameters</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="concept"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Core Concept</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="e.g. A neon-lit cyberpunk chase sequence where the protagonist is hunting a rogue android..." 
                            className="resize-none h-32 rounded-none border-border focus-visible:ring-primary font-mono text-sm"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="genre"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Genre</FormLabel>
                          <FormControl>
                            <Input className="rounded-none border-border focus-visible:ring-primary" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="tone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Tone</FormLabel>
                          <FormControl>
                            <Input className="rounded-none border-border focus-visible:ring-primary" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="targetDuration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Duration (s)</FormLabel>
                          <FormControl>
                            <Input type="number" className="rounded-none border-border focus-visible:ring-primary" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="beatCount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Beats</FormLabel>
                          <FormControl>
                            <Input type="number" className="rounded-none border-border focus-visible:ring-primary" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full rounded-none font-display text-lg tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    disabled={generateStory.isPending}
                  >
                    {generateStory.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Drafting...</>
                    ) : "Generate Story"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8">
          {storyMeta ? (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4 border border-border p-6 bg-card">
                <div>
                  <h2 className="text-3xl font-display mb-2">{storyMeta.title}</h2>
                  <p className="text-muted-foreground italic border-l-2 border-primary pl-4">{storyMeta.logline}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="icon" onClick={copyToClipboard} className="rounded-none border-border hover:text-primary hover:border-primary" title="Copy text">
                    {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                  <Button onClick={saveAsProject} className="rounded-none font-display tracking-wide flex items-center gap-2">
                    <Save className="w-4 h-4" /> Save Project
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-mono text-sm uppercase text-muted-foreground tracking-widest">Beat Sheet</h3>
                  <span className="font-mono text-xs text-muted-foreground">Total: {currentBeats.reduce((a,b)=>a+b.duration, 0)}s</span>
                </div>
                
                {currentBeats.map((beat, index) => (
                  <div key={beat.id} className="border border-border bg-card p-0 flex flex-col md:flex-row group">
                    <div className="bg-secondary px-4 py-4 md:w-24 flex items-center justify-center border-b md:border-b-0 md:border-r border-border shrink-0">
                      <Input 
                        type="number" 
                        value={beat.duration} 
                        onChange={(e) => updateBeat(index, 'duration', parseInt(e.target.value) || 0)}
                        className="w-full text-center font-mono bg-transparent border-none focus-visible:ring-1 p-1 h-8"
                      />
                      <span className="font-mono text-xs text-muted-foreground ml-1">s</span>
                    </div>
                    <div className="p-4 flex-1 space-y-2">
                      <Input 
                        value={beat.title}
                        onChange={(e) => updateBeat(index, 'title', e.target.value)}
                        className="font-display text-xl bg-transparent border-transparent hover:border-border focus-visible:border-border focus-visible:ring-0 p-0 h-auto rounded-none"
                      />
                      <Textarea 
                        value={beat.description}
                        onChange={(e) => updateBeat(index, 'description', e.target.value)}
                        className="text-sm bg-transparent border-transparent hover:border-border focus-visible:border-border focus-visible:ring-0 p-1 resize-none min-h-[60px] rounded-none"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <Button 
                variant="outline" 
                className="w-full rounded-none border-dashed border-border py-8 text-muted-foreground hover:text-primary hover:border-primary transition-colors font-display tracking-widest text-lg"
                onClick={handleContinue}
                disabled={continueStory.isPending}
              >
                {continueStory.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Extending...</>
                ) : (
                  <><Plus className="mr-2 h-5 w-5" /> Continue Story</>
                )}
              </Button>
            </div>
          ) : (
            <div className="h-full min-h-[400px] border border-dashed border-border bg-card/30 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
              <BookOpen className="w-12 h-12 mb-4 opacity-20" />
              <h3 className="font-display text-2xl mb-2 text-foreground/50">Awaiting Concept</h3>
              <p className="max-w-md">Fill out the parameters and hit generate to draft a new story beat sheet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
