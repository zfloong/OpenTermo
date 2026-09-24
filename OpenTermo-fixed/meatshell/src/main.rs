//! Minimal binary entry point for the meatshell backend library.
//!
//! The crate is primarily a library (`lib.rs`) for consumption by Tauri or
//! other frontends. This binary exists as a smoke-test / example that the
//! backend modules compile and link correctly.

fn main() {
    meatshell::init_tracing();
    tracing::info!("meatshell backend library loaded successfully");
    println!("meatshell backend library is ready.");
}
