// Comandos nativos para lidar com pastas e arquivos que o usuário escolhe
// (fora das pastas padrão), sem abrir o acesso amplo ao disco para a interface.
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoFile {
    pub path: String,
    pub name: String,
    pub folder: String,
    pub size: u64,
    pub modified_ms: u64,
}

pub fn ensure_dir(path: &str) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| e.to_string())
}

/// Lista os .mp4 da pasta de exportação (até 2 níveis de subpastas), mais novos primeiro.
pub fn list_videos(dir: &str) -> Vec<VideoFile> {
    let root = Path::new(dir);
    let mut out = Vec::new();
    if root.is_dir() {
        walk(root, root, 0, &mut out);
    }
    out.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    out
}

fn walk(root: &Path, dir: &Path, depth: u32, out: &mut Vec<VideoFile>) {
    if depth > 2 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = entry.metadata() else { continue };
        if meta.is_dir() {
            walk(root, &path, depth + 1, out);
            continue;
        }
        let is_mp4 = path
            .extension()
            .map(|x| x.eq_ignore_ascii_case("mp4"))
            .unwrap_or(false);
        if !is_mp4 {
            continue;
        }
        let folder = path
            .parent()
            .and_then(|p| p.strip_prefix(root).ok())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let modified_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        out.push(VideoFile {
            path: path.to_string_lossy().to_string(),
            name: path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default(),
            folder,
            size: meta.len(),
            modified_ms,
        });
    }
}

pub fn dir_size(path: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(path) else { return 0 };
    entries
        .flatten()
        .map(|e| match e.metadata() {
            Ok(m) if m.is_dir() => dir_size(&e.path()),
            Ok(m) => m.len(),
            Err(_) => 0,
        })
        .sum()
}

pub fn free_space(path: &str) -> Result<u64, String> {
    // Sobe até achar uma pasta que exista (a de exportação pode ainda não existir)
    let mut p = Path::new(path);
    while !p.exists() {
        match p.parent() {
            Some(parent) => p = parent,
            None => break,
        }
    }
    fs4::available_space(p).map_err(|e| e.to_string())
}

/// Copia as fontes das legendas para a pasta de trabalho do FFmpeg.
pub fn copy_fonts(src: &Path, dst: &Path) -> Result<(), String> {
    copy_with_ext(src, dst, "ttf")
}

/// Copia os arquivos com a extensão pedida (ex.: fontes .ttf, emojis .png) para a pasta de trabalho.
pub fn copy_with_ext(src: &Path, dst: &Path, ext: &str) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
        let p = entry.path();
        if p.extension().map(|x| x.eq_ignore_ascii_case(ext)).unwrap_or(false) {
            let target = dst.join(entry.file_name());
            if !target.exists() {
                fs::copy(&p, &target).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lista_videos_e_tamanho() {
        let base = std::env::temp_dir().join("clipei-test-files");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(base.join("projeto-a")).unwrap();
        fs::write(base.join("projeto-a").join("01-clipe.mp4"), b"1234").unwrap();
        fs::write(base.join("projeto-a").join("nota.txt"), b"x").unwrap();
        fs::write(base.join("solto.MP4"), b"12").unwrap();
        let v = list_videos(base.to_str().unwrap());
        assert_eq!(v.len(), 2);
        assert!(v.iter().any(|f| f.folder == "projeto-a" && f.size == 4));
        assert_eq!(dir_size(&base), 7);
        assert!(free_space(base.join("nao-existe/ainda").to_str().unwrap()).unwrap() > 0);
        let dst = base.join("fonts-dst");
        fs::create_dir_all(base.join("fonts")).unwrap();
        fs::write(base.join("fonts").join("A.ttf"), b"f").unwrap();
        copy_fonts(&base.join("fonts"), &dst).unwrap();
        assert!(dst.join("A.ttf").exists());
        let _ = fs::remove_dir_all(&base);
    }
}
