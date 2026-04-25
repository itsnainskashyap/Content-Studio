import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import StoryBuilder from "@/pages/story";
import PromptsGenerator from "@/pages/prompts";
import MusicGenerator from "@/pages/music";
import VoiceoverGenerator from "@/pages/voiceover";
import History from "@/pages/history";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/story" component={StoryBuilder} />
        <Route path="/generate" component={PromptsGenerator} />
        <Route path="/music" component={MusicGenerator} />
        <Route path="/voiceover" component={VoiceoverGenerator} />
        <Route path="/history" component={History} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster theme="dark" toastOptions={{ className: 'border-border bg-card text-foreground font-mono text-xs' }} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
