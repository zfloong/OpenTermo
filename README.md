# OpenTermo

> A lightweight, multi-protocol terminal client. Built with Tauri 2 + React + Rust.

OpenTermo is a desktop SSH / SFTP / Telnet / Serial client with a modern glass-morphism UI.  
It is based on [meatshell](https://github.com/jeff141/meatshell), an open-source Rust SSH backend created by [一坨肉 (jeff141)](https://github.com/jeff141).

## Relationship with meatshell

| Component          | Author              | Description                              |
| ------------------ | ------------------- | ---------------------------------------- |
| meatshell/ crate | 一坨肉 (jeff141) | Core Rust SSH/terminal backend (MIT)     |
| Tauri shell / UI   | zfloong             | Desktop app wrapper, React frontend, theme |

This project borrows the meatshell/ Rust library as its terminal backend, and builds a full-featured Tauri v2 desktop application around it.

## Features

- **SSH** — password, private key, encrypted key (passphrase)
- **SFTP** — browse, upload, download
- **Telnet / Serial** — full support
- **Port forwarding** — local (-L), remote (-R), dynamic (-D, SOCKS5)
- **ZMODEM** — receive files from sz
- **Outbound proxy** — SOCKS5 / HTTP CONNECT
- **System monitor** — CPU, memory, swap, network, disk (local + remote)
- **Quick commands** — grouped, searchable, send to multiple sessions
- **Host key verification** — TOFU with change detection
- **Encrypted credentials** — ChaCha20-Poly1305
- **SSH config import** — ~/.ssh/config
- **I18n** — English / Chinese runtime switch

## Tech Stack

| Layer     | Technology                                    |
| --------- | --------------------------------------------- |
| Frontend  | React 18 + TypeScript + Tailwind CSS + Zustand |
| Terminal  | xterm.js 5.x                                  |
| Shell     | Tauri 2                                       |
| Backend   | Rust (russh, tokio)                           |

## Development

`sh
npm install
npm run tauri dev
`

## Build

CI builds run on every push. Download from [Actions](https://github.com/zfloong/meatshell-app/actions) → latest run → Artifacts.

## License

MIT — see [LICENSE](LICENSE).  
The meatshell/ Rust crate is also MIT-licensed, originally by [jeff141/meatshell](https://github.com/jeff141/meatshell).
