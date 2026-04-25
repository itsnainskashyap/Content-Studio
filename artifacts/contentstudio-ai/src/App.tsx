import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseUrl } from "@workspace/api-client-react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { GenerationProvider } from "@/lib/generation-context";
import { AuthProvider, useAuth } from "@/lib/auth";
import Dashboard from "@/pages/dashboard";
import StoryBuilder from "@/pages/story";
import PromptsGenerator from "@/pages/prompts";
import MusicGenerator from "@/pages/music";
import VoiceoverGenerator from "@/pages/voiceover";
import History from "@/pages/history";
import Settings from "@/pages/settings";
import Landing from "@/pages/landing";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import type { ComponentType, ReactElement } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const basePrefix = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
setBaseUrl(basePrefix || null);

function Private({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Redirect to="/login" />;
  return <Layout>{children}</Layout>;
}

function withPrivate(Page: ComponentType) {
  return () => (
    <Private>
      <Page />
    </Private>
  );
}

function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Landing />;
  return (
    <Layout>
      <Dashboard />
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRoute} />
      <Route path="/login" component={LoginPage} />
      <Route path="/app" component={withPrivate(Dashboard)} />
      <Route path="/story" component={withPrivate(StoryBuilder)} />
      <Route path="/generate" component={withPrivate(PromptsGenerator)} />
      <Route path="/music" component={withPrivate(MusicGenerator)} />
      <Route path="/voiceover" component={withPrivate(VoiceoverGenerator)} />
      <Route path="/history" component={withPrivate(History)} />
      <Route path="/settings" component={withPrivate(Settings)} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <GenerationProvider>
            <WouterRouter base={basePrefix}>
              <Router />
            </WouterRouter>
            <Toaster
              theme="dark"
              toastOptions={{
                className:
                  "border-border bg-card text-foreground font-mono text-xs",
              }}
            />
          </GenerationProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
