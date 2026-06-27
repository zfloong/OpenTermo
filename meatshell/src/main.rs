//! Minimal binary entry point for the meatshell backend library.
//!
//! The crate is primarily a library (`lib.rs`) for consumption by Tauri or
//! other frontends. This binary exists as a smoke-test / example that the
//! backend modules compile and link correctly.

fn main() {
    // Simple stderr-only logging for the standalone binary (the Tauri app
    // uses its own logger in src-tauri/src/logger.rs).
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .try_init();

    tracing::info!("meatshell backend library loaded successfully");
    println!("meatshell backend library is ready.");
}
