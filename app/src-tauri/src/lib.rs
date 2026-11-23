// O trabalho pesado (FFmpeg) roda como "sidecar" e é chamado pelo front-end
// através do plugin shell. Aqui registramos os plugins e alguns comandos
// nativos para pastas escolhidas pelo usuário.
mod device;
mod files;

use std::path::Path;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

/// Subpastas temporárias do app (dentro da pasta de cache). Só elas são limpas:
/// a pasta de cache também guarda os dados do navegador interno (login etc.).
const TEMP_DIRS: [&str; 3] = ["audio", "frames", "export"];

/// Código do computador (para a hora de teste grátis).
#[tauri::command]
fn device_id() -> String {
    device::device_id()
}

#[tauri::command]
fn ensure_dir(path: String) -> Result<(), String> {
    files::ensure_dir(&path)
}

#[tauri::command]
fn list_videos(dir: String) -> Vec<files::VideoFile> {
    files::list_videos(&dir)
}

#[tauri::command]
fn scan_recordings(dir: String) -> Vec<files::VideoFile> {
    files::scan_recordings(&dir)
}

#[tauri::command]
fn free_space(path: String) -> Result<u64, String> {
    files::free_space(&path)
}

#[tauri::command]
fn temp_size(app: tauri::AppHandle) -> u64 {
    match app.path().app_cache_dir() {
        Ok(base) => TEMP_DIRS.iter().map(|d| files::dir_size(&base.join(d))).sum(),
        Err(_) => 0,
    }
}

#[tauri::command]
fn clear_temp(app: tauri::AppHandle) -> Result<(), String> {
    let base = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    for d in TEMP_DIRS {
        let p = base.join(d);
        if p.exists() {
            std::fs::remove_dir_all(&p).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn prepare_fonts(app: tauri::AppHandle, dst: String) -> Result<(), String> {
    let src = app.path().resource_dir().map_err(|e| e.to_string())?.join("fonts");
    files::copy_fonts(&src, Path::new(&dst))
}

#[tauri::command]
fn prepare_emojis(app: tauri::AppHandle, dst: String) -> Result<(), String> {
    let src = app.path().resource_dir().map_err(|e| e.to_string())?.join("emoji");
    files::copy_with_ext(&src, Path::new(&dst), "png")
}

/// Copia a logo escolhida para a pasta do app (só imagens, até 5 MB) e devolve o novo caminho.
#[tauri::command]
fn import_logo(app: tauri::AppHandle, src: String) -> Result<String, String> {
    let src = Path::new(&src);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .ok_or("Arquivo sem extensão.")?;
    if !["png", "jpg", "jpeg", "webp"].contains(&ext.as_str()) {
        return Err("Use uma imagem PNG, JPG ou WEBP.".into());
    }
    let size = std::fs::metadata(src).map_err(|e| e.to_string())?.len();
    if size > 5 * 1024 * 1024 {
        return Err("A imagem passa de 5 MB. Use uma versão menor.".into());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("brand");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let dst = dir.join(format!("logo-{stamp}.{ext}"));
    std::fs::copy(src, &dst).map_err(|e| e.to_string())?;
    Ok(dst.to_string_lossy().into_owned())
}

/// Salva um arquivo gerado no app (artes de divulgação) no caminho escolhido pela pessoa.
#[tauri::command]
fn save_bytes(path: String, data: Vec<u8>) -> Result<(), String> {
    let p = Path::new(&path);
    let ext = p.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).unwrap_or_default();
    if !["png", "jpg", "jpeg"].contains(&ext.as_str()) {
        return Err("Formato não permitido.".into());
    }
    if data.len() > 30 * 1024 * 1024 {
        return Err("Arquivo grande demais.".into());
    }
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(p, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn reveal_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.opener().reveal_item_in_dir(path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Atualização automática (só no desktop)
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            device_id,
            ensure_dir,
            list_videos,
            scan_recordings,
            free_space,
            temp_size,
            clear_temp,
            prepare_fonts,
            prepare_emojis,
            import_logo,
            save_bytes,
            open_path,
            reveal_path
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Clipei Cut");
}
