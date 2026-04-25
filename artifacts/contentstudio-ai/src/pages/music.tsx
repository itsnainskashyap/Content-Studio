import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGenerateMusicBrief } from "@workspace/api-client-react";
import { storage, Project } from "@/lib/storage";
import { MusicBriefResponse } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save, Copy, Check, Music as MusicIcon, ListMusic, Mic } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

const formSchema = z.object({
  projectId: z.string().optional(),
  concept: z.string().min(3, "Concept is required"),
  genre: z.string().optional(),
  mood: z.string().optional(),
  durationSeconds: z.coerce.number().optional(),
  vocal: z.boolean().default(false),
  referenceArtists: z.string().optional(),
});

export default function MusicGenerator() {
  const generateMusic = useGenerateMusicBrief();
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [brief, setBrief] = useState<MusicBriefResponse | null>(null);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      projectId: "none",
      concept: "",
      genre: "Cinematic Ambient",
      mood: "Tense, building",
      durationSeconds: 60,
      vocal: false,
      referenceArtists: "Hans Zimmer, Trent Reznor",
    },
  });

  useEffect(() => {
    const allProjects = storage.getProjects();
    setProjects(allProjects);
    
    const currentId = storage.getCurrentProjectId();
    if (currentId && allProjects.find(p => p.id === currentId)) {
      form.setValue("projectId", currentId);
      const proj = allProjects.find(p => p.id === currentId)!;
      setSelectedProject(proj);
      
      if (proj.story) {
        form.setValue("concept", proj.story.title + " - " + proj.story.logline);
        if (proj.story.genre) form.setValue("genre", proj.story.genre);
        if (proj.story.tone) form.setValue("mood", proj.story.tone);
      }
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
    try {
      let storyContext = "";
      if (selectedProject?.story) {
        storyContext = `Story Context:\nTitle: ${selectedProject.story.title}\nLogline: ${selectedProject.story.logline}\nBeats:\n${selectedProject.story.beats.map(b => b.title).join(", ")}`;
      }

      const result = await generateMusic.mutateAsync({
        data: {
          concept: values.concept,
          genre: values.genre,
          mood: values.mood,
          durationSeconds: values.durationSeconds,
          vocal: values.vocal,
          referenceArtists: values.referenceArtists,
          storyContext: storyContext || undefined,
        }
      });
      setBrief(result);
      toast.success("Music brief generated");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate music brief");
    }
  }

  function saveToProject() {
    if (!brief) return;
    
    let targetProject = selectedProject;
    
    if (!targetProject) {
      targetProject = {
        id: crypto.randomUUID(),
        title: brief.title || "Untitled Music",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setProjects([targetProject, ...projects]);
      form.setValue("projectId", targetProject.id);
    }
    
    const updatedProject = { ...targetProject, music: brief };
    storage.saveProject(updatedProject);
    setSelectedProject(updatedProject);
    toast.success("Saved music brief to project");
  }

  function copyText(text: string, section: string) {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
    toast.success("Copied to clipboard");
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-display mb-2">Music Generator</h1>
        <p className="text-muted-foreground">Draft precise generation briefs for Suno or Udio.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <Card className="bg-card border-border rounded-none">
            <CardHeader className="border-b border-border pb-4 mb-4">
              <CardTitle className="font-display text-xl">Track Context</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="projectId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Link Project (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="rounded-none border-border">
                              <SelectValue placeholder="Standalone track" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="rounded-none">
                            <SelectItem value="none">Standalone track</SelectItem>
                            {projects.map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="concept"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Musical Concept</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="e.g. A pulsing synthwave track that starts slow and erupts into a massive drop..." 
                            className="resize-none h-24 rounded-none border-border focus-visible:ring-primary font-mono text-sm"
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
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="mood"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Mood</FormLabel>
                          <FormControl>
                            <Input className="rounded-none border-border focus-visible:ring-primary" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="referenceArtists"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Reference Artists / Sounds</FormLabel>
                        <FormControl>
                          <Input className="rounded-none border-border focus-visible:ring-primary" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="vocal"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between border border-border p-4 bg-secondary/50 space-y-0">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base font-display">Vocals</FormLabel>
                          <p className="text-xs text-muted-foreground font-mono">Include lyrics generation</p>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="durationSeconds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase text-muted-foreground">Duration (s)</FormLabel>
                        <FormControl>
                          <Input type="number" className="rounded-none border-border focus-visible:ring-primary" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <Button 
                    type="submit" 
                    className="w-full rounded-none font-display text-lg tracking-wider bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    disabled={generateMusic.isPending}
                  >
                    {generateMusic.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Composing...</>
                    ) : "Generate Brief"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8">
          {brief ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between border border-border p-6 bg-card">
                <div>
                  <h2 className="text-3xl font-display mb-1">{brief.title}</h2>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="font-mono text-xs bg-secondary px-2 py-1 text-muted-foreground border border-border uppercase tracking-wider">
                      BPM: {brief.bpm}
                    </span>
                    <span className="font-mono text-xs bg-secondary px-2 py-1 text-muted-foreground border border-border uppercase tracking-wider">
                      KEY: {brief.key}
                    </span>
                    <span className="font-mono text-xs bg-secondary px-2 py-1 text-muted-foreground border border-border uppercase tracking-wider">
                      MOOD: {brief.mood}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button onClick={saveToProject} className="rounded-none font-display tracking-wide flex items-center gap-2">
                    <Save className="w-4 h-4" /> Save
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-card border-border rounded-none">
                  <CardHeader className="pb-2 border-b border-border flex flex-row items-center justify-between">
                    <CardTitle className="font-display text-lg">Suno Prompt</CardTitle>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none hover:bg-secondary" onClick={() => copyText(brief.sunoPrompt, 'suno')}>
                      {copiedSection === 'suno' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <Textarea 
                      readOnly 
                      value={brief.sunoPrompt} 
                      className="font-mono text-sm border-none bg-transparent resize-none p-0 focus-visible:ring-0 text-primary min-h-[150px]"
                    />
                  </CardContent>
                </Card>

                <Card className="bg-card border-border rounded-none">
                  <CardHeader className="pb-2 border-b border-border flex flex-row items-center justify-between">
                    <CardTitle className="font-display text-lg">Udio Prompt</CardTitle>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none hover:bg-secondary" onClick={() => copyText(brief.udioPrompt, 'udio')}>
                      {copiedSection === 'udio' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <Textarea 
                      readOnly 
                      value={brief.udioPrompt} 
                      className="font-mono text-sm border-none bg-transparent resize-none p-0 focus-visible:ring-0 text-primary min-h-[150px]"
                    />
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div className="border border-border bg-card p-4">
                    <h3 className="font-display text-xl mb-4 border-b border-border pb-2">Structure</h3>
                    <div className="space-y-3">
                      {brief.structure.map((item, i) => (
                        <div key={i} className="flex gap-4">
                          <span className="font-mono text-xs text-primary font-bold w-20 shrink-0 uppercase">[{item.section}]</span>
                          <span className="text-sm text-muted-foreground">{item.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="border border-border bg-card p-4">
                    <h3 className="font-display text-xl mb-4 border-b border-border pb-2">Style Tags</h3>
                    <div className="flex flex-wrap gap-2">
                      {brief.styleTags.map(tag => (
                        <span key={tag} className="text-xs font-mono px-2 py-1 bg-secondary text-muted-foreground border border-border">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 border-t border-border pt-4">
                      <span className="text-xs font-mono text-muted-foreground block mb-2 uppercase">Instrumentation</span>
                      <p className="text-sm">{brief.instrumentation.join(', ')}</p>
                    </div>
                  </div>
                </div>

                {brief.lyrics && (
                  <Card className="bg-card border-border rounded-none h-full">
                    <CardHeader className="pb-2 border-b border-border flex flex-row items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Mic className="w-4 h-4 text-primary" />
                        <CardTitle className="font-display text-lg">Lyrics</CardTitle>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none hover:bg-secondary" onClick={() => copyText(brief.lyrics, 'lyrics')}>
                        {copiedSection === 'lyrics' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </CardHeader>
                    <CardContent className="pt-4 h-[calc(100%-4rem)]">
                      <Textarea 
                        readOnly 
                        value={brief.lyrics} 
                        className="font-mono text-sm border-none bg-transparent resize-none p-0 focus-visible:ring-0 text-foreground h-full min-h-[300px]"
                      />
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[400px] border border-dashed border-border bg-card/30 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
              <ListMusic className="w-12 h-12 mb-4 opacity-20" />
              <h3 className="font-display text-2xl mb-2 text-foreground/50">No Music Brief</h3>
              <p className="max-w-md">Configure your track and generate a prompt tailored for AI music models.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
