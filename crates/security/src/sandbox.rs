use std::{
    ffi::{CStr, CString},
    path::PathBuf,
};

use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SandboxPolicy {
    pub writable_roots: Vec<PathBuf>,
    pub allow_network: bool,
}

impl SandboxPolicy {
    pub fn new(writable_roots: Vec<PathBuf>, allow_network: bool) -> Self {
        Self {
            writable_roots,
            allow_network,
        }
    }
}

#[derive(Debug, Error)]
pub enum SandboxError {
    #[error("failed to apply seatbelt profile: {0}")]
    SeatbeltFailed(String),
    #[error("sandbox operation not supported on this platform")]
    Unsupported,
}

pub fn platform_supports_sandbox() -> bool {
    cfg!(target_os = "macos")
}

pub fn apply_subprocess_isolation(policy: &SandboxPolicy) -> Result<(), SandboxError> {
    #[cfg(target_os = "macos")]
    {
        apply_seatbelt(policy)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = policy;
        Err(SandboxError::Unsupported)
    }
}

pub fn render_macos_seatbelt_profile(policy: &SandboxPolicy) -> String {
    let mut profile =
        String::from("(version 1)\n(deny default)\n(allow process*)\n(allow file-read*)\n");
    for root in normalize_writable_roots(&policy.writable_roots) {
        profile.push_str(&format!(
            "(allow file-write* (subpath \"{}\"))\n",
            escape_seatbelt_string(&root)
        ));
    }
    if policy.allow_network {
        profile.push_str("(allow network*)\n");
    }
    profile.push_str("(allow signal)\n(allow sysctl-read)");
    profile
}

fn normalize_writable_roots(roots: &[PathBuf]) -> Vec<String> {
    let mut normalized = Vec::new();
    for root in roots {
        let display = root.to_string_lossy().to_string();
        if !display.is_empty() && !normalized.contains(&display) {
            normalized.push(display.clone());
        }

        if let Ok(canonical) = root.canonicalize() {
            let display = canonical.to_string_lossy().to_string();
            if !display.is_empty() && !normalized.contains(&display) {
                normalized.push(display);
            }
        }
    }
    normalized
}

fn escape_seatbelt_string(path: &str) -> String {
    path.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(target_os = "macos")]
fn apply_seatbelt(policy: &SandboxPolicy) -> Result<(), SandboxError> {
    let profile = render_macos_seatbelt_profile(policy);
    let profile =
        CString::new(profile).map_err(|err| SandboxError::SeatbeltFailed(err.to_string()))?;

    unsafe extern "C" {
        fn sandbox_init(
            profile: *const std::ffi::c_char,
            flags: u64,
            errorbuf: *mut *mut std::ffi::c_char,
        ) -> std::ffi::c_int;
        fn sandbox_free_error(errorbuf: *mut std::ffi::c_char);
    }

    let mut err_buf: *mut std::ffi::c_char = std::ptr::null_mut();
    let rc = unsafe { sandbox_init(profile.as_ptr(), 0, &mut err_buf) };
    if rc != 0 {
        let msg = if err_buf.is_null() {
            "unknown error".to_owned()
        } else {
            let value = unsafe { CStr::from_ptr(err_buf) }
                .to_string_lossy()
                .into_owned();
            unsafe { sandbox_free_error(err_buf) };
            value
        };
        return Err(SandboxError::SeatbeltFailed(msg));
    }

    tracing::debug!(
        writable_roots = ?policy.writable_roots,
        allow_network = policy.allow_network,
        "seatbelt sandbox profile applied"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{render_macos_seatbelt_profile, SandboxPolicy};

    #[test]
    fn render_profile_includes_writable_roots_and_network_policy() {
        let profile = render_macos_seatbelt_profile(&SandboxPolicy::new(
            vec![
                PathBuf::from("/tmp/workspace"),
                PathBuf::from("/var/folders/cache"),
            ],
            false,
        ));

        assert!(profile.contains("(deny default)"));
        assert!(profile.contains("(allow file-write* (subpath \"/tmp/workspace\"))"));
        assert!(profile.contains("(allow file-write* (subpath \"/var/folders/cache\"))"));
        assert!(!profile.contains("(allow network*)"));
    }

    #[test]
    fn render_profile_allows_network_when_requested() {
        let profile = render_macos_seatbelt_profile(&SandboxPolicy::new(Vec::new(), true));
        assert!(profile.contains("(allow network*)"));
    }
}
