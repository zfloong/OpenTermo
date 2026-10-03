//! Lightweight poller for local machine stats (CPU / memory / network).
//!
//! `sysinfo` is already a dependency for many Rust desktop apps; it gives us
//! cross-platform data with ~2% CPU overhead at 1-second cadence.

use serde::{Deserialize, Serialize};
use sysinfo::{Networks, System};

/// Snapshot passed to the UI each tick.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub cpu_percent: f32,
    pub mem_percent: f32,
    pub swap_percent: f32,
    pub mem_used_mib: u64,
    pub mem_total_mib: u64,
    pub swap_used_mib: u64,
    pub swap_total_mib: u64,
    pub net_bytes_per_sec: u64,
    pub net_rx_per_sec: u64,
    pub net_tx_per_sec: u64,
}

/// Stateful sampler. Construct once per process and poll via [`Self::sample`].
pub struct SystemSampler {
    sys: System,
    nets: Networks,
    last_rx_total: u64,
    last_tx_total: u64,
    last_instant: std::time::Instant,
}

impl SystemSampler {
    pub fn new() -> Self {
        // The sampler only reads CPU / memory / swap, so it must not pay for
        // `System::new_all()`, which enumerates every process. `new()` starts
        // empty; priming the CPU counters here (a cheap per-CPU query) keeps
        // the first `sample()` accurate instead of reporting a bogus 0%/100%
        // from a zero-length baseline.
        let mut sys = System::new();
        sys.refresh_cpu_usage();
        let nets = Networks::new_with_refreshed_list();
        let last_rx_total = nets.iter().map(|(_, d)| d.total_received()).sum();
        let last_tx_total = nets.iter().map(|(_, d)| d.total_transmitted()).sum();
        Self {
            sys,
            nets,
            last_rx_total,
            last_tx_total,
            last_instant: std::time::Instant::now(),
        }
    }

    pub fn sample(&mut self) -> SystemSnapshot {
        self.sys.refresh_cpu_usage();
        self.sys.refresh_memory();
        self.nets.refresh(true);

        let cpu_percent = self.sys.global_cpu_usage();

        let mem_total = self.sys.total_memory();
        let mem_used = self.sys.used_memory();
        let mem_percent = if mem_total > 0 {
            mem_used as f32 / mem_total as f32 * 100.0
        } else {
            0.0
        };

        let swap_total = self.sys.total_swap();
        let swap_used = self.sys.used_swap();
        let swap_percent = if swap_total > 0 {
            swap_used as f32 / swap_total as f32 * 100.0
        } else {
            0.0
        };

        // RX / TX bytes/sec from the delta across the iface list.
        let rx_total: u64 = self.nets.iter().map(|(_, d)| d.total_received()).sum();
        let tx_total: u64 = self.nets.iter().map(|(_, d)| d.total_transmitted()).sum();
        let now = std::time::Instant::now();
        let elapsed = now.duration_since(self.last_instant).as_secs_f64().max(0.001);
        let rx_delta = rx_total.saturating_sub(self.last_rx_total);
        let tx_delta = tx_total.saturating_sub(self.last_tx_total);
        self.last_rx_total = rx_total;
        self.last_tx_total = tx_total;
        self.last_instant = now;
        let net_rx_per_sec = (rx_delta as f64 / elapsed) as u64;
        let net_tx_per_sec = (tx_delta as f64 / elapsed) as u64;

        SystemSnapshot {
            cpu_percent,
            mem_percent,
            swap_percent,
            mem_used_mib: mem_used / 1024 / 1024,
            mem_total_mib: mem_total / 1024 / 1024,
            swap_used_mib: swap_used / 1024 / 1024,
            swap_total_mib: swap_total / 1024 / 1024,
            net_bytes_per_sec: net_rx_per_sec + net_tx_per_sec,
            net_rx_per_sec,
            net_tx_per_sec,
        }
    }
}


