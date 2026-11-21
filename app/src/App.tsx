import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { fetchAccount, type Account } from "./lib/account";
import { Plans } from "./screens/Plans";
import { Admin } from "./screens/Admin";
import type { Project } from "./lib/types";
import { Sidebar, type Screen } from "./components/Sidebar";
import { Login } from "./screens/Login";
import { Home } from "./screens/Home";
import { Analysis } from "./screens/Analysis";
import { Clips } from "./screens/Clips";
import { Library } from "./screens/Library";
import { Captions } from "./screens/Captions";
import { Exports } from "./screens/Exports";
import { Config } from "./screens/Config";
import { saveProject } from "./lib/projects";
import { useOnline } from "./lib/online";
import { UpdateDialog } from "./components/UpdateDialog";
import { OfflineBanner } from "./components/OfflineBanner";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [project, setProject] = useState<Project | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const credits = account ? account.totalSeconds : null;
  const paid = Boolean(account && account.plan !== "free");
  const online = useOnline();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshCredits = useCallback(() => {
    fetchAccount().then(setAccount).catch(() => setAccount(null));
  }, []);
  // Saldo atualizado pela transcrição (sem esperar outra consulta)
  const setCredits = useCallback((n: number) => setAccount((a) => (a ? { ...a, totalSeconds: n } : a)), []);

  useEffect(() => {
    if (session) refreshCredits();
  }, [session, refreshCredits]);

  // Salva o projeto no PC sempre que algo muda (depois que a análise começou a render)
  useEffect(() => {
    if (!project || !(project.transcript || project.clips)) return;
    const t = setTimeout(() => saveProject(project).catch((e) => console.error("Falha ao salvar projeto", e)), 500);
    return () => clearTimeout(t);
  }, [project]);

  const update = useCallback((fn: (p: Project) => Project) => setProject((p) => (p ? fn(p) : p)), []);

  if (!ready) return null;
  if (!session)
    return (
      <>
        <Login online={online} />
        <UpdateDialog online={online} />
      </>
    );

  return (
    <div className="shell">
      <Sidebar
        screen={screen}
        credits={credits}
        account={account}
        isAdmin={session.user.email?.toLowerCase() === "g4master01@gmail.com"}
        onNavigate={(s) => {
          setScreen(s);
          if (s === "settings" || s === "plans") refreshCredits();
        }}
        onLogout={() => supabase.auth.signOut()}
      />
      <main className="main">
        {!online && <OfflineBanner />}
        {screen === "home" && (
          <Home
            online={online}
            credits={credits}
            paid={paid}
            onPlans={() => setScreen("plans")}
            onStart={(p) => {
              setProject(p);
              setScreen("analysis");
            }}
          />
        )}
        {screen === "captions" && <Captions />}
        {screen === "exports" && <Exports />}
        {screen === "settings" && (
          <Config
            email={session.user.email ?? ""}
            account={account}
            onAccount={refreshCredits}
            onPlans={() => setScreen("plans")}
            online={online}
            onLogout={() => supabase.auth.signOut()}
            onOpenExports={() => setScreen("exports")}
          />
        )}
        {screen === "admin" && <Admin />}
        {screen === "plans" && <Plans account={account} onAccount={setAccount} />}
        {screen === "library" && (
          <Library
            onNew={() => setScreen("home")}
            onOpen={(p) => {
              setProject(p);
              setScreen(p.clips ? "clips" : "analysis");
            }}
          />
        )}
        {screen === "analysis" && project && (
          <Analysis
            project={project}
            online={online}
            paid={paid}
            onChange={update}
            onCredits={setCredits}
            onBack={() => setScreen(project.transcript ? "library" : "home")}
            onDone={() => setScreen("clips")}
          />
        )}
        {screen === "clips" && project && <Clips project={project} paid={paid} onChange={update} onBack={() => setScreen("analysis")} onPlans={() => setScreen("plans")} />}
      </main>
      <UpdateDialog online={online} />
    </div>
  );
}
