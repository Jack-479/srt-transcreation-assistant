# SRT Transcreation Assistant

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![Framework](https://img.shields.io/badge/framework-Tauri_v2_|_React-orange.svg)

SRT Transcreation Assistant is a powerful desktop application built to translate and adapt `.srt` subtitle files using advanced AI models (Google Gemini). It goes beyond literal translation by offering "Transcreation"—ensuring the translated subtitles preserve cultural nuances, emotional tone, and contextual meaning.

## ✨ Features

- **Advanced Transcreation Profiles**: Choose between Natural, Cultural, Explicit, or Custom profiles to dictate how the AI handles slang, idioms, and cultural references.
- **Context-Aware Translation**: Automatically generates contextual background for the AI before translation begins, ensuring consistent character voices and thematic accuracy.
- **Parallel Chunk Processing**: Splits large subtitle files into chunks and translates them in parallel using the Gemini API, maintaining rate limits while maximizing speed.
- **Automated AI Quality Control (QC)**: Runs a final review pass after translation to detect and fix dropped lines, mismatched indices, and context errors.
- **Micro-Retries**: Features an intelligent micro-retry system that only re-prompts the AI for specific missing or problematic lines, rather than re-translating entire chunks.
- **Native Desktop Experience**: Built with Tauri v2 (Rust) and React, offering a blazing fast, lightweight Windows `.exe` application with custom frameless window controls.

## 🚀 Getting Started

### Prerequisites
To build or run this project locally, you will need:
- [Node.js](https://nodejs.org/) (v18 or newer)
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- A [Google Gemini API Key](https://aistudio.google.com/)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/srt-transcreation-assistant.git
   cd srt-transcreation-assistant
   ```

2. **Install frontend dependencies:**
   ```bash
   npm install
   ```

3. **Run the app in development mode:**
   ```bash
   npm run tauri dev
   ```

## 🛠️ Building the Installer for Windows

To build a standalone Windows installer (`.exe` and `.msi`), run the following command:

```bash
npm run tauri build
```

This process will take a few minutes as it compiles the Rust backend with heavy release optimizations (Link-Time Optimization and Size Stripping). Once finished, your installers will be available in the `src-tauri/target/release/bundle/` directory.

## ⚙️ Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide React
- **Backend**: Rust, Tauri v2 API
- **AI Integration**: Google Gemini API (Pro/Flash models)
- **Packaging**: Windows NSIS & WiX

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/yourusername/srt-transcreation-assistant/issues).

## 📝 License

This project is licensed under the MIT License.
