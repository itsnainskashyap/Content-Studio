import { useState, useEffect } from "react";
import { Link } from "wouter";
import { storage, Project } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Filter, Trash2, Calendar, FolderOpen, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function History() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");

  useEffect(() => {
    setProjects(storage.getProjects());
  }, []);

  const deleteProject = (id: string) => {
    storage.deleteProject(id);
    setProjects(storage.getProjects());
    toast.success("Project deleted");
  };

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    
    switch (filterType) {
      case "story": return !!p.story;
      case "prompts": return !!p.prompts;
      case "music": return !!p.music;
      case "voiceover": return !!p.voiceover;
      default: return true;
    }
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-display mb-2">Archive</h1>
        <p className="text-muted-foreground">Manage and retrieve all your generated content.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-6 bg-card border border-border p-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search projects..." 
            className="pl-9 rounded-none border-border focus-visible:ring-primary bg-background"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="w-full md:w-48">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="rounded-none border-border bg-background">
              <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="all">All Content</SelectItem>
              <SelectItem value="story">Story</SelectItem>
              <SelectItem value="prompts">Prompts</SelectItem>
              <SelectItem value="music">Music</SelectItem>
              <SelectItem value="voiceover">Voiceover</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <div className="border border-dashed border-border p-12 text-center text-muted-foreground bg-card/30">
          <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <h3 className="font-display text-xl text-foreground">No projects found</h3>
          <p className="text-sm mt-2">Adjust your filters or create something new.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredProjects.map((project) => (
            <Card key={project.id} className="rounded-none border-border bg-card group hover:border-primary/50 transition-colors">
              <CardContent className="p-6 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                <div className="space-y-2 flex-1">
                  <h3 className="font-display text-2xl group-hover:text-primary transition-colors">{project.title}</h3>
                  <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </span>
                    <span className="opacity-50">|</span>
                    <div className="flex gap-2">
                      {project.story && <span className="bg-secondary px-2 py-0.5 text-foreground uppercase border border-border">Story</span>}
                      {project.prompts && <span className="bg-secondary px-2 py-0.5 text-foreground uppercase border border-border">Prompts</span>}
                      {project.music && <span className="bg-secondary px-2 py-0.5 text-foreground uppercase border border-border">Music</span>}
                      {project.voiceover && <span className="bg-secondary px-2 py-0.5 text-foreground uppercase border border-border">VO</span>}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 w-full md:w-auto">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="icon" className="rounded-none border-border hover:bg-destructive hover:text-destructive-foreground hover:border-destructive shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-none border-border bg-card">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-display tracking-wide">Delete Project?</AlertDialogTitle>
                        <AlertDialogDescription className="font-sans">
                          This will permanently delete "{project.title}" and all its associated content. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-none font-mono text-xs uppercase">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteProject(project.id)} className="rounded-none font-mono text-xs uppercase bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  
                  <Button asChild className="rounded-none font-display tracking-wider flex-1 md:flex-none" onClick={() => storage.setCurrentProjectId(project.id)}>
                    <Link href="/story">
                      Open Project <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
