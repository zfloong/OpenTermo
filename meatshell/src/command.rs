//! Saved command snippets (quick-send).
//!
//! Persisted as `commands.json` alongside `sessions.json` in the platform
//! config directory.  No encryption needed — commands are not secrets.

use std::fs;
use std::path::PathBuf;

use anyhow::{Context, Result};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A user-saved terminal command for quick dispatch.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandEntry {
    pub id: String,
    pub label: String,
    pub command: String,
    /// Free-form grouping tag.  Empty or `"uncategorized"` = no group.
    #[serde(default)]
    pub category: String,
    /// Pinned entries sort to the top of their category.
    #[serde(default)]
    pub pinned: bool,
    /// ISO-8601 instant of last use (updated by the frontend on send).
    #[serde(default)]
    pub last_used: Option<String>,
}

/// In-memory state backed by `commands.json`.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct StoreFile {
    entries: Vec<CommandEntry>,
}

/// Persistent command-snippet manager.
pub struct CommandStore {
    entries: Vec<CommandEntry>,
}

impl CommandStore {
    /// Load entries from disk.  Returns an empty store if the file doesn't exist
    /// yet (first launch).
    pub fn load() -> Result<Self> {
        let path = Self::path()?;
        if path.exists() {
            let raw = fs::read_to_string(&path)
                .with_context(|| format!("reading {}", path.display()))?;
            let sf: StoreFile = serde_json::from_str(&raw)
                .with_context(|| format!("parsing {}", path.display()))?;
            Ok(Self { entries: sf.entries })
        } else {
            Ok(Self { entries: Vec::new() })
        }
    }

    /// Write the current entries to disk.
    pub fn save(&self) -> Result<()> {
        let path = Self::path()?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let sf = StoreFile { entries: self.entries.clone() };
        let json = serde_json::to_string_pretty(&sf)?;
        fs::write(&path, json)
            .with_context(|| format!("writing {}", path.display()))?;
        Ok(())
    }

    pub fn entries(&self) -> &[CommandEntry] {
        &self.entries
    }

    pub fn add(&mut self, entry: CommandEntry) {
        self.entries.push(entry);
    }

    pub fn update(&mut self, id: &str, entry: CommandEntry) -> Result<()> {
        let pos = self.entries.iter()
            .position(|e| e.id == id)
            .with_context(|| format!("command {id} not found"))?;
        self.entries[pos] = entry;
        Ok(())
    }

    pub fn remove(&mut self, id: &str) {
        self.entries.retain(|e| e.id != id);
    }

    /// Sorted unique category names (excluding empty / "uncategorized").
    pub fn categories(&self) -> Vec<String> {
        let mut set: Vec<String> = self.entries.iter()
            .map(|e| e.category.clone())
            .filter(|c| !c.is_empty() && c != "uncategorized")
            .collect();
        set.sort();
        set.dedup();
        set
    }

    /// Create a blank entry with a UUID.
    pub fn new_entry() -> CommandEntry {
        CommandEntry {
            id: Uuid::new_v4().to_string(),
            label: String::new(),
            command: String::new(),
            category: String::new(),
            pinned: false,
            last_used: None,
        }
    }

    // ── internal helpers ───────────────────────────────────────────────────

    fn path() -> Result<PathBuf> {
        let dirs = ProjectDirs::from("dev", "meatshell", "meatshell")
            .context("could not determine user config directory")?;
        Ok(dirs.config_dir().join("commands.json"))
    }
}
