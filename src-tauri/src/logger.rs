//! Unified logging for the OpenTermo Tauri application.
//!
//! Initialises a single `tracing` subscriber that writes to a capped
//! log file in the app config directory.  No stderr output — the
//! release EXE has no console, so stderr is wasted.  For diagnosis, read
//! the latest log file at `%APPDATA%\OpenTermo\logs\`.
//!
//! Each run creates a new file named `YYYYMMDD-HHMMSS.log`. Files are
//! capped at 5 MB each; if a single run exceeds 5 MB the file is
//! truncated and restarts (keeps the same name for that run).
//!
//! # Log level
//!
//! Default is `info` (shows `info`, `warn`, `error`; hides `debug`, `trace`).
//! Override with `RUST_LOG` environment variable, e.g.:
//! ```text
//! set RUST_LOG=warn      # only warnings and errors
//! set RUST_LOG=debug     # also show debug messages
//! ```

use std::fs::{File, OpenOptions};
use std::io::{self, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tracing_subscriber::{fmt, EnvFilter};

const MAX_BYTES: u64 = 5 * 1024 * 1024; // 5 MB per file

/// Initialise the global tracing subscriber.
///
/// Only the first call has any effect — subsequent calls are no-ops.
pub fn init() {
    // Compute the log path once.  Filename: YYYYMMDD-HHMMSS.log
    let log_path = match log_dir() {
        Some(dir) => {
            let _ = std::fs::create_dir_all(&dir);
            let ts = chrono::Local::now().format("%Y%m%d-%H%M%S");
            dir.join(format!("{ts}.log"))
        }
        None => return, // nowhere to write, skip logging entirely
    };

    // Build an EnvFilter: honour RUST_LOG, default "info", silence ICU crates.
    let filter = {
        let mut f = EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| EnvFilter::new("opentermo=trace,meatshell=info,russh=warn"));
        for d in ["icu_provider=off", "icu_segmenter=off", "icu_normalizer=off"] {
            if let Ok(dir) = d.parse() {
                f = f.add_directive(dir);
            }
        }
        f
    };

    // Single file layer — no stderr layer.
    let cf = match CappedFile::open(log_path, MAX_BYTES) {
        Ok(cf) => cf,
        Err(_) => return, // can't open log file, skip logging
    };

    let _ = tracing_subscriber::fmt()
        .with_ansi(false)
        .with_writer(CappedWriter::new(cf))
        .with_env_filter(filter)
        .try_init();
}

// ---------------------------------------------------------------------------
// Config directory
// ---------------------------------------------------------------------------

/// `%APPDATA%\OpenTermo\logs`
fn log_dir() -> Option<PathBuf> {
    let base = dirs::config_dir()?; // %APPDATA% on Windows
    Some(base.join("OpenTermo").join("logs"))
}

// ---------------------------------------------------------------------------
// Capped file writer (same logic as meatshell::errlog, self-contained here
// so the Tauri crate owns its logging entirely)
// ---------------------------------------------------------------------------

struct CappedFile {
    path: PathBuf,
    file: File,
    written: u64,
    cap: u64,
}

impl CappedFile {
    fn open(path: PathBuf, cap: u64) -> io::Result<Self> {
        let file = OpenOptions::new().create(true).append(true).open(&path)?;
        let written = file.metadata().map(|m| m.len()).unwrap_or(0);
        Ok(Self {
            path,
            file,
            written,
            cap,
        })
    }
}

impl Write for CappedFile {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        if self.written.saturating_add(buf.len() as u64) > self.cap {
            self.file = File::create(&self.path)?;
            self.written = 0;
        }
        let n = self.file.write(buf)?;
        self.written += n as u64;
        Ok(n)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.file.flush()
    }
}

#[derive(Clone)]
struct CappedWriter(Arc<Mutex<CappedFile>>);

impl CappedWriter {
    fn new(cf: CappedFile) -> Self {
        Self(Arc::new(Mutex::new(cf)))
    }
}

impl<'a> fmt::MakeWriter<'a> for CappedWriter {
    type Writer = Guard<'a>;
    fn make_writer(&'a self) -> Self::Writer {
        Guard(self.0.lock().unwrap_or_else(|e| e.into_inner()))
    }
}

struct Guard<'a>(std::sync::MutexGuard<'a, CappedFile>);

impl Write for Guard<'_> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.0.write(buf)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.0.flush()
    }
}
