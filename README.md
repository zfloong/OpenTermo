# 🥩 meatshell

> A lightweight, multi-protocol terminal client. Built with Rust + Tauri 2 + React.

Meatshell is a SSH / SFTP / Telnet / Serial client that respects your memory.  
Styled like [Tabby](https://tabby.sh), powered by a pure-Rust SSH stack.

## Features

- **SSH** — password, private key, encrypted key (passphrase)
- **SFTP** — browse, upload, download
- **Telnet / Serial** — full support
- **Port forwarding** — local (-L), remote (-R), dynamic (-D, SOCKS5)
- **ZMODEM** — receive files from `sz`
- **Outbound proxy** — SOCKS5 / HTTP CONNECT
- **System monitor** — CPU, memory, swap, network, disk (local + remote)
- **Quick commands** — grouped, searchable, send to multiple sessions
- **Host key verification** — TOFU with change detection
- **Encrypted credentials** — ChaCha20-Poly1305
- **SSH config import** — `~/.ssh/config`
- **I18n** — English / Chinese runtime switch

## Tech Stack

| Layer     | Technology                                    |
| --------- | --------------------------------------------- |
| Frontend  | React 18 + TypeScript + Tailwind CSS + Zustand |
| Terminal  | xterm.js 5.x                                  |
| Shell     | Tauri 2                                       |
| Backend   | Rust (russh, tokio)                           |

## Development

```sh
npm install
cargo tauri dev
```

## Build

CI builds run on every push. Download from [Actions](https://github.com/zfloong/meatshell-app/actions) → latest run → Artifacts.

## License

MIT
