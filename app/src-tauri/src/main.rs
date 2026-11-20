// Esconde a janela de console no Windows em builds de produção
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    clipei_cut_lib::run()
}
