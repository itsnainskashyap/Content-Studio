import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGenerateVideoPrompts } from "@workspace/api-client-react";
import { storage, Project } from "@/lib/storage";
import { StoryBeat, VideoPrompt } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save, Copy, Check, Video as VideoIcon } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const formSchema = z.object({
  projectId: z.string().optional(),
  aspectRatio: z.string().default("16:9"),
  resolution: z.string().default("1080p"),
  defaultDuration: z.coerce.number().default(5),
  styleNotes: z.string().optional(),
});

export default function PromptsGenerator() {
  const [, setLocation] = useLocation();
  const generatePrompts = useGenerateVideoPrompts();
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [prompts, setPrompts] = useState<VideoPrompt[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      projectId: "none",
      aspectRatio: "16:9",
      resolution: "1080p",
      defaultDuration: 5,
      styleNotes: "",
    },
  });

  useEffect(() => {
    const allProjects = storage.getProjects();
    const withStory = allProjects.filter(p => p.story && p.story.beats.length > 0);
    setProjects(withStory);
    
    const settings = storage.getSettings();
    form.setValue("aspectRatio", settings.defaultAspectRatio);
    form.setValue("defaultDuration", settings.defaultDuration);

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
      const result = await generatePrompts.mutateAsync({
        data: {
          title: selectedProject.story.title,
          logline: selectedProject.story.logline,
          genre: selectedProject.story.genre,
          tone: selectedProject.story.tone,
          beats: selectedProject.story.beats,
          aspectRatio: values.aspectRatio,
          resolution: values.resolution,
          defaultDuration: values.defaultDuration,
          styleNotes: values.styleNotes,
        }
      });
      setPrompts(result.prompts);
      toast.success("Prompts generated successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate prompts");
    }
  }

  function saveToProject() {
    if (!selectedProject || prompts.length === 0) return;
    const updatedProject = { ...selectedProject, prompts };
    storage.saveProject(updatedProject);
    setSelectedProject(updatedProject);
    toast.success("Saved prompts to project");
  }

  function copyPrompt(promptText: string, id: string) {
    navigator.clipboard.writeText(promptText);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("Copied to clipboard");
  }

  function copyAll() {
    const text = prompts.map(p => `[${p.beatTitle}]\n${p.prompt}`).join('\n\n');
    navigator.clipboard.writeText(text);
    toast.success("Copied all to clipboard");
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-display mb-2">Video Prompts</h1>
        <p className="text-muted-foreground">Generate Seedance 2.0 prompts from your story beats.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <Card className="bg-card border-border rounded-none">
            <CardHeader className="border-b border-border pb-4 mb-4">
              <CardTitle className="font-display text-xl">Configuration</CardTitle>
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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                      name="aspectRatio"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Aspect Ratio</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="rounded-none border-border">
                                <SelectValue placeholder="Ratio" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="rounded-none">
                              <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                              <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                              <SelectItem value="1:1">1:1 (Square)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="resolution"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Resolution</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger className="rounded-none border-border">
                                <SelectValue placeholder="Res" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="rounded-none">
                              <SelectItem value="720p">720p</SelectItem>
                              <SelectItem value="1080p">1080p</SelectItem>
                              <SelectItem value="4k">4k</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="styleNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Style Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="e.g. moody lighting, 35mm lens, film grain..." 
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
                    disabled={generatePrompts.isPending || !selectedProject}
                  >
                    {generatePrompts.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
                    ) : "Generate Prompts"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8">
          {prompts.length > 0 ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between border border-border p-4 bg-card">
                <div>
                  <h2 className="text-xl font-display">Seedance 2.0 Prompts</h2>
                  <p className="text-sm text-muted-foreground font-mono mt-1">Generated from: {selectedProject?.title}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" onClick={copyAll} className="rounded-none border-border hover:text-primary hover:border-primary font-mono text-xs">
                    <Copy className="w-4 h-4 mr-2" /> Copy All
                  </Button>
                  <Button onClick={saveToProject} className="rounded-none font-display tracking-wide flex items-center gap-2">
                    <Save className="w-4 h-4" /> Save
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                {prompts.map((prompt, index) => (
                  <div key={prompt.beatId || index} className="border border-border bg-card flex flex-col group">
                    <div className="bg-secondary px-4 py-2 border-b border-border flex items-center justify-between">
                      <span className="font-display text-lg tracking-wide">{prompt.beatTitle}</span>
                      <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground uppercase">
                        <span>{prompt.durationSeconds}s</span>
                        <span>•</span>
                        <span>{prompt.aspectRatio}</span>
                        <span>•</span>
                        <span>{prompt.resolution}</span>
                      </div>
                    </div>
                    <div className="p-4 flex-1 space-y-4">
                      <div className="relative">
                        <Textarea 
                          readOnly
                          value={prompt.prompt}
                          className="font-mono text-sm bg-background border-border focus-visible:ring-0 resize-none min-h-[100px] rounded-none pr-12 text-primary"
                        />
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="absolute top-2 right-2 h-8 w-8 rounded-none hover:bg-secondary hover:text-primary"
                          onClick={() => copyPrompt(prompt.prompt, prompt.beatId)}
                        >
                          {copiedId === prompt.beatId ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                        <div className="border border-border p-2 bg-background/50">
                          <span className="text-muted-foreground block mb-1">CAMERA</span>
                          {prompt.cameraMovement}
                        </div>
                        <div className="border border-border p-2 bg-background/50">
                          <span className="text-muted-foreground block mb-1">LIGHTING</span>
                          {prompt.lighting}
                        </div>
                        <div className="border border-border p-2 bg-background/50">
                          <span className="text-muted-foreground block mb-1">MOOD</span>
                          {prompt.mood}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[400px] border border-dashed border-border bg-card/30 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
              <VideoIcon className="w-12 h-12 mb-4 opacity-20" />
              <h3 className="font-display text-2xl mb-2 text-foreground/50">No Prompts Yet</h3>
              <p className="max-w-md">Select a project with a story and generate high-quality video prompts.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
