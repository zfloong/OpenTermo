//! SSH session manager.
//!
//! Each open terminal tab maps to exactly one `SshSession`. The session runs
//! on the shared Tokio runtime; commands come in via an MPSC channel and
//! output lines are pushed back via an `UnboundedSender<SessionEvent>`.

use std::path::Path;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use russh::client::{self, Handle, Handler, Msg};
use russh::keys::key::PrivateKeyWithHashAlg;
use russh::keys::load_secret_key;
use russh::{Channel, ChannelId, ChannelMsg, Disconnect};
use ssh_key::{HashAlg, PublicKey};
use tokio::sync::mpsc::{self, UnboundedReceiver, UnboundedSender};
use tokio::task::JoinHandle;

use crate::config::{AuthMethod, Session};
use crate::i18n::t;

// ── Legacy-algorithm compatibility ──────────────────────────────────────────
// Key-exchange algorithms offered to the server, strongest first: the russh
// default set plus the ecdh-sha2-nistp* curves and the legacy
// diffie-hellman-group{14,1}-sha1 exchanges appended as last-resort fallbacks,
// so old servers and network gear that only speak SHA-1 KEX still connect.
// A modern server keeps picking a strong algorithm because the client's order
// decides and SHA-1 comes last.
pub(crate) const COMPAT_KEX: &[russh::kex::Name] = &[
    russh::kex::CURVE25519,
    russh::kex::CURVE25519_PRE_RFC_8731,
    russh::kex::DH_G16_SHA512,
    russh::kex::DH_G14_SHA256,
    russh::kex::ECDH_SHA2_NISTP256,
    russh::kex::ECDH_SHA2_NISTP384,
    russh::kex::ECDH_SHA2_NISTP521,
    russh::kex::DH_G14_SHA1, // legacy fallback
    russh::kex::DH_G1_SHA1,  // legacy fallback
    // Keep the ext-info / strict-kex markers so modern servers still negotiate
    // both (mirrors russh's default tail).
    russh::kex::EXTENSION_SUPPORT_AS_CLIENT,
    russh::kex::EXTENSION_SUPPORT_AS_SERVER,
    russh::kex::EXTENSION_OPENSSH_STRICT_KEX_AS_CLIENT,
    russh::kex::EXTENSION_OPENSSH_STRICT_KEX_AS_SERVER,
];

// Ciphers offered to the server, strongest first: the AEAD/CTR defaults plus
// the legacy CBC ciphers appended for old servers that only support CBC.
pub(crate) const COMPAT_CIPHER: &[russh::cipher::Name] = &[
    russh::cipher::CHACHA20_POLY1305,
    russh::cipher::AES_256_GCM,
    russh::cipher::AES_256_CTR,
    russh::cipher::AES_192_CTR,
    russh::cipher::AES_128_CTR,
    russh::cipher::AES_256_CBC,    // legacy fallback
    russh::cipher::AES_192_CBC,    // legacy fallback
    russh::cipher::AES_128_CBC,    // legacy fallback
    russh::cipher::TRIPLE_DES_CBC, // legacy fallback
];

/// Load a private key file. PuTTY PPK v2/v3 files — which `ssh-key` cannot
/// parse — are detected by content and decoded into the same in-memory
/// representation, so the caller does not care which format it handed us.
fn load_session_private_key(path: &str, pass: Option<&str>) -> Result<russh::keys::PrivateKey> {
    let bytes = std::fs::read(path).with_context(|| format!("failed to read key {path}"))?;
    if crate::ppk::is_ppk(&bytes) {
        return crate::ppk::decode_ppk(&bytes, pass.unwrap_or_default())
            .with_context(|| format!("failed to load PuTTY key {path}"));
    }
    load_secret_key(Path::new(path), pass).with_context(|| format!("failed to load key {path}"))
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/// Format a byte count as a human-readable string.
pub fn format_size(bytes: u64) -> String {
    if bytes < 1_024 {
        format!("{} B", bytes)
    } else if bytes < 1_024 * 1_024 {
        format!("{:.1} KB", bytes as f64 / 1_024.0)
    } else if bytes < 1_024 * 1_024 * 1_024 {
        format!("{:.1} MB", bytes as f64 / (1_024.0 * 1_024.0))
    } else {
        format!("{:.2} GB", bytes as f64 / (1_024.0 * 1_024.0 * 1_024.0))
    }
}

/// Format a Unix timestamp as `YYYY-MM-DD HH:MM`.
pub fn format_mtime(ts: u32) -> String {
    use chrono::{DateTime, TimeZone, Utc};
    let dt: DateTime<Utc> = Utc
        .timestamp_opt(ts as i64, 0)
        .single()
        .unwrap_or_else(Utc::now);
    dt.format("%Y-%m-%d %H:%M").to_string()
}

/// The canonical ZMODEM abort sequence: eight CAN (0x18) then eight BS (0x08).
/// Sending this makes the remote `sz`/`rz` give up so the session recovers (#76).
const ZMODEM_CANCEL: [u8; 16] = [
    0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08,
];

/// Detect the start of a **download** ZMODEM transfer (`sz`) in a raw channel
/// chunk.
///
/// A ZModem hex header is `ZDLE (0x18) 'B' <2 hex digits of the frame type>`; a
/// download is offered with ZRQINIT (type 0), which is what `sz` sends on its
/// handshake (`**\x18B00…`). Matching the full header — instead of the previous
/// "0x18 followed by B or C" two-byte test — keeps ordinary output that happens
/// to contain those bytes (progress-bar escapes, binary-ish text) from hijacking
/// the session into the ZMODEM receiver, which would silently swallow the
/// terminal stream until the transfer times out.
fn contains_zmodem_init(data: &[u8]) -> bool {
    data.windows(4).any(|w| {
        w[0] == 0x18
            && w[1] == b'B'
            && matches!(
                (zmodem_hex_nibble(w[2]), zmodem_hex_nibble(w[3])),
                (Some(high), Some(low)) if ((high << 4) | low) == 0
            )
    })
}

/// Decode one hex digit of a ZModem header, or `None` if it isn't one.
fn zmodem_hex_nibble(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

/// Append `data` to `pending` and decode every complete UTF-8 character.
///
/// An SSH channel delivers a byte stream, so a multibyte character (CJK, emoji)
/// can straddle two `ChannelMsg::Data` packets. Decoding each packet on its own
/// with `from_utf8_lossy` turns both halves into U+FFFD — the character is lost
/// and an extra cell is drawn. Bytes that form an incomplete sequence at the end
/// are kept in `pending` and prepended to the next packet instead.
pub(crate) fn decode_utf8_chunk(pending: &mut Vec<u8>, data: &[u8]) -> String {
    pending.extend_from_slice(data);
    let keep = match std::str::from_utf8(pending) {
        Ok(_) => 0,
        // `error_len() == None` → the error is an incomplete sequence at the very
        // end; hold those bytes (at most 3) back for the next packet.
        Err(e) if e.error_len().is_none() => pending.len() - e.valid_up_to(),
        // Anything else is genuinely invalid input; let from_utf8_lossy place the
        // replacement characters.
        Err(_) => 0,
    };
    let split = pending.len() - keep;
    let text = String::from_utf8_lossy(&pending[..split]).into_owned();
    pending.drain(..split);
    text
}

/// Extract the remote path from an OSC 7 sequence embedded in `text`.
///
/// Format: `ESC ] 7 ; file://hostname/path BEL`
/// Returns the decoded absolute path component (without hostname).
pub fn extract_osc7_path(text: &str) -> Option<String> {
    extract_osc7_end(text).map(|(path, _)| path)
}

/// Like [`extract_osc7_path`] but also returns the byte index just past the OSC
/// sequence's terminator, so the caller can cut everything up to and including
/// it — used to discard the echoed setup line (which may wrap) at connect (#98).
fn extract_osc7_end(text: &str) -> Option<(String, usize)> {
    let bytes = text.as_bytes();
    let mut i = 0;
    while i + 1 < bytes.len() {
        if bytes[i] != 0x1b || bytes[i + 1] != b']' {
            i += 1;
            continue;
        }
        let osc_start = i + 2;
        i += 2;
        // Scan for BEL (0x07) or ST (ESC \)
        let mut end = i;
        let mut term_len = 0;
        while end < bytes.len() {
            if bytes[end] == 0x07 {
                term_len = 1;
                break;
            } else if bytes[end] == 0x1b && end + 1 < bytes.len() && bytes[end + 1] == b'\\' {
                term_len = 2;
                break;
            }
            end += 1;
        }
        if end >= bytes.len() {
            break;
        }
        if let Ok(content) = std::str::from_utf8(&bytes[osc_start..end]) {
            if let Some(rest) = content.strip_prefix("7;file://") {
                // rest = "hostname/path" or "/path" (empty hostname)
                let path = if rest.starts_with('/') {
                    rest.to_string()
                } else if let Some(slash) = rest.find('/') {
                    rest[slash..].to_string()
                } else {
                    "/".to_string()
                };
                return Some((url_decode(&path), end + term_len));
            }
        }
        i = end + term_len.max(1);
    }
    None
}

/// Percent-decode a URL path segment (e.g. `%20` → space).
fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        // Percent-escapes carry the *bytes* of the path's UTF-8 encoding, so
        // collect them as bytes and decode once at the end: pushing each byte as
        // a `char` turned "%E4%B8%AD" into three Latin-1 characters instead of 中,
        // so any non-ASCII directory appeared mangled in the file panel.
        if bytes[i] == b'%'
            && i + 2 < bytes.len()
            && bytes[i + 1].is_ascii_hexdigit()
            && bytes[i + 2].is_ascii_hexdigit()
        {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or_default();
            if let Ok(byte) = u8::from_str_radix(hex, 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Commands posted to the worker task by the UI.
#[derive(Debug)]
pub enum SessionCommand {
    /// Send raw bytes directly to the PTY (individual keystrokes, no modification).
    RawInput(Vec<u8>),
    /// Notify the remote PTY of a terminal resize.
    Resize(u32, u32),
    /// Gracefully disconnect and drop the session.
    Close,
}

/// Carries the user's answer to a host-key confirmation prompt back to the
/// blocked `check_server_key` handler. Wrapped in `Arc<Mutex<Option<…>>>` so the
/// enclosing [`SessionEvent`] stays `Clone` (a bare `oneshot::Sender` is not);
/// the first `respond` consumes the sender, later calls are no-ops.
#[derive(Clone)]
pub struct HostKeyResponder(
    Arc<std::sync::Mutex<Option<tokio::sync::oneshot::Sender<bool>>>>,
);

impl HostKeyResponder {
    pub fn new(tx: tokio::sync::oneshot::Sender<bool>) -> Self {
        Self(Arc::new(std::sync::Mutex::new(Some(tx))))
    }

    /// Deliver the user's decision (`true` = trust). Idempotent.
    pub fn respond(&self, accept: bool) {
        if let Ok(mut guard) = self.0.lock() {
            if let Some(tx) = guard.take() {
                let _ = tx.send(accept);
            }
        }
    }
}

impl std::fmt::Debug for HostKeyResponder {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("HostKeyResponder")
    }
}

/// The user's answer to a connect-time credential prompt: `(username, password,
/// remember)`, or `None` if they cancelled.
pub type CredentialReply = (String, String, bool);

/// Carries the credential prompt's answer back to the blocked auth flow (#110).
/// `Arc<Mutex<Option<…>>>` so the enclosing [`SessionEvent`] stays `Clone`.
#[derive(Clone)]
pub struct CredentialResponder(
    Arc<std::sync::Mutex<Option<tokio::sync::oneshot::Sender<Option<CredentialReply>>>>>,
);

impl CredentialResponder {
    pub fn new(tx: tokio::sync::oneshot::Sender<Option<CredentialReply>>) -> Self {
        Self(Arc::new(std::sync::Mutex::new(Some(tx))))
    }

    /// Deliver the user's answer (`None` = cancelled). Idempotent.
    pub fn respond(&self, reply: Option<CredentialReply>) {
        if let Ok(mut guard) = self.0.lock() {
            if let Some(tx) = guard.take() {
                let _ = tx.send(reply);
            }
        }
    }
}

impl std::fmt::Debug for CredentialResponder {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("CredentialResponder")
    }
}

/// One process row sampled from the remote `ps` (#23). CPU/mem are percentages
/// as reported by `ps` (pcpu/pmem); `command` is the (width-truncated) args.
#[derive(Debug, Clone)]
pub struct ProcInfo {
    pub pid: u32,
    pub user: String,
    pub cpu: f32,
    pub mem: f32,
    pub command: String,
}

/// Events emitted back to the UI thread.
#[derive(Debug, Clone)]
pub enum SessionEvent {
    /// Free-form status text for the tab header / status line.
    Status(String),
    /// A chunk of stdout/stderr output from the remote shell.
    Output(String),
    /// Connection is up.
    Connected,
    /// Connection closed (either cleanly or after an error).
    Closed(String),
    /// The server presented a host key that is unknown or has changed; the UI
    /// must show a confirmation dialog and answer via `responder` (#109-5). The
    /// handler is blocked awaiting that answer.
    HostKeyPrompt {
        host: String,
        port: u16,
        key_type: String,
        fingerprint: String,
        /// True when a *different* key was previously stored (possible MITM).
        changed: bool,
        responder: HostKeyResponder,
    },
    /// The session is missing a username and/or password; the UI must prompt for
    /// them and answer via `responder`. The auth flow is blocked meanwhile (#110).
    CredentialPrompt {
        session_id: String,
        host: String,
        user: String,
        need_user: bool,
        need_password: bool,
        responder: CredentialResponder,
    },
    /// Remote machine resource sample (from the monitor channel).
    /// Memory/swap are in KiB (as reported by /proc/meminfo).
    ResourceStats {
        cpu_percent: f32,
        mem_used_kib: u64,
        mem_total_kib: u64,
        swap_used_kib: u64,
        swap_total_kib: u64,
        /// Per-interface (name, rx_bytes_per_sec, tx_bytes_per_sec).
        net: Vec<(String, u64, u64)>,
        /// Per-filesystem (mount_point, available_bytes, total_bytes).
        disks: Vec<(String, u64, u64)>,
        /// Top processes by CPU (#23). Empty if the host's `ps` is unusable.
        procs: Vec<ProcInfo>,
    },

    // --- Shell notifications -----------------------------------------------
    /// The shell's current working directory changed (parsed from OSC 7).
    CwdChanged(String),
    /// ZMODEM transfer progress / completion. Produced by `zmodem.rs`; no
    /// consumer yet — the bridge layer lists it as intentionally ignored.
    TransferProgress {
        id: String,
        name: String,
        is_upload: bool,
        transferred: u64,
        total: u64,
        state: u8, // 0 = active, 1 = done, 2 = error
        msg: String,
    },
}

/// Handle retained by the UI layer to talk to a running session.
pub struct SessionHandle {
    pub tab_id: String,
    pub commands: UnboundedSender<SessionCommand>,
    pub join: JoinHandle<()>,
    /// SSH connection handle for runtime port-forwarding management.
    /// Set internally once the SSH session is fully established.
    pub ssh_handle: Arc<std::sync::Mutex<Option<Arc<russh::client::Handle<ClientHandler>>>>>,
    /// Clone of the session event sender, for external forwarding management.
    pub events: UnboundedSender<SessionEvent>,
}

impl SessionHandle {
    pub fn send_raw(&self, bytes: Vec<u8>) {
        let _ = self.commands.send(SessionCommand::RawInput(bytes));
    }
}

/// Entry point: spawn a session on the shared tokio runtime.
///
/// `initial_cols` / `initial_rows` are the PTY dimensions to request when
/// opening the channel. Slint fires a `terminal-resize` callback very shortly
/// after the tab becomes active; passing the best-known size here avoids the
/// remote shell starting at a stale 80×24 and sending an extra SIGWINCH.
///
/// Returns a [`SessionHandle`] for the UI + an [`UnboundedReceiver`] the UI
/// should drain on the Slint event loop.
pub fn spawn_session(
    runtime: &tokio::runtime::Handle,
    tab_id: String,
    session: Session,
    initial_cols: u32,
    initial_rows: u32,
) -> (SessionHandle, UnboundedReceiver<SessionEvent>) {
    let (cmd_tx, cmd_rx) = mpsc::unbounded_channel::<SessionCommand>();
    let (evt_tx, evt_rx) = mpsc::unbounded_channel::<SessionEvent>();

    let evt_tx_for_task = evt_tx.clone();
    let ssh_cell: Arc<std::sync::Mutex<Option<Arc<russh::client::Handle<ClientHandler>>>>> =
        Arc::new(std::sync::Mutex::new(None));
    let ssh_cell_task = ssh_cell.clone();
    let join = runtime.spawn(async move {
        if let Err(err) = run_session(
            session,
            cmd_rx,
            evt_tx_for_task.clone(),
            initial_cols,
            initial_rows,
            ssh_cell_task,
        )
        .await
        {
            tracing::warn!("ssh session ended with error: {err:#}");
            let _ = evt_tx_for_task.send(SessionEvent::Closed(format!("{err:#}")));
        }
    });

    (
        SessionHandle {
            tab_id,
            commands: cmd_tx,
            join,
            ssh_handle: ssh_cell,
            events: evt_tx,
        },
        evt_rx,
    )
}

async fn run_session(
    session: Session,
    mut commands: UnboundedReceiver<SessionCommand>,
    events: UnboundedSender<SessionEvent>,
    initial_cols: u32,
    initial_rows: u32,
    ssh_cell: Arc<std::sync::Mutex<Option<Arc<russh::client::Handle<ClientHandler>>>>>,
) -> Result<()> {
    let _ = events.send(SessionEvent::Status(format!(
        "{} {}@{}:{} ...",
        t("连接中", "Connecting"),
        session.user, session.host, session.port
    )));

    let config = Arc::new(client::Config {
        inactivity_timeout: Some(std::time::Duration::from_secs(60 * 10)),
        // Offer the compatibility algorithm lists so old servers and network
        // gear still negotiate; see COMPAT_KEX / COMPAT_CIPHER above.
        preferred: russh::Preferred {
            kex: std::borrow::Cow::Borrowed(COMPAT_KEX),
            cipher: std::borrow::Cow::Borrowed(COMPAT_CIPHER),
            ..russh::Preferred::DEFAULT
        },
        ..<_>::default()
    });

    // Remote (-R) forwards are serviced inside the handler when the server
    // opens channels back, so it needs the bind-port → local-target map up
    // front (the handler is moved into `connect`) (#56).
    let remote_forwards: std::collections::HashMap<u32, (String, u16)> = session
        .forwards
        .iter()
        .filter(|f| f.kind == "remote")
        .map(|f| (f.bind_port as u32, (f.host.clone(), f.host_port)))
        .collect();
    let handler = ClientHandler {
        host: session.host.clone(),
        port: session.port,
        remote_forwards,
        events: events.clone(),
    };
    let addr = format!("{}:{}", session.host, session.port);
    // Connect directly, or tunnel through a SOCKS5 / HTTP proxy (issue #7).
    let mut handle = match crate::proxy::resolve(&session.proxy) {
        Some(p) => {
            let _ = events.send(SessionEvent::Status(format!(
                "{} {} → {}",
                t("经代理连接", "via proxy"),
                crate::proxy::describe(&p),
                addr
            )));
            let stream = crate::proxy::connect(&p, &session.host, session.port)
                .await
                .with_context(|| format!("proxy connect to {} failed", addr))?;
            client::connect_stream(config, stream, handler)
                .await
                .with_context(|| format!("connect {} failed", addr))?
        }
        None => client::connect(config, addr.as_str(), handler)
            .await
            .with_context(|| format!("connect {} failed", addr))?,
    };

    // Resolve missing username/password by prompting the user (#110).
    let (user, password) = match resolve_credentials(&session, &events).await {
        Some(c) => c,
        None => {
            let _ = events.send(SessionEvent::Closed(t("已取消登录", "login cancelled").into()));
            let _ = handle
                .disconnect(Disconnect::ByApplication, "cancelled", "")
                .await;
            return Ok(());
        }
    };

    // --- Auth ----------------------------------------------------------
    let authed = match session.auth {
        AuthMethod::Password => handle
            .authenticate_password(&user, password.as_str())
            .await
            .context("password auth failed")?,
        AuthMethod::Key => {
            let raw = session.private_key_path.trim();
            if raw.is_empty() {
                return Err(anyhow!(t("私钥路径为空", "private key path is empty")));
            }
            // Normalise separators (we store `/` everywhere) and be forgiving if
            // the user pointed at the `.pub` *public* key — the private key is the
            // same path without that suffix.
            let normalised = raw.replace('\\', "/");
            let key_path = normalised
                .strip_suffix(".pub")
                .map(str::to_string)
                .unwrap_or(normalised);
            // An encrypted private key needs its passphrase; we reuse the
            // session's password field for it (empty = unencrypted key) (#90).
            let pass = password.as_str();
            let keypair = load_session_private_key(
                &key_path,
                if pass.is_empty() { None } else { Some(pass) },
            )?;
            // RSA keys must be signed with an explicit SHA-2 hash; every other
            // key type carries its own algorithm, so no override is needed.
            let hash = keypair.algorithm().is_rsa().then_some(HashAlg::Sha256);
            let key_with_hash = PrivateKeyWithHashAlg::new(Arc::new(keypair), hash)
                .context("invalid private key / hash algorithm combination")?;
            handle
                .authenticate_publickey(&user, key_with_hash)
                .await
                .context("publickey auth failed")?
        }
    };

    if !authed {
        tracing::warn!("ssh authentication failed for {}@{}", user, session.host);
        let _ = events.send(SessionEvent::Closed(t("认证失败", "authentication failed").into()));
        let _ = handle
            .disconnect(Disconnect::ByApplication, "auth failed", "")
            .await;
        return Ok(());
    }

    // --- Shell channel --------------------------------------------------
    let mut channel = handle
        .channel_open_session()
        .await
        .context("open session channel")?;

    channel
        .request_pty(
            true,
            "xterm-256color",
            initial_cols,
            initial_rows,
            0,
            0,
            &[],
        )
        .await
        .context("request PTY")?;
    channel.request_shell(true).await.context("request shell")?;

    let _ = events.send(SessionEvent::Connected);
    let _ = events.send(SessionEvent::Status(format!(
        "{} {}@{}",
        t("已连接", "Connected"),
        session.user, session.host
    )));

    // Whether we have already injected the PROMPT_COMMAND setup.
    // We wait for the first non-empty data chunk (the initial shell prompt)
    // before sending so the command doesn't interleave with banner text.
    let mut prompt_injected = false;
    // True from injecting PROMPT_SETUP until the echoed setup line has been
    // received and stripped; output is buffered (not shown) during that window.
    let mut suppress_echo = false;
    // Buffers output while `suppress_echo` so the (long) echoed setup line can be
    // stripped even when it splits across reads (#98).
    let mut echo_buf = String::new();
    // How long to keep buffering when the injected setup line never reports back
    // (a shell without PROMPT_COMMAND, a mangled echo, …). Without this the
    // window only ends on the 16 KiB cap, so a shell that goes quiet shows
    // nothing at all until it happens to print 16 KiB.
    const ECHO_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);
    // When the suppression window started, so ECHO_TIMEOUT can be applied.
    let mut suppress_echo_at: Option<std::time::Instant> = None;
    // Trailing bytes of an incomplete UTF-8 character, held until the next chunk.
    let mut pending_utf8: Vec<u8> = Vec::new();
    // After a ZMODEM transfer finishes we briefly ignore ZMODEM detection so the
    // sender's lingering close frames can't spawn a spurious second receive (#76).
    let mut zmodem_done_at: Option<std::time::Instant> = None;

    // Cwd-notification (OSC 7) setup, injected once after the first prompt so
    // the SFTP panel can follow `cd` (#91). It must work across shells:
    //   • bash/sh  → PROMPT_COMMAND runs `__ms7` before every prompt.
    //   • zsh      → bash's PROMPT_COMMAND is IGNORED by zsh, so we register a
    //                `precmd` hook via `add-zsh-hook` instead (non-destructive —
    //                it preserves oh-my-zsh / p10k hooks, unlike `precmd(){…}`).
    //   • fish     → guarded out (fish 3.1+ emits OSC 7 itself).
    // `__ms7` is called once at the end so the initial cwd arrives immediately.
    //
    // The whole shell-specific body lives inside `eval '…'`: fish can't parse
    // bash/zsh function & `if` syntax, but it CAN parse `eval '<opaque string>'`,
    // and the `test -z "$FISH_VERSION" &&` guard short-circuits before the eval
    // ever runs under fish (#71). The body uses only double quotes inside so the
    // outer single-quoted string needs no escaping; printf turns \033/\007 into
    // ESC/BEL at prompt time. No array syntax → safe to *parse* in dash/ash too.
    //
    // The leading space keeps the line out of shell history (HISTCONTROL=
    // ignorespace, the default on most distros); its echo is stripped locally
    // (the needle below) so the bookkeeping command never shows up.
    //
    // The echoed setup line is discarded by anchoring on the OSC 7 it produces
    // (see the suppress block below), so it doesn't matter that the long line
    // wraps — we never substring-match it.
    const PROMPT_BODY: &str = "test -z \"$FISH_VERSION\" && eval '__ms7(){ printf \"\\033]7;file://%s%s\\007\" \"$HOSTNAME\" \"$PWD\"; }; if [ -n \"$ZSH_VERSION\" ]; then autoload -Uz add-zsh-hook 2>/dev/null; add-zsh-hook precmd __ms7; else PROMPT_COMMAND=\"__ms7${PROMPT_COMMAND:+;$PROMPT_COMMAND}\"; fi; __ms7'";
    let prompt_setup = format!(" {}\r", PROMPT_BODY);

    // --- Remote resource monitor (separate exec channel) ----------------
    // A tiny remote loop streams /proc/stat + /proc/meminfo every 2s; we parse
    // it into CPU% / mem / swap for the sidebar.  Best-effort: if the channel
    // or exec fails (e.g. a non-Linux host without /proc), monitoring is
    // silently skipped and the interactive shell is unaffected.
    // Reset PATH to the standard system directories first (#27): the monitor
    // runs over an exec channel, so a server with a hijacked PATH (or a
    // BASH_ENV pointing at a malicious file) could otherwise shadow awk/cat/df/
    // sleep with arbitrary binaries. A fixed PATH covering /usr/bin and /bin is
    // more portable than hardcoding one absolute path per tool (their location
    // differs across distros). Monitoring is best-effort, so even if this shell
    // is unusual and the reset finds nothing, only the sidebar stats are lost.
    // The `ps` section feeds the process monitor (#23): top-40 by CPU, columns
    // pid/user/pcpu/pmem/args, each line clipped to 200 chars so a giant command
    // line can't bloat the stream. A host whose `ps` lacks `--sort`/`-o` simply
    // yields nothing (2>/dev/null), degrading to an empty process list.
    const MON_CMD: &[u8] = b"PATH=/usr/bin:/bin:/usr/sbin:/sbin; export PATH; while :; do awk '/^cpu /{print}' /proc/stat; awk '/^(MemTotal|MemAvailable|SwapTotal|SwapFree):/{print}' /proc/meminfo; cat /proc/net/dev; echo __DF__; df -kP 2>/dev/null; echo __PS__; ps -eo pid,user,pcpu,pmem,args --sort=-pcpu 2>/dev/null | head -n 41 | cut -c -200; echo __MSTICK__; sleep 2; done\n";
    let mut mon_channel = match handle.channel_open_session().await {
        Ok(ch) => match ch.exec(true, MON_CMD).await {
            Ok(()) => Some(ch),
            Err(e) => {
                tracing::warn!("monitor exec failed: {e}");
                None
            }
        },
        Err(e) => {
            tracing::warn!("monitor channel open failed: {e}");
            None
        }
    };
    let mut mon_buf = String::new();
    let mut prev_cpu: Option<(u64, u64)> = None; // (total jiffies, idle jiffies)
    let mut prev_net: std::collections::HashMap<String, (u64, u64)> =
        std::collections::HashMap::new(); // iface -> (rx_bytes, tx_bytes)
    let mut prev_net_at = std::time::Instant::now();

    // --- Port forwarding / tunnels (#56) --------------------------------
    // Remote (-R) first, while we still hold `handle` mutably (tcpip_forward
    // takes &mut self); the server then opens channels back, serviced in the
    // handler. Then wrap the handle in an Arc so the local/dynamic listener
    // tasks can share it (russh's Handle isn't Clone, but its methods are &self).
    for f in session.forwards.iter().filter(|f| f.kind == "remote") {
        let bind = if f.bind_addr.trim().is_empty() {
            "127.0.0.1".to_string()
        } else {
            f.bind_addr.trim().to_string()
        };
        match handle.tcpip_forward(bind.clone(), f.bind_port as u32).await {
            Ok(_) => {
                let _ = events.send(SessionEvent::Output(format!(
                    "\r\n[meatshell] -R {bind}:{} → {}:{}\r\n",
                    f.bind_port, f.host, f.host_port
                )));
            }
            Err(e) => {
                let _ = events.send(SessionEvent::Output(format!(
                    "\r\n[meatshell] -R {bind}:{} 请求失败 / request failed: {e}\r\n",
                    f.bind_port
                )));
            }
        }
    }
    let handle = Arc::new(handle);
    // Expose the SSH handle for runtime port-forwarding management
    *ssh_cell.lock().unwrap() = Some(handle.clone());
    // Local (-L) and dynamic (-D) listen client-side; their tasks are aborted
    // on session exit.
    let mut forward_tasks: Vec<JoinHandle<()>> = Vec::new();
    for f in &session.forwards {
        match f.kind.as_str() {
            "local" => forward_tasks.push(crate::forward::spawn_local(
                handle.clone(),
                f.bind_addr.clone(),
                f.bind_port,
                f.host.clone(),
                f.host_port,
                events.clone(),
            )),
            "dynamic" => forward_tasks.push(crate::forward::spawn_dynamic(
                handle.clone(),
                f.bind_addr.clone(),
                f.bind_port,
                events.clone(),
            )),
            _ => {}
        }
    }

    // --- Main pump ------------------------------------------------------
    loop {
        tokio::select! {
            cmd = commands.recv() => {
                match cmd {
                    Some(SessionCommand::RawInput(bytes)) => {
                        // Only log the byte count — never the bytes themselves,
                        // which are raw keystrokes and may contain passwords (#15).
                        tracing::debug!("ssh channel.data len={} bytes", bytes.len());
                        if let Err(err) = channel.data(&bytes[..]).await {
                            let _ = events.send(SessionEvent::Closed(format!("{}: {err}", t("写入失败", "write failed"))));
                            break;
                        }
                    }
                    Some(SessionCommand::Resize(cols, rows)) => {
                        let _ = channel.window_change(cols, rows, 0, 0).await;
                    }
                    Some(SessionCommand::Close) | None => {
                        let _ = channel.eof().await;
                        break;
                    }
                }
            }
            msg = channel.wait() => {
                match msg {
                    Some(ChannelMsg::Data { data }) => {
                        // A `sz` in the terminal starts a ZMODEM send. Receive it
                        // straight to the Downloads dir (FinalShell style, #76).
                        // On any protocol error, cancel so the session recovers.
                        let zmodem_cooldown = zmodem_done_at
                            .is_some_and(|t| t.elapsed() < std::time::Duration::from_secs(2));
                        if !zmodem_cooldown && contains_zmodem_init(&data) {
                            let result =
                                crate::zmodem::receive(&mut channel, &data, &events).await;
                            zmodem_done_at = Some(std::time::Instant::now());
                            match result {
                                Ok(leftover) => {
                                    // Bytes after the transfer (the shell prompt):
                                    // run them through the normal output path so
                                    // the prompt shows and the cwd updates.
                                    if !leftover.is_empty() {
                                        let text =
                                            String::from_utf8_lossy(&leftover).into_owned();
                                        if let Some(cwd) = extract_osc7_path(&text) {
                                            let _ =
                                                events.send(SessionEvent::CwdChanged(cwd));
                                        }
                                        let _ = events.send(SessionEvent::Output(text));
                                    }
                                }
                                Err(e) => {
                                    tracing::warn!("zmodem receive failed: {e:#}");
                                    let _ = channel.data(&ZMODEM_CANCEL[..]).await;
                                    let _ = events.send(SessionEvent::Output(format!(
                                        "\r\n[meatshell] {}: {e}\r\n",
                                        t("ZMODEM 接收失败,已取消", "ZMODEM receive failed; cancelled")
                                    ).into()));
                                }
                            }
                            continue;
                        }

                        let chunk = decode_utf8_chunk(&mut pending_utf8, &data);

                        // Inject PROMPT_COMMAND after the first real shell output.
                        if !prompt_injected && !chunk.trim().is_empty() {
                            prompt_injected = true;
                            suppress_echo = true;
                            suppress_echo_at = Some(std::time::Instant::now());
                            let _ = channel.data(prompt_setup.as_bytes()).await;
                            // Fall through: this chunk is buffered below so the
                            // echoed setup line is stripped as a single piece.
                        }

                        // While suppressing, buffer output until our echoed setup
                        // command AND the OSC 7 that the injected __ms7 prints right
                        // after it have both arrived. Then delete just that span —
                        // from the start of the command's line through the OSC 7 —
                        // which removes the echoed command (even if it WRAPPED across
                        // the terminal width, since we cut by byte range) and the
                        // now-redundant first prompt, while PRESERVING any MOTD/banner
                        // printed before it (#98). The command line is located by a
                        // short, un-wrappable prefix of the injected command. A size
                        // cap is the safety valve for a shell that never reports back
                        // (e.g. dash without PROMPT_COMMAND).
                        const PROMPT_PREFIX: &str = "test -z \"$FISH_VERSION\"";
                        let text = if suppress_echo {
                            echo_buf.push_str(&chunk);
                            const ECHO_BUF_CAP: usize = 1 << 14; // 16 KiB
                            // The command echo + its trailing OSC 7 (the one after
                            // our command, not any earlier prompt OSC 7).
                            let landed = echo_buf.find(PROMPT_PREFIX).and_then(|p| {
                                extract_osc7_end(&echo_buf[p..])
                                    .map(|(cwd, rel)| (p, p + rel, cwd))
                            });
                            if let Some((cmd_pos, osc_end, cwd)) = landed {
                                suppress_echo = false;
                                tracing::debug!("OSC7 cwd={:?}", cwd);
                                let _ = events.send(SessionEvent::CwdChanged(cwd));
                                let mut buf = std::mem::take(&mut echo_buf);
                                let line_start =
                                    buf[..cmd_pos].rfind('\n').map(|i| i + 1).unwrap_or(0);
                                buf.replace_range(line_start..osc_end, "");
                                buf
                            } else if echo_buf.len() >= ECHO_BUF_CAP
                                || suppress_echo_at
                                    .is_some_and(|at| at.elapsed() >= ECHO_TIMEOUT)
                            {
                                suppress_echo = false;
                                std::mem::take(&mut echo_buf)
                            } else {
                                continue; // keep buffering; show nothing yet
                            }
                        } else {
                            // Scan for the OSC 7 CWD notification (cd-follow).
                            if let Some(cwd) = extract_osc7_path(&chunk) {
                                tracing::debug!("OSC7 cwd={:?}", cwd);
                                let _ = events.send(SessionEvent::CwdChanged(cwd));
                            }
                            chunk
                        };

                        let _ = events.send(SessionEvent::Output(text));
                    }
                    Some(ChannelMsg::ExtendedData { data, ext: _ }) => {
                        // Same decoder as stdout: the terminal interleaves both
                        // streams, so a character split across the two would be
                        // corrupted just like one split across two packets.
                        let text = decode_utf8_chunk(&mut pending_utf8, &data);
                        let _ = events.send(SessionEvent::Output(text));
                    }
                    Some(ChannelMsg::ExitStatus { exit_status }) => {
                        let _ = events.send(SessionEvent::Status(
                            format!("{} (code {exit_status})", t("远程进程退出", "remote process exited")),
                        ));
                    }
                    Some(ChannelMsg::Close) | None => {
                        break;
                    }
                    _ => {}
                }
            }
            // Remote resource monitor channel.  The `async { ... }` lets us poll
            // an Option<Channel>: once the monitor channel closes we replace it
            // with `pending()` so this arm simply never fires again.
            mon = async {
                match mon_channel.as_mut() {
                    Some(ch) => ch.wait().await,
                    None => std::future::pending().await,
                }
            } => {
                match mon {
                    Some(ChannelMsg::Data { data }) => {
                        mon_buf.push_str(&String::from_utf8_lossy(&data));
                        // Process every complete sample terminated by the marker.
                        while let Some(idx) = mon_buf.find("__MSTICK__") {
                            let block = mon_buf[..idx].to_string();
                            let rest = mon_buf[idx + "__MSTICK__".len()..]
                                .trim_start_matches(['\r', '\n'])
                                .to_string();
                            mon_buf = rest;
                            if let Some(stats) = parse_monitor_block(
                                &block,
                                &mut prev_cpu,
                                &mut prev_net,
                                &mut prev_net_at,
                            ) {
                                let _ = events.send(stats);
                            }
                        }
                        // Bound the leftover (incomplete) tail: a server that
                        // streams data but never emits the __MSTICK__ marker must
                        // not grow this buffer without limit (memory DoS, #27).
                        // A real sample is a few KiB; 1 MiB is a generous ceiling.
                        const MON_BUF_CAP: usize = 1 << 20;
                        if mon_buf.len() > MON_BUF_CAP {
                            mon_buf.clear();
                        }
                    }
                    Some(ChannelMsg::Close) | None => {
                        mon_channel = None;
                    }
                    _ => {}
                }
            }
        }
    }

    // Tear down any port-forward listeners (#56); -R forwards die with the
    // session's disconnect below.
    for task in forward_tasks {
        task.abort();
    }

    // Explicitly close the monitor channel so the server-side
    // monitoring loop is terminated cleanly.
    if let Some(mon_ch) = mon_channel.take() {
        let _ = mon_ch.eof().await;
        let _ = mon_ch.close().await;
    }

    let _ = handle
        .disconnect(Disconnect::ByApplication, "bye", "")
        .await;
    // The shell pump loop only exits when the channel closes / EOFs (incl. a
    // peer/bastion-initiated disconnect), so record it for #86 diagnostics.
    tracing::warn!("ssh connection closed ({}@{})", session.user, session.host);
    let _ = events.send(SessionEvent::Closed(t("连接已关闭", "connection closed").into()));
    Ok(())
}

/// Parse one monitor sample (a block of `/proc/stat` cpu line + `/proc/meminfo`
/// fields) into a [`SessionEvent::ResourceStats`].
///
/// CPU usage needs two consecutive `/proc/stat` snapshots; `prev` carries the
/// previous (total, idle) jiffies across calls.  The first sample therefore
/// reports 0% (no baseline yet).
fn parse_monitor_block(
    block: &str,
    prev: &mut Option<(u64, u64)>,
    prev_net: &mut std::collections::HashMap<String, (u64, u64)>,
    prev_net_at: &mut std::time::Instant,
) -> Option<SessionEvent> {
    let mut cpu_total = 0u64;
    let mut cpu_idle = 0u64;
    let mut have_cpu = false;
    let mut mem_total = 0u64;
    let mut mem_avail = 0u64;
    let mut swap_total = 0u64;
    let mut swap_free = 0u64;
    // Raw /proc/net/dev counters this sample: iface -> (rx_bytes, tx_bytes).
    let mut net_now: Vec<(String, u64, u64)> = Vec::new();
    // Filesystems from `df -kP`: (mount, available_bytes, total_bytes).
    let mut disks: Vec<(String, u64, u64)> = Vec::new();
    // Processes from `ps` (#23): top-by-CPU rows.
    let mut procs: Vec<ProcInfo> = Vec::new();
    // The sample is split into sections by `echo` markers; everything before the
    // first marker is the cpu/mem/net block.
    enum Section {
        Top,
        Df,
        Ps,
    }
    let mut section = Section::Top;

    // Cap how many interfaces / filesystems / processes we accept from one sample
    // so a hostile server can't flood the parser and sidebar with fabricated rows
    // (#27). No real machine has anywhere near this many.
    const MAX_MON_ENTRIES: usize = 64;

    for line in block.lines() {
        if line == "__DF__" {
            section = Section::Df;
            continue;
        }
        if line == "__PS__" {
            section = Section::Ps;
            continue;
        }
        match section {
            Section::Df => {
                if disks.len() < MAX_MON_ENTRIES {
                    if let Some(d) = parse_df_line(line) {
                        disks.push(d);
                    }
                }
                continue;
            }
            Section::Ps => {
                if procs.len() < MAX_MON_ENTRIES {
                    if let Some(p) = parse_ps_line(line) {
                        procs.push(p);
                    }
                }
                continue;
            }
            Section::Top => {}
        }
        if let Some(rest) = line.strip_prefix("cpu ") {
            let nums: Vec<u64> = rest
                .split_whitespace()
                .filter_map(|x| x.parse().ok())
                .collect();
            // user nice system idle iowait irq softirq steal ...
            if nums.len() >= 4 {
                // Saturating arithmetic: a server can send arbitrary jiffy
                // values, and a plain sum/add would panic on overflow in debug.
                cpu_total = nums.iter().copied().fold(0u64, u64::saturating_add);
                cpu_idle = nums[3].saturating_add(nums.get(4).copied().unwrap_or(0)); // idle + iowait
                have_cpu = true;
            }
        } else if let Some(v) = line.strip_prefix("MemTotal:") {
            mem_total = parse_meminfo_kib(v);
        } else if let Some(v) = line.strip_prefix("MemAvailable:") {
            mem_avail = parse_meminfo_kib(v);
        } else if let Some(v) = line.strip_prefix("SwapTotal:") {
            swap_total = parse_meminfo_kib(v);
        } else if let Some(v) = line.strip_prefix("SwapFree:") {
            swap_free = parse_meminfo_kib(v);
        } else if net_now.len() < MAX_MON_ENTRIES {
            if let Some((iface, counters)) = parse_net_dev_line(line) {
                net_now.push((iface, counters.0, counters.1));
            }
        }
    }

    // Convert raw byte counters into per-second rates using the previous sample.
    let now = std::time::Instant::now();
    let elapsed = now.duration_since(*prev_net_at).as_secs_f64().max(0.001);
    let mut net: Vec<(String, u64, u64)> = Vec::new();
    if !net_now.is_empty() {
        for (iface, rx, tx) in &net_now {
            if let Some((prx, ptx)) = prev_net.get(iface) {
                let rx_bps = (rx.saturating_sub(*prx) as f64 / elapsed) as u64;
                let tx_bps = (tx.saturating_sub(*ptx) as f64 / elapsed) as u64;
                net.push((iface.clone(), rx_bps, tx_bps));
            }
        }
        prev_net.clear();
        for (iface, rx, tx) in net_now {
            prev_net.insert(iface, (rx, tx));
        }
        *prev_net_at = now;
        // Show busiest first so the default-selected NIC is the active one.
        net.sort_by(|a, b| (b.1 + b.2).cmp(&(a.1 + a.2)));
    }

    let cpu_percent = if have_cpu {
        let result = match *prev {
            Some((ptotal, pidle)) => {
                let dt = cpu_total.saturating_sub(ptotal);
                let di = cpu_idle.saturating_sub(pidle);
                if dt > 0 {
                    (1.0 - di as f32 / dt as f32).clamp(0.0, 1.0)
                } else {
                    0.0
                }
            }
            None => 0.0,
        };
        *prev = Some((cpu_total, cpu_idle));
        result
    } else {
        0.0
    };

    // Need at least memory numbers to be a useful sample.
    if mem_total == 0 {
        return None;
    }

    Some(SessionEvent::ResourceStats {
        cpu_percent,
        mem_used_kib: mem_total.saturating_sub(mem_avail),
        mem_total_kib: mem_total,
        swap_used_kib: swap_total.saturating_sub(swap_free),
        swap_total_kib: swap_total,
        net,
        disks,
        procs,
    })
}

/// Parse one `ps -eo pid,user,pcpu,pmem,args` line into a [`ProcInfo`]. The
/// header row (`PID` is not numeric) and any malformed line yield `None`.
/// `args` (everything past the four fixed columns) keeps internal spacing
/// collapsed — fine for a display-only command column.
fn parse_ps_line(line: &str) -> Option<ProcInfo> {
    let mut it = line.split_whitespace();
    let pid: u32 = it.next()?.parse().ok()?;
    let user = it.next()?.to_string();
    let cpu: f32 = it.next()?.parse().ok()?;
    let mem: f32 = it.next()?.parse().ok()?;
    let command = it.collect::<Vec<_>>().join(" ");
    if command.is_empty() {
        return None;
    }
    Some(ProcInfo {
        pid,
        user,
        cpu,
        mem,
        command,
    })
}

/// Parse one `df -kP` data line into `(mount, available_bytes, total_bytes)`.
/// Columns: `Filesystem 1024-blocks Used Available Capacity Mounted-on`.
fn parse_df_line(line: &str) -> Option<(String, u64, u64)> {
    let f: Vec<&str> = line.split_whitespace().collect();
    if f.len() < 6 || f[0] == "Filesystem" {
        return None;
    }
    let total_kb: u64 = f[1].parse().ok()?;
    let avail_kb: u64 = f[3].parse().ok()?;
    if total_kb == 0 {
        return None;
    }
    // Mount point is the last column (joined in case it contains spaces).
    let mount = f[5..].join(" ");
    // Saturating: a server can report arbitrary block counts; KiB→bytes must
    // not overflow-panic in debug (#27).
    Some((mount, avail_kb.saturating_mul(1024), total_kb.saturating_mul(1024)))
}

/// Extract the leading integer (KiB) from a `/proc/meminfo` value like
/// `"  3288560 kB"`.
fn parse_meminfo_kib(s: &str) -> u64 {
    s.split_whitespace()
        .next()
        .and_then(|x| x.parse().ok())
        .unwrap_or(0)
}

/// Parse one `/proc/net/dev` data line into `(iface, (rx_bytes, tx_bytes))`.
/// Format: `  eth0: <rx_bytes> <rx_pkts> ... <tx_bytes> <tx_pkts> ...`
/// (16 numeric columns; rx_bytes is col 0, tx_bytes is col 8).  The `lo`
/// loopback interface is skipped — it never reflects real traffic.
fn parse_net_dev_line(line: &str) -> Option<(String, (u64, u64))> {
    let (name, rest) = line.split_once(':')?;
    let iface = name.trim();
    if iface.is_empty() || iface == "lo" || iface.contains(' ') {
        return None;
    }
    let nums: Vec<u64> = rest
        .split_whitespace()
        .filter_map(|x| x.parse().ok())
        .collect();
    if nums.len() < 9 {
        return None;
    }
    Some((iface.to_string(), (nums[0], nums[8])))
}

/// Client handler. Verifies the server host key against the known_hosts store,
/// prompting the user on first contact / on a changed key (#109-5).
///
/// Carries the remote-forward (-R) map so we can service channels the server
/// opens back to us: server bind-port → local `(host, port)` target (#56).
pub struct ClientHandler {
    pub host: String,
    pub port: u16,
    pub remote_forwards: std::collections::HashMap<u32, (String, u16)>,
    pub events: UnboundedSender<SessionEvent>,
}

/// Summary of one active port-forward tunnel for the UI.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PortForwardInfo {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub bind_addr: String,
    pub bind_port: u16,
    pub host: String,
    pub host_port: u16,
}

/// Shared host-key check used by both the shell and SFTP connections: trust a
/// matching stored key silently; otherwise ask the UI (via `events`) and, on
/// acceptance, remember the key. A dropped/closed reply channel (UI gone)
/// counts as a rejection so we never connect to an unverified host.
pub(crate) async fn verify_host_key(
    host: &str,
    port: u16,
    key: &PublicKey,
    events: &UnboundedSender<SessionEvent>,
) -> bool {
    use crate::known_hosts::HostKeyStatus;
    match crate::known_hosts::verify(host, port, key) {
        HostKeyStatus::Match => true,
        status => {
            let changed = status == HostKeyStatus::Changed;
            let (tx, rx) = tokio::sync::oneshot::channel();
            let sent = events.send(SessionEvent::HostKeyPrompt {
                host: host.to_string(),
                port,
                key_type: key.algorithm().to_string(),
                fingerprint: crate::known_hosts::fingerprint(key),
                changed,
                responder: HostKeyResponder::new(tx),
            });
            if sent.is_err() {
                return false; // no UI to ask
            }
            match rx.await {
                Ok(true) => {
                    if let Err(e) = crate::known_hosts::remember(host, port, key) {
                        tracing::warn!("could not save host key for {host}:{port}: {e:#}");
                    }
                    true
                }
                _ => false,
            }
        }
    }
}

/// Resolve a session's username/password, prompting the UI for whatever is
/// missing (#110). Returns the effective `(user, password)`, or `None` if the
/// user cancelled. Both the shell and SFTP connections call this; the UI
/// de-duplicates by session id so a single dialog serves both. A dropped reply
/// channel (no UI) falls through with the stored values so auth fails normally.
pub(crate) async fn resolve_credentials(
    session: &Session,
    events: &UnboundedSender<SessionEvent>,
) -> Option<(String, String)> {
    let mut user = session.user.trim().to_string();
    let mut password = session.password.as_str().to_string();
    let need_user = user.is_empty();
    let need_password =
        matches!(session.auth, AuthMethod::Password) && password.is_empty();
    if !(need_user || need_password) {
        return Some((user, password));
    }
    let (tx, rx) = tokio::sync::oneshot::channel();
    let sent = events.send(SessionEvent::CredentialPrompt {
        session_id: session.id.clone(),
        host: session.host.clone(),
        user: user.clone(),
        need_user,
        need_password,
        responder: CredentialResponder::new(tx),
    });
    if sent.is_err() {
        return Some((user, password));
    }
    match rx.await {
        Ok(Some((u, p, _remember))) => {
            if need_user {
                user = u.trim().to_string();
            }
            if need_password {
                password = p;
            }
            Some((user, password))
        }
        _ => None,
    }
}

#[async_trait]
impl Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(verify_host_key(&self.host, self.port, server_public_key, &self.events).await)
    }

    async fn data(
        &mut self,
        _channel: ChannelId,
        _data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        Ok(())
    }

    /// Remote forward (-R): the server opened a channel for a connection that
    /// arrived on a port we asked it to listen on. Connect to the configured
    /// local target and splice the two together (#56).
    async fn server_channel_open_forwarded_tcpip(
        &mut self,
        channel: Channel<Msg>,
        connected_address: &str,
        connected_port: u32,
        _originator_address: &str,
        _originator_port: u32,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        let target = self.remote_forwards.get(&connected_port).cloned();
        let events = self.events.clone();
        let bind = connected_address.to_string();
        tokio::spawn(async move {
            let Some((host, port)) = target else {
                tracing::warn!("forwarded-tcpip on {bind}:{connected_port} with no mapping");
                return;
            };
            match tokio::net::TcpStream::connect((host.as_str(), port)).await {
                Ok(mut tcp) => {
                    let mut stream = channel.into_stream();
                    let _ = tokio::io::copy_bidirectional(&mut tcp, &mut stream).await;
                }
                Err(e) => {
                    let _ = events.send(SessionEvent::Output(format!(
                        "\r\n[meatshell] -R {host}:{port} 连接失败 / connect failed: {e}\r\n"
                    )));
                }
            }
        });
        Ok(())
    }
}

// Marker trait impl so `Arc<Handle<Handler>>` is nameable in external code.
#[allow(dead_code)]
fn _assert_handle_send() {
    fn takes<T: Send>() {}
    takes::<Handle<ClientHandler>>();
}

#[cfg(test)]
mod monitor_hardening_tests {
    use super::{parse_df_line, parse_monitor_block};
    use std::collections::HashMap;
    use std::time::Instant;

    #[test]
    fn df_line_saturates_instead_of_overflowing() {
        // avail/total near u64::MAX must not panic on the KiB->bytes multiply.
        let line = "/dev/sda1 18446744073709551615 0 18446744073709551615 100% /";
        let (_, avail, total) = parse_df_line(line).expect("parses");
        assert_eq!(avail, u64::MAX);
        assert_eq!(total, u64::MAX);
    }

    #[test]
    fn cpu_overflow_values_do_not_panic() {
        let big = u64::MAX;
        let block = format!(
            "cpu {big} {big} {big} {big} {big}\nMemTotal: 1000 kB\nMemAvailable: 500 kB"
        );
        let mut prev = None;
        let mut prev_net = HashMap::new();
        let mut at = Instant::now();
        // Must not panic; with no baseline the first sample reports 0% CPU.
        assert!(parse_monitor_block(&block, &mut prev, &mut prev_net, &mut at).is_some());
    }

    #[test]
    fn floods_of_fake_interfaces_are_capped() {
        let mut block = String::from("MemTotal: 1000 kB\nMemAvailable: 500 kB\n");
        for i in 0..500 {
            block.push_str(&format!("eth{i}: 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16\n"));
        }
        let mut prev = None;
        let mut prev_net = HashMap::new();
        let mut at = Instant::now();
        assert!(parse_monitor_block(&block, &mut prev, &mut prev_net, &mut at).is_some());
        // The remembered interface set is capped, not 500.
        assert!(prev_net.len() <= 64, "prev_net held {}", prev_net.len());
    }
}
