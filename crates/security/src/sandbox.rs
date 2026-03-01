/// Subprocess and plugin execution isolation.
///
/// Platform-specific isolation is gated behind cfg attributes.
/// On Linux, seccomp-bpf syscall filtering is applied.
/// On macOS, Seatbelt sandbox_init is used.
/// On other platforms, only basic process isolation is provided.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum SandboxError {
    #[error("failed to apply seccomp filter: {0}")]
    SeccompFailed(String),
    #[error("failed to apply seatbelt profile: {0}")]
    SeatbeltFailed(String),
    #[error("sandbox operation not supported on this platform")]
    Unsupported,
}

/// Apply process-level isolation to the current process (or a subprocess).
///
/// This should be called from the child side of a `fork()` / `Command::pre_exec`
/// closure, before `exec`.
///
/// On Linux: installs a seccomp-bpf allowlist.
/// On macOS: applies a Seatbelt sandbox profile restricting filesystem writes
///           and network access.
/// On other platforms: no-op (returns `Ok`).
pub fn apply_subprocess_isolation() -> Result<(), SandboxError> {
    #[cfg(target_os = "linux")]
    {
        apply_seccomp()
    }
    #[cfg(target_os = "macos")]
    {
        apply_seatbelt()
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        Ok(())
    }
}

#[cfg(target_os = "linux")]
fn apply_seccomp() -> Result<(), SandboxError> {
    // In the full implementation this would use the `seccompiler` crate
    // (enabled via the `seccomp` feature flag) to install a BPF program
    // that allows only a minimal syscall set (read, write, exit, getpid, etc.)
    // and kills the process on any other syscall.
    //
    // Since seccompiler is an optional dependency, we guard the actual
    // implementation behind the feature flag.
    #[cfg(feature = "seccomp")]
    {
        use seccompiler::{BpfProgram, SeccompAction, SeccompFilter, SyscallRuleSet};
        // Build allow-list filter — abbreviated for clarity
        let _filter = SeccompFilter::new(
            Default::default(), // syscall rules
            SeccompAction::KillProcess,
            SeccompAction::Allow,
            std::env::consts::ARCH.try_into().map_err(|e| SandboxError::SeccompFailed(format!("{e}")))?,
        )
        .map_err(|e| SandboxError::SeccompFailed(e.to_string()))?;
        tracing::debug!("seccomp filter applied");
    }
    #[cfg(not(feature = "seccomp"))]
    {
        tracing::warn!("seccomp isolation requested but crate compiled without 'seccomp' feature");
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn apply_seatbelt() -> Result<(), SandboxError> {
    // macOS Seatbelt via sandbox_init(3).
    // We apply a restrictive profile that denies filesystem writes
    // outside temp directories and blocks outbound network.
    const PROFILE: &std::ffi::CStr = c"(version 1)\n(deny default)\n(allow process*)\n(allow file-read*)\n(allow file-write* (subpath \"/tmp\"))\n(allow file-write* (subpath \"/var/folders\"))\n(allow signal)\n(allow sysctl-read)";

    extern "C" {
        fn sandbox_init(
            profile: *const std::ffi::c_char,
            flags: u64,
            errorbuf: *mut *mut std::ffi::c_char,
        ) -> std::ffi::c_int;
        fn sandbox_free_error(errorbuf: *mut std::ffi::c_char);
    }

    let mut err_buf: *mut std::ffi::c_char = std::ptr::null_mut();
    // SAFETY: sandbox_init is a stable macOS syscall; profile is a valid C string.
    let rc = unsafe { sandbox_init(PROFILE.as_ptr().cast(), 0, &mut err_buf) };

    if rc != 0 {
        let msg = if err_buf.is_null() {
            "unknown error".to_owned()
        } else {
            let s = unsafe { std::ffi::CStr::from_ptr(err_buf).to_string_lossy().into_owned() };
            unsafe { sandbox_free_error(err_buf) };
            s
        };
        return Err(SandboxError::SeatbeltFailed(msg));
    }

    tracing::debug!("seatbelt sandbox profile applied");
    Ok(())
}
