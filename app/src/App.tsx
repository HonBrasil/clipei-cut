import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getCreditsSeconds, supabase } from "./lib/supabase";
import type { Project } from "./lib/types";
import { Sidebar, type Screen } from "./components/Sidebar";
import { Login } from "./screens/Login";
import { Home } from "./screens/Home";
import { Analysis } from "./screens/Analysis";
import { Clips } from "./screens/Clips";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [project, setProject] = useState<Project | null>(null);
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshCredits = useCallback(() => {
    getCreditsSeconds().then(setCredits).catch(() => setCredits(null));
  }, []);

  useEffect(() => {
    if (session) refreshCredits();
  }, [session, refreshCredits]);

  const update = useCallback((fn: (p: Project) => Project) => setProject((p) => (p ? fn(p) : p)), []);

  if (!ready) return null;
  if (!session) return <Login />;

  return (
    <div className="shell">
      <Sidebar
        screen={screen}
        hasClips={Boolean(project?.clips?.length)}
        credits={credits}
        onNavigate={(s) => {
          if (s === "home") setProject(null);
          setScreen(s);
        }}
        onLogout={() => supabase.auth.signOut()}
      />
      <main className="main">
        {screen === "home" && (
          <Home
            credits={credits}
            onStart={(p) => {
              setProject(p);
              setScreen("analysis");
            }}
          />
        )}
        {screen === "analysis" && project && (
          <Analysis
            project={project}
            onChange={update}
            onCredits={setCredits}
            onBack={() => {
              setProject(null);
              setScreen("home");
            }}
            onDone={() => setScreen("clips")}
          />
        )}
        {screen === "clips" && project && <Clips project={project} onChange={update} onBack={() => setScreen("analysis")} />}
      </main>
    </div>
  );
}
