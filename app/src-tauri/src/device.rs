// Identificação do computador para a hora de teste.
// Usa a identificação interna do Windows (MachineGuid) embaralhada com SHA-256:
// o servidor recebe só um código, nunca dados pessoais.
use sha2::{Digest, Sha256};

pub fn device_id() -> String {
    let raw = machine_guid()
        .or_else(|| std::env::var("COMPUTERNAME").ok())
        .unwrap_or_else(|| "desconhecido".to_string());
    let mut h = Sha256::new();
    h.update(b"clipei-cut-device:");
    h.update(raw.trim().to_lowercase().as_bytes());
    h.finalize().iter().map(|b| format!("{:02x}", b)).collect()
}

#[cfg(windows)]
fn machine_guid() -> Option<String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let out = std::process::Command::new("reg")
        .args(["query", r"HKLM\SOFTWARE\Microsoft\Cryptography", "/v", "MachineGuid", "/reg:64"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    parse_reg(&String::from_utf8_lossy(&out.stdout))
}

#[cfg(not(windows))]
fn machine_guid() -> Option<String> {
    std::fs::read_to_string("/etc/machine-id").ok().map(|s| s.trim().to_string())
}

/// Lê o valor da linha "MachineGuid    REG_SZ    xxxxxxxx-...".
#[allow(dead_code)]
fn parse_reg(text: &str) -> Option<String> {
    text.lines()
        .find(|l| l.contains("MachineGuid"))
        .and_then(|l| l.split_whitespace().last())
        .map(|s| s.to_string())
        .filter(|s| s.len() >= 16)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn le_o_registro_e_gera_codigo() {
        let saida = "\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n    MachineGuid    REG_SZ    3f2504e0-4f89-11d3-9a0c-0305e82c3301\r\n";
        assert_eq!(parse_reg(saida).as_deref(), Some("3f2504e0-4f89-11d3-9a0c-0305e82c3301"));
        let id = device_id();
        assert_eq!(id.len(), 64);
        assert_eq!(id, device_id());
    }
}
