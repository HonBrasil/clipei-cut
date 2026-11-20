// Projetos ficam salvos no próprio PC (pasta de dados do app), em JSON.
// Nada disso vai para o servidor.
import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, readDir, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import type { Project } from "./types";

async function dir(): Promise<string> {
  const d = await join(await appDataDir(), "projects");
  if (!(await exists(d))) await mkdir(d, { recursive: true });
  return d;
}

export function newProjectId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveProject(p: Project): Promise<void> {
  const file = await join(await dir(), `${p.id}.json`);
  await writeTextFile(file, JSON.stringify({ ...p, updatedAt: new Date().toISOString() }));
}

export async function listProjects(): Promise<Project[]> {
  const d = await dir();
  const entries = await readDir(d);
  const out: Project[] = [];
  for (const e of entries) {
    if (!e.isFile || !e.name.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(await readTextFile(await join(d, e.name))) as Project);
    } catch {
      // arquivo corrompido: ignora
    }
  }
  return out.sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
}

export async function deleteProject(id: string): Promise<void> {
  const file = await join(await dir(), `${id}.json`);
  if (await exists(file)) await remove(file);
}
