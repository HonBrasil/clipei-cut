// O trabalho pesado (FFmpeg) roda como "sidecar" e é chamado pelo front-end
// através do plugin shell. Aqui só registramos os plugins.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Clipei Cut");
}
