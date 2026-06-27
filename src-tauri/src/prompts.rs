//! Pending-prompt registry for async HostKey / Credential dialogs.
//!
//! When the SSH session emits a `HostKeyPrompt` or `CredentialPrompt`, the
//! responder is stored here so the frontend can later reply via a Tauri command.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use parking_lot::Mutex;

use meatshell::ssh::{CredentialResponder, HostKeyResponder};

pub struct PromptManager {
    next_id: AtomicU64,
    host_keys: Mutex<HashMap<String, HostKeyResponder>>,
    credentials: Mutex<HashMap<String, CredentialResponder>>,
}

impl PromptManager {
    pub fn new() -> Self {
        Self {
            next_id: AtomicU64::new(1),
            host_keys: Mutex::new(HashMap::new()),
            credentials: Mutex::new(HashMap::new()),
        }
    }

    /// Register a host-key responder and return its prompt id.
    pub fn register_host_key(&self, responder: HostKeyResponder) -> String {
        let id = self.next_id();
        tracing::debug!(prompt_id = %id, "注册主机密钥提示");
        self.host_keys.lock().insert(id.clone(), responder);
        id
    }

    /// Register a credential responder and return its prompt id.
    pub fn register_credential(&self, responder: CredentialResponder) -> String {
        let id = self.next_id();
        tracing::debug!(prompt_id = %id, "注册凭据提示");
        self.credentials.lock().insert(id.clone(), responder);
        id
    }

    /// Reply to a host-key prompt. Returns `Err` if the id is unknown.
    pub fn reply_host_key(&self, id: &str, accept: bool) -> Result<(), String> {
        let responder = self
            .host_keys
            .lock()
            .remove(id)
            .ok_or_else(|| {
                tracing::warn!(prompt_id = %id, "主机密钥回复：未知 ID");
                "未知的提示 ID".to_string()
            })?;
        tracing::info!(prompt_id = %id, accept, "主机密钥回复");
        responder.respond(accept);
        Ok(())
    }

    /// Reply to a credential prompt. `None` = cancelled.
    pub fn reply_credential(
        &self,
        id: &str,
        reply: Option<(String, String, bool)>,
    ) -> Result<(), String> {
        let responder = self
            .credentials
            .lock()
            .remove(id)
            .ok_or_else(|| {
                tracing::warn!(prompt_id = %id, "凭据回复：未知 ID");
                "未知的提示 ID".to_string()
            })?;
        tracing::info!(prompt_id = %id, has_reply = reply.is_some(), "凭据回复");
        responder.respond(reply);
        Ok(())
    }

    fn next_id(&self) -> String {
        format!("p{}", self.next_id.fetch_add(1, Ordering::Relaxed))
    }
}
