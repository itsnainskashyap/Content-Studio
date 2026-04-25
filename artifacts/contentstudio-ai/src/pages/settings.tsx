import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { storage, Settings as SettingsType } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Download, Upload, Trash2, Save, TerminalSquare } from "lucide-react";
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

const formSchema = z.object({
  defaultAspectRatio: z.string(),
  defaultLanguage: z.string(),
  defaultVoiceProfile: z.string(),
  defaultWPM: z.coerce.number().min(50).max(300),
  defaultDuration: z.coerce.number().min(1).max(30),
});

export default function Settings() {
  const [stats, setStats] = useState({ projects: 0 });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      defaultAspectRatio: "16:9",
      defaultLanguage: "english",
      defaultVoiceProfile: "narrator",
      defaultWPM: 150,
      defaultDuration: 5,
    },
  });

  useEffect(() => {
    const settings = storage.getSettings();
    form.reset(settings);
    setStats({ projects: storage.getProjects().length });
  }, [form]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    storage.saveSettings(values);
    toast.success("Preferences saved");
  }

  function handleExport() {
    const data = storage.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contentstudio-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Backup exported");
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const success = storage.importData(content);
      if (success) {
        toast.success("Backup restored successfully");
        setStats({ projects: storage.getProjects().length });
        form.reset(storage.getSettings());
      } else {
        toast.error("Invalid backup file");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset input
  }

  function handleClearAll() {
    storage.clearAll();
    setStats({ projects: 0 });
    toast.success("All data cleared");
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-3xl">
      <div>
        <h1 className="text-4xl font-display mb-2">Settings</h1>
        <p className="text-muted-foreground">Global preferences and data management.</p>
      </div>

      <Card className="bg-card border-border rounded-none">
        <CardHeader className="border-b border-border pb-4 mb-4">
          <CardTitle className="font-display text-2xl flex items-center gap-2">
            <TerminalSquare className="w-5 h-5 text-primary" /> Default Parameters
          </CardTitle>
          <CardDescription>These values will pre-fill across generators.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-mono text-sm uppercase text-muted-foreground border-b border-border pb-2">Video</h3>
                  <FormField
                    control={form.control}
                    name="defaultAspectRatio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-sans text-sm">Aspect Ratio</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="rounded-none border-border">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="rounded-none">
                            <SelectItem value="16:9">16:9</SelectItem>
                            <SelectItem value="9:16">9:16</SelectItem>
                            <SelectItem value="1:1">1:1</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="defaultDuration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-sans text-sm">Shot Duration (s)</FormLabel>
                        <FormControl>
                          <Input type="number" className="rounded-none border-border focus-visible:ring-primary" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <h3 className="font-mono text-sm uppercase text-muted-foreground border-b border-border pb-2">Voiceover</h3>
                  <FormField
                    control={form.control}
                    name="defaultLanguage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-sans text-sm">Language</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="rounded-none border-border">
                              <SelectValue />
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
                  <div className="grid grid-cols-2 gap-2">
                    <FormField
                      control={form.control}
                      name="defaultVoiceProfile"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-sans text-sm">Voice</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="rounded-none border-border">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="rounded-none">
                              <SelectItem value="narrator">Narrator</SelectItem>
                              <SelectItem value="conversational">Conversational</SelectItem>
                              <SelectItem value="intense">Intense</SelectItem>
                              <SelectItem value="warm">Warm</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="defaultWPM"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-sans text-sm">WPM</FormLabel>
                          <FormControl>
                            <Input type="number" className="rounded-none border-border focus-visible:ring-primary" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end border-t border-border pt-4">
                <Button type="submit" className="rounded-none font-display tracking-wide px-8">
                  <Save className="w-4 h-4 mr-2" /> Save Preferences
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="bg-card border-border rounded-none">
        <CardHeader className="border-b border-border pb-4 mb-4">
          <CardTitle className="font-display text-2xl">Data Management</CardTitle>
          <CardDescription>Everything is stored locally in your browser.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between p-4 border border-border bg-background">
            <div>
              <h4 className="font-bold">Export Backup</h4>
              <p className="text-sm text-muted-foreground font-mono mt-1">Saves {stats.projects} projects to JSON</p>
            </div>
            <Button onClick={handleExport} variant="outline" className="rounded-none border-border hover:text-primary hover:border-primary">
              <Download className="w-4 h-4 mr-2" /> Download
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 border border-border bg-background relative overflow-hidden group">
            <div>
              <h4 className="font-bold">Restore Backup</h4>
              <p className="text-sm text-muted-foreground font-mono mt-1">Merge or overwrite from JSON</p>
            </div>
            <div className="relative">
              <Button variant="outline" className="rounded-none border-border hover:text-primary hover:border-primary">
                <Upload className="w-4 h-4 mr-2" /> Upload JSON
              </Button>
              <input 
                type="file" 
                accept=".json" 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                onChange={handleImport}
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-4 border border-destructive/20 bg-destructive/5">
            <div>
              <h4 className="font-bold text-destructive">Danger Zone</h4>
              <p className="text-sm text-muted-foreground font-mono mt-1">Wipes all local storage</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="rounded-none font-display tracking-wide">
                  <Trash2 className="w-4 h-4 mr-2" /> Clear All Data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-none border-border bg-card">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-display tracking-wide text-destructive">Nuke everything?</AlertDialogTitle>
                  <AlertDialogDescription className="font-sans">
                    This will permanently delete all {stats.projects} projects, prompts, scripts, and settings from your browser. You cannot undo this.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-none font-mono text-xs uppercase">Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearAll} className="rounded-none font-mono text-xs uppercase bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Yes, delete it all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
      
      <div className="text-center pb-8">
        <p className="font-mono text-xs text-muted-foreground">ContentStudio AI • v2.0.0</p>
      </div>
    </div>
  );
}
