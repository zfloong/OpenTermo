//! meatshell — a lightweight SSH/terminal client backend library.
//!
//! Pure Rust backend for SSH, SFTP, Telnet, Serial, proxy, ZMODEM,
//! configuration management, system monitoring and host-key verification.
//! Designed to be used as a library by Tauri or other frontend frameworks.

#![allow(dead_code)]

pub mod config;
pub mod errlog;
pub mod forward;
pub mod i18n;
pub mod known_hosts;
pub mod proxy;
pub mod serial;
pub mod sftp;
pub mod ssh;
pub mod ssh_config;
pub mod system;
pub mod telnet;
pub mod zmodem;
