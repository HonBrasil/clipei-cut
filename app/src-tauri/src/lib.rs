// O trabalho pesado (FFmpeg) roda como "sidecar" e é chamado pelo front-end
// através do plugin shell. Aqui registramos os plugins e alguns comandos
// nativos para pastas escolhidas pelo usuário.
mod files;

use std::path::Path;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

/// Subpastas temporárias do app (dentro da pasta de cache). Só elas são limpas:
/// a pasta de cache também guarda os dados do navegador interno (login etc.).
const TEMP_DIRS: [&str; 3] = ["audio", "frames", "export"];

#[tauri::command]
fn ensure_dir(path: String) -> Result<(), String> {
    files::ensure_dir(&path)
}

#[tauri::command]
fn list_videos(dir: String) -> Vec<files::VideoFile> {
    files::list_videos(&dir)
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
            ensure_dir,
            list_videos,
            free_space,
            temp_size,
            clear_temp,
            prepare_fonts,
            open_path,
            reveal_path
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Clipei Cut");
}
