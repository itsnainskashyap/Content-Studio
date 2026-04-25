import { useState, useEffect } from "react";
import { Link } from "wouter";
import { storage, Project } from "@/lib/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Video, Music, Mic, Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    setProjects(storage.getProjects());
  }, []);

  const stats = {
    total: projects.length,
    prompts: projects.reduce((acc, p) => acc + (p.prompts?.length || 0), 0),
    voWords: projects.reduce((acc, p) => acc + (p.voiceover?.wordCount || 0), 0),
    music: projects.filter(p => p.music).length,
  };

  const quickLinks = [
    { href: "/story", title: "Story Builder", description: "Generate a structured beat sheet from a concept", icon: BookOpen },
    { href: "/generate", title: "Video Prompts", description: "Create Seedance 2.0 prompts for your shots", icon: Video },
    { href: "/music", title: "Music Generator", description: "Write Suno/Udio briefs with custom lyrics", icon: Music },
    { href: "/voiceover", title: "Voiceover Script", description: "Generate timed scripts in English or Hindi", icon: Mic },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-display mb-2">Command Center</h1>
        <p className="text-muted-foreground">Ready to build something new?</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border rounded-none rounded-tl-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono text-muted-foreground uppercase">Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display text-primary">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border rounded-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono text-muted-foreground uppercase">Prompts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display text-primary">{stats.prompts}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border rounded-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono text-muted-foreground uppercase">VO Words</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display text-primary">{stats.voWords}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border rounded-none rounded-tr-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono text-muted-foreground uppercase">Music Briefs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-display text-primary">{stats.music}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {quickLinks.map((link) => (
          <Link key={link.href} href={link.href}>
            <div className="group border border-border bg-card p-6 cursor-pointer hover:border-primary transition-colors flex items-start gap-4">
              <div className="p-3 bg-secondary text-muted-foreground group-hover:text-primary transition-colors border border-border">
                <link.icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-display text-xl mb-1 flex items-center justify-between">
                  {link.title}
                  <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-primary" />
                </h3>
                <p className="text-sm text-muted-foreground">{link.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-display">Recent Activity</h2>
          <Button variant="outline" size="sm" asChild className="rounded-none border-border font-mono text-xs hover:text-primary hover:border-primary">
            <Link href="/history">View All</Link>
          </Button>
        </div>
        
        {projects.length === 0 ? (
          <div className="border border-border border-dashed p-12 text-center text-muted-foreground bg-card/50">
            <div className="mx-auto w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4">
              <BookOpen className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="font-display text-xl mb-2 text-foreground">No projects yet</h3>
            <p className="text-sm mb-6 max-w-sm mx-auto">Start by generating a story, video prompts, music brief, or voiceover script.</p>
            <Button asChild className="rounded-none font-display uppercase tracking-wider text-primary-foreground">
              <Link href="/story">Start a Story</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {projects.slice(0, 5).map(project => (
              <div key={project.id} className="flex items-center justify-between p-4 border border-border bg-card hover:border-muted-foreground transition-colors group">
                <div>
                  <h4 className="font-medium text-lg">{project.title}</h4>
                  <div className="flex gap-2 mt-1">
                    {project.story && <span className="text-[10px] font-mono bg-secondary px-2 py-0.5 text-muted-foreground">Story</span>}
                    {project.prompts && <span className="text-[10px] font-mono bg-secondary px-2 py-0.5 text-muted-foreground">Prompts</span>}
                    {project.music && <span className="text-[10px] font-mono bg-secondary px-2 py-0.5 text-muted-foreground">Music</span>}
                    {project.voiceover && <span className="text-[10px] font-mono bg-secondary px-2 py-0.5 text-muted-foreground">VO</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono text-muted-foreground mb-2">
                    {new Date(project.updatedAt).toLocaleDateString()}
                  </div>
                  <Button variant="ghost" size="sm" asChild className="rounded-none h-8 font-mono text-xs border-border opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link href={`/history?id=${project.id}`}>Open</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
