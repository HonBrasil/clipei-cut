import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { acceptTerms, claimTrial, fetchAccount, type Account, type TrialStatus } from "./lib/account";
import { TERMS_VERSION } from "./lib/legal";
import { TermsGate } from "./components/TermsGate";
import { PENDING_TERMS_KEY } from "./screens/Login";
import { applyReferral, PENDING_REFERRAL_KEY } from "./lib/referral";
import { Referral } from "./screens/Referral";
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
import { loadProject, saveProject } from "./lib/projects";
import { useOnline } from "./lib/online";
import { UpdateDialog } from "./components/UpdateDialog";
import { OfflineBanner } from "./components/OfflineBanner";
import { Tour } from "./components/Tour";
import { Brand } from "./screens/Brand";
import { WatchProvider } from "./lib/watch";
import { WatchBanner } from "./components/WatchBanner";
import { useSettings } from "./lib/settings";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [project, setProject] = useState<Project | null>(null);
  const [libKey, setLibKey] = useState(0);
  const [account, setAccount] = useState<Account | null>(null);
  const credits = account ? account.totalSeconds : null;
  const paid = Boolean(account && account.plan !== "free");

  const online = useOnline();
  const { settings, update: updateSettings, loaded: settingsLoaded } = useSettings();
  const [tourOpen, setTourOpen] = useState(false);

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

  // Quem marcou o aceite no cadastro: registra no servidor sem perguntar de novo
  useEffect(() => {
    if (!account || account.termsVersion === TERMS_VERSION) return;
    if (localStorage.getItem(PENDING_TERMS_KEY) === TERMS_VERSION) {
      acceptTerms(TERMS_VERSION)
        .then(() => {
          localStorage.removeItem(PENDING_TERMS_KEY);
          refreshCredits();
        })
        .catch(() => {});
    }
  }, [account, refreshCredits]);
  const needsTerms = Boolean(account && account.termsVersion !== TERMS_VERSION && localStorage.getItem(PENDING_TERMS_KEY) !== TERMS_VERSION);

  // Tutorial no primeiro acesso deste computador (depois do aceite dos termos)
  useEffect(() => {
    if (settingsLoaded && !settings.tourDone && account && !needsTerms && screen === "home") {
      const t = setTimeout(() => setTourOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, [settingsLoaded, settings.tourDone, account, needsTerms, screen]);
  const startTour = useCallback(() => {
    setScreen("home");
    setTimeout(() => setTourOpen(true), 120);
  }, []);
  const finishTour = useCallback(() => {
    setTourOpen(false);
    if (!settings.tourDone) updateSettings({ tourDone: true });
  }, [settings.tourDone, updateSettings]);

  // Ao entrar: registra o computador e libera a hora de teste se ele ainda não usou
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const uid = session?.user.id;
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    (async () => {
      const status = await claimTrial();
      if (!alive) return;
      setTrial(status);
      refreshCredits();
      // Código de indicação digitado no cadastro
      const pendingRef = localStorage.getItem(PENDING_REFERRAL_KEY);
      if (pendingRef) {
        localStorage.removeItem(PENDING_REFERRAL_KEY);
        applyReferral(pendingRef).catch((e) => console.warn("Indicação", e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid, refreshCredits]);

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
    <WatchProvider
      active={Boolean(online && account && !needsTerms)}
      paid={paid}
      credits={credits}
      onCredits={setCredits}
      onProjectsChanged={() => setLibKey((k) => k + 1)}
    >
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
        <WatchBanner
          onPlans={() => setScreen("plans")}
          onOpen={async (id) => {
            const p = await loadProject(id);
            if (p) {
              setProject(p);
              setScreen(p.clips ? "clips" : "analysis");
            }
          }}
        />
        {screen === "home" && (
          <Home
            online={online}
            credits={credits}
            paid={paid}
            trialBlocked={!paid && (trial === "dispositivo_usado" || trial === "limite_rede") && (credits ?? 0) < 60}
            onPlans={() => setScreen("plans")}
            onStart={(p) => {
              setProject(p);
              setScreen("analysis");
            }}
          />
        )}
        {screen === "captions" && <Captions />}
        {screen === "brand" && <Brand paid={paid} onPlans={() => setScreen("plans")} />}
        {screen === "referral" && <Referral onPlans={() => setScreen("plans")} />}
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
            onTour={startTour}
          />
        )}
        {screen === "admin" && <Admin />}
        {screen === "plans" && <Plans account={account} onAccount={setAccount} />}
        {screen === "library" && (
          <Library
            key={libKey}
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
      {tourOpen && screen === "home" && (
        <Tour onFinish={finishTour} onLastAction={() => document.querySelector<HTMLButtonElement>('[data-tour="drop"]')?.click()} />
      )}
      {needsTerms && <TermsGate onAccepted={refreshCredits} onLogout={() => supabase.auth.signOut()} />}
    </div>
    </WatchProvider>
  );
}
