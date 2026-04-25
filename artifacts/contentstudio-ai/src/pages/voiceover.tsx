import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGenerateVoiceover } from "@workspace/api-client-react";
import { storage, Project } from "@/lib/storage";
import { VoiceoverResponse } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save, Copy, Check, Mic2, Play, AlignLeft } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  projectId: z.string().optional(),
  language: z.string().default("english"),
  voiceProfile: z.string().default("narrator"),
  pacing: z.string().default("medium"),
  wordsPerMinute: z.coerce.number().default(150),
  styleNotes: z.string().optional(),
});

export default function VoiceoverGenerator() {
  const generateVoiceover = useGenerateVoiceover();
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [voiceover, setVoiceover] = useState<VoiceoverResponse | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      projectId: "none",
      language: "english",
      voiceProfile: "narrator",
      pacing: "medium",
      wordsPerMinute: 150,
      styleNotes: "",
    },
  });

  useEffect(() => {
    const allProjects = storage.getProjects();
    const withStory = allProjects.filter(p => p.story && p.story.beats.length > 0);
    setProjects(withStory);
    
    const settings = storage.getSettings();
    form.setValue("language", settings.defaultLanguage);
    form.setValue("voiceProfile", settings.defaultVoiceProfile);
    form.setValue("wordsPerMinute", settings.defaultWPM);

    const currentId = storage.getCurrentProjectId();
    if (currentId && withStory.find(p => p.id === currentId)) {
      form.setValue("projectId", currentId);
      setSelectedProject(withStory.find(p => p.id === currentId)!);
    }
  }, [form]);

  const watchedProjectId = form.watch("projectId");
  useEffect(() => {
    if (watchedProjectId && watchedProjectId !== "none") {
      const proj = projects.find(p => p.id === watchedProjectId);
      if (proj) setSelectedProject(proj);
    } else {
      setSelectedProject(null);
    }
  }, [watchedProjectId, projects]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!selectedProject || !selectedProject.story) {
      toast.error("Please select a project with a story");
      return;
    }

    try {
      const result = await generateVoiceover.mutateAsync({
        data: {
          title: selectedProject.story.title,
          logline: selectedProject.story.logline,
          beats: selectedProject.story.beats,
          language: values.language,
          voiceProfile: values.voiceProfile,
          pacing: values.pacing,
          wordsPerMinute: values.wordsPerMinute,
          styleNotes: values.styleNotes,
        }
      });
      setVoiceover(result);
      toast.success("Voiceover script generated");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate script");
    }
  }

  function saveToProject() {
    if (!selectedProject || !voiceover) return;
    const updatedProject = { ...selectedProject, voiceover };
    storage.saveProject(updatedProject);
    setSelectedProject(updatedProject);
    toast.success("Saved script to project");
  }

  function copyText(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("Copied to clipboard");
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-display mb-2">Voiceover Script</h1>
        <p className="text-muted-foreground">Draft timed scripts mapped to your story beats.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <Card className="bg-card border-border rounded-none">
            <CardHeader className="border-b border-border pb-4 mb-4">
              <CardTitle className="font-display text-xl">Voice Direction</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="projectId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Source Project</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="rounded-none border-border">
                              <SelectValue placeholder="Select a project" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="rounded-none">
                            <SelectItem value="none">Select project...</SelectItem>
                            {projects.map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="language"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Language</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="rounded-none border-border">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="rounded-none">
                              <SelectItem value="english">English</SelectItem>
                              <SelectItem value="hindi">Hindi</SelectItem>
                              <SelectItem value="hinglish">Hinglish</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="pacing"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Pacing</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="rounded-none border-border">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="rounded-none">
                              <SelectItem value="slow">Slow</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="fast">Fast</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="voiceProfile"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Voice Profile</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="rounded-none border-border">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="rounded-none">
                              <SelectItem value="narrator">Narrator</SelectItem>
                              <SelectItem value="conversational">Conversational</SelectItem>
                              <SelectItem value="intense">Intense</SelectItem>
                              <SelectItem value="warm">Warm/Friendly</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="wordsPerMinute"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">WPM (Target)</FormLabel>
                          <FormControl>
                            <Input type="number" className="rounded-none border-border focus-visible:ring-primary" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="styleNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Direction Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="e.g. Needs to sound like a gritty detective monologue..." 
                            className="resize-none h-20 rounded-none border-border focus-visible:ring-primary font-mono text-sm"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <Button 
                    type="submit" 
                    className="w-full rounded-none font-display text-lg tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    disabled={generateVoiceover.isPending || !selectedProject}
                  >
                    {generateVoiceover.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Drafting Script...</>
                    ) : "Generate Script"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8">
          {voiceover ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between border border-border p-4 bg-card">
                <div>
                  <h2 className="text-xl font-display uppercase">{selectedProject?.title} - Voiceover</h2>
                  <div className="flex gap-4 mt-2 text-xs font-mono text-muted-foreground">
                    <span className="flex items-center gap-1"><AlignLeft className="w-3 h-3" /> {voiceover.wordCount} words</span>
                    <span className="flex items-center gap-1"><Play className="w-3 h-3" /> ~{voiceover.estimatedDuration}s</span>
                    <span className="px-2 py-0.5 bg-secondary text-foreground uppercase">{voiceover.language}</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" onClick={() => copyText(voiceover.fullScript, 'full')} className="rounded-none border-border hover:text-primary hover:border-primary font-mono text-xs">
                    {copiedId === 'full' ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />} Full Script
                  </Button>
                  <Button onClick={saveToProject} className="rounded-none font-display tracking-wide flex items-center gap-2">
                    <Save className="w-4 h-4" /> Save
                  </Button>
                </div>
              </div>

              <div className="border border-border bg-card p-4 text-sm text-muted-foreground italic border-l-2 border-l-primary">
                <span className="font-bold text-foreground not-italic block mb-1">Director's Note:</span>
                {voiceover.deliveryGuide}
              </div>

              <div className="space-y-4">
                <h3 className="font-mono text-sm uppercase text-muted-foreground tracking-widest border-b border-border pb-2">Line by Line</h3>
                
                {voiceover.lines.map((line, index) => (
                  <div key={index} className="border border-border bg-card flex flex-col group">
                    <div className="bg-secondary/50 px-4 py-2 border-b border-border flex items-center justify-between">
                      <span className="font-display tracking-wide text-primary">{line.beatTitle || `Beat ${index + 1}`}</span>
                      <span className="font-mono text-[10px] text-muted-foreground uppercase">{line.durationSeconds}s</span>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="relative">
                        <p 
                          className={cn(
                            "text-lg pr-8 whitespace-pre-wrap leading-relaxed",
                            voiceover.language === 'hindi' ? "font-devanagari tracking-normal" : "font-sans"
                          )}
                          style={{ fontFamily: voiceover.language === 'hindi' ? 'var(--app-font-devanagari)' : undefined }}
                        >
                          {line.text}
                        </p>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="absolute -top-2 right-0 h-8 w-8 rounded-none text-muted-foreground hover:text-primary hover:bg-secondary"
                          onClick={() => copyText(line.text, `line-${index}`)}
                        >
                          {copiedId === `line-${index}` ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                      
                      {line.deliveryNotes && (
                        <div className="bg-background/50 border border-border p-2 text-xs font-mono text-muted-foreground">
                          <span className="text-foreground uppercase mr-2">Note:</span>
                          {line.deliveryNotes}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[400px] border border-dashed border-border bg-card/30 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
              <Mic2 className="w-12 h-12 mb-4 opacity-20" />
              <h3 className="font-display text-2xl mb-2 text-foreground/50">No Script Generated</h3>
              <p className="max-w-md">Select a story project to draft a beat-matched voiceover script.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
