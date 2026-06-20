//! Minimal binary entry point for the meatshell backend library.
//!
//! The crate is primarily a library (`lib.rs`) for consumption by Tauri or
//! other frontends. This binary exists as a smoke-test / example that the
//! backend modules compile and link correctly.

fn main() {
    init_tracing();
    tracing::info!("meatshell backend library loaded successfully");
    println!("meatshell backend library is ready.");
}

/// Set up tracing: stderr (honours RUST_LOG, default info) **plus** a capped
/// `error.log` file at WARN and above so users can send diagnostics.
fn init_tracing() {
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

    let file_layer = meatshell::errlog::path()
        .and_then(|p| meatshell::errlog::CappedFile::open(p, 5 * 1024 * 1024).ok())
        .map(|cf| {
            fmt::layer()
                .with_ansi(false)
                .with_writer(meatshell::errlog::CappedWriter::new(cf))
                .with_filter(silence_icu(EnvFilter::new("warn")))
        });

    tracing_subscriber::registry()
        .with(stderr_layer)
        .with(file_layer)
        .init();
}
