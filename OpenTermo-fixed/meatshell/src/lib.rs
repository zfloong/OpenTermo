//! meatshell — a lightweight SSH/terminal client backend library.
//!
//! Pure Rust backend for SSH, SFTP, Telnet, Serial, proxy, ZMODEM,
//! configuration management, system monitoring and host-key verification.
//! Designed to be used as a library by Tauri or other frontend frameworks.

#![allow(dead_code)]

pub mod command;
pub mod config;
pub mod errlog;
pub mod forward;
pub mod i18n;
pub mod known_hosts;
pub mod ppk;
pub mod proxy;
pub mod serial;
pub mod ssh;
pub mod system;
pub mod telnet;
pub mod zmodem;

/// Install the global tracing subscriber: stderr (honours `RUST_LOG`, default
/// `info`) **plus** a capped `error.log` at WARN and above, so a user can send
/// us a disconnect reason without setting `RUST_LOG`.
///
/// Idempotent — a second call is a no-op rather than a panic, because
/// `tracing_subscriber` only accepts one global subscriber per process.
///
/// A frontend must call this: without it nothing is ever written to
/// `error.log`, and every `tracing::warn!` in the SSH/terminal paths is
/// discarded. Windows GUI builds have no console, so when the log file cannot
/// be opened the reason is reported on stderr — the last place left that keeps
/// the failure discoverable instead of silently losing all diagnostics.
pub fn init_tracing() {
    use tracing_subscriber::prelude::*;
    use tracing_subscriber::{fmt, EnvFilter};

    fn silence_icu(mut f: EnvFilter) -> EnvFilter {
        for d in ["icu_provider=off", "icu_segmenter=off", "icu_normalizer=off"] {
            if let Ok(dir) = d.parse() {
                f = f.add_directive(dir);
            }
        }
        f
    }

    let env_filter = silence_icu(
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
    );
    let stderr_layer = fmt::layer()
        .with_writer(std::io::stderr)
        .with_filter(env_filter);

    let file_layer = match errlog::path() {
        Some(p) => match errlog::CappedFile::open(p.clone(), 5 * 1024 * 1024) {
            Ok(cf) => Some(
                fmt::layer()
                    .with_ansi(false)
                    .with_writer(errlog::CappedWriter::new(cf))
                    .with_filter(silence_icu(EnvFilter::new("warn"))),
            ),
            Err(err) => {
                eprintln!("meatshell: cannot open {} for logging: {err}", p.display());
                None
            }
        },
        None => {
            eprintln!("meatshell: app data directory unavailable — file logging disabled");
            None
        }
    };

    let _ = tracing_subscriber::registry()
        .with(stderr_layer)
        .with(file_layer)
        .try_init();
}
