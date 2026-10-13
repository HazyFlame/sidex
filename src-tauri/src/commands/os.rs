use serde::Serialize;
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;

#[derive(Debug, Serialize)]
pub struct OsInfo {
    pub platform: String,
    pub arch: String,
    pub hostname: String,
    pub homedir: String,
    pub tmpdir: String,
}

#[tauri::command]
pub fn get_os_info() -> Result<OsInfo, String> {
    Ok(OsInfo {
        platform: env::consts::OS.to_string(),
        arch: env::consts::ARCH.to_string(),
        hostname: hostname::get().map_or_else(
            |_| "unknown".to_string(),
            |h| h.to_string_lossy().to_string(),
        ),
        homedir: dirs::home_dir().map_or_else(
            || "unknown".to_string(),
            |p| p.to_string_lossy().to_string(),
        ),
        tmpdir: env::temp_dir().to_string_lossy().to_string(),
    })
}

#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
pub fn get_env(key: String) -> Result<Option<String>, String> {
    Ok(env::var(&key).ok())
}

const SENSITIVE_ENV_PATTERNS: &[&str] = &[
    "SECRET",
    "TOKEN",
    "PASSWORD",
    "PASSWD",
    "CREDENTIAL",
    "PRIVATE_KEY",
    "API_KEY",
    "APIKEY",
    "AUTH",
    "AWS_",
    "AZURE_",
    "GCP_",
    "GITHUB_TOKEN",
    "NPM_TOKEN",
    "DOCKER_PASSWORD",
    "SSH_",
    "GPG_",
];

#[tauri::command]
pub fn get_all_env() -> Result<std::collections::HashMap<String, String>, String> {
    Ok(env::vars()
        .filter(|(key, _)| {
            let upper = key.to_uppercase();
            !SENSITIVE_ENV_PATTERNS.iter().any(|p| upper.contains(p))
        })
        .collect())
}

#[tauri::command]
pub fn get_shell() -> Result<String, String> {
    Ok(env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(target_os = "windows") {
            super::terminal::resolve_windows_shell()
        } else {
            "/bin/sh".to_string()
        }
    }))
}

#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
pub fn get_user_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    let user_dir = resolve_user_data_dir(&app)?;
    std::fs::create_dir_all(&user_dir)
        .map_err(|e| format!("failed to create UserData dir: {e}"))?;
    Ok(user_dir.to_string_lossy().to_string())
}

pub(crate) fn resolve_user_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    #[cfg(target_os = "linux")]
    if let Some(config_dir) = dirs::config_dir() {
        return Ok(config_dir.join("SideX").join("UserData"));
    }

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    Ok(dir.join("UserData"))
}

/// The program and arguments that reveal `target` in the file manager.
///
/// Windows selects the item in Explorer, macOS in Finder. Linux desktops have
/// no portable way to select a single item, so the containing folder is opened
/// instead.
#[cfg(target_os = "windows")]
fn reveal_command(target: &Path) -> (&'static str, Vec<String>) {
    // `explorer` expects `/select,<path>` as a single token, and the path keeps
    // its quotes because the argument is appended to the command line verbatim.
    (
        "explorer",
        vec![format!("/select,\"{}\"", target.display())],
    )
}

#[cfg(target_os = "macos")]
fn reveal_command(target: &Path) -> (&'static str, Vec<String>) {
    ("open", vec!["-R".to_string(), target.display().to_string()])
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn reveal_command(target: &Path) -> (&'static str, Vec<String>) {
    let folder = if target.is_dir() {
        target
    } else {
        target.parent().unwrap_or(target)
    };
    ("xdg-open", vec![folder.display().to_string()])
}

/// Reveals `path` in the file manager of the operating system, selecting the
/// item when the platform supports it.
///
/// Backs the workbench `revealFileInOS` command ("Reveal in File Explorer",
/// "Reveal in Finder"). The path is handed to the platform handler as a single
/// argument (no shell is involved) and has to exist, so it cannot be used to
/// run something else.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
pub fn show_item_in_folder(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err(format!("path does not exist: {path}"));
    }

    let (program, args) = reveal_command(&target);
    let mut command = Command::new(program);

    #[cfg(target_os = "windows")]
    {
        // Rust would escape the quotes a second time, but `explorer` needs them
        // exactly as they appear in `explorer /select,"<path>"`.
        use std::os::windows::process::CommandExt;
        for arg in &args {
            command.raw_arg(arg);
        }
    }

    #[cfg(not(target_os = "windows"))]
    command.args(&args);

    command
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("failed to start {program}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_path_is_reported_instead_of_spawning() {
        let result = show_item_in_folder("sidex/reveal/does/not/exist".to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("does not exist"));
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn windows_selects_the_item_with_explorer() {
        let (program, args) = reveal_command(Path::new(r"C:\work\my file.txt"));
        assert_eq!(program, "explorer");
        assert_eq!(
            args,
            vec![format!("/select,\"{}\"", r"C:\work\my file.txt")]
        );
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn macos_reveals_the_item_with_finder() {
        let (program, args) = reveal_command(Path::new("/work/my file.txt"));
        assert_eq!(program, "open");
        assert_eq!(args, vec!["-R", "/work/my file.txt"]);
    }

    #[test]
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    fn linux_opens_the_containing_folder() {
        let (program, args) = reveal_command(Path::new("/work/my file.txt"));
        assert_eq!(program, "xdg-open");
        assert_eq!(args, vec!["/work"]);
    }
}
