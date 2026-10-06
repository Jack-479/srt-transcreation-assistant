# 🍏 SRT Transcreation Assistant - Compiled for Mac (Apple Silicon M1/M2/M3/M4)

### 🍏 macOS Compatibility Fork (Apple Silicon M1/M2/M3)
**Original Project by:** [jasial2](https://github.com)  
*This is a fork of jasial2's original translation assistant. The UI code and core logic belong to the original author. This fork has been adapted by [@Jack-479] to enable native compilation on macOS (Apple Silicon) systems using development containers and updated Tauri/WebKit dependencies.*
---


![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![Platform](https://img.shields.io/badge/platform-Mac-lightgreen.svg)
![Framework](https://img.shields.io/badge/framework-Tauri_v2_|_React-orange.svg)

**SRT Transcreation Assistant** is an advanced, AI-powered desktop application designed to translate `.srt` subtitle files. 

Unlike traditional machine translation, this tool focuses on **Transcreation**—adapting subtitles so they preserve cultural nuances, emotional tone, and contextual meaning, rather than relying on stiff, literal word-for-word translations.

---

## ✨ Detailed Features

### 1. Cultural Transcreation Profiles
To give you complete control over the tone and localized feel of the translation, the app provides four distinct profiles:
- **Natural:** Prioritizes fluency and modern conversational flow. Best for general media.
- **Cultural:** Preserves foreign honorifics (e.g., *san, sensei*), idioms, and cultural references, adapting them only when necessary for understanding. Best for Anime and foreign dramas.
- **Explicit:** Removes AI safety censorship guardrails, ensuring that mature, violent, or explicit content is translated exactly as written without being sanitized.
- **Custom:** Allows you to define your own rules, style guides, and terminology via custom system instructions.

### 2. Context-Aware Translation
AI struggles with consistency when translating isolated lines. This app solves that by **generating context first**. 
Before the full translation starts, it analyzes the beginning of the subtitle file to understand the characters, lore, and setting. This "Context Document" is then injected into every subsequent translation chunk, ensuring character voices and themes remain consistent from start to finish.

### 3. Parallel Chunk Processing
Large subtitle files (thousands of lines) are automatically split into manageable chunks (e.g., 300 lines per chunk) and processed in **parallel**. The application intelligently manages rate limits to translate the entire file as fast as possible without overloading the Gemini API.

### 4. Quality Control & Micro-Retries
AI is prone to occasionally skipping lines or hallucinating subtitle indices. 
- **Micro-Retries:** If the AI drops a line in a 300-line chunk, the app doesn't blindly re-translate the entire chunk. Instead, it issues a "targeted micro-retry" specifically for the missing line, saving massive amounts of API quota and time.
- **Automated AI Review:** Once complete, an optional final QC pass reads over the translated file to flag grammatical inconsistencies or untranslated segments for manual review.

### 5. Native Desktop UI
Built on **Tauri v2 (Rust)** and **React 19**, the app uses virtually zero background RAM compared to Electron apps. It features custom frameless window controls, beautiful dark mode themes, and lightning-fast local file I/O operations.

---

## 🔑 How to Get and Add a Gemini API Key

This application uses Google's Gemini AI (specifically models like `gemini-3.1-pro-high` and `gemini-3.6-flash-low`). To use the app, you need a free API key.

1. **Go to Google AI Studio:**
   Visit [aistudio.google.com](https://aistudio.google.com/) and sign in with your Google account.
2. **Generate the Key:**
   - In the left sidebar, click on **Get API key** (or **API keys**).
   - Click the blue **Create API key** button.
   - Select **Create API key in a new project**.
3. **Copy the Key:**
   A long string of text starting with `AIza...` will be generated. Copy this text.
4. **Add it to the App:**
   - Open the **SRT Transcreation Assistant**.
   - Navigate to the **Configure** or **Settings** tab.
   - Paste the API key into the "Gemini API Key" field. 
   - *Your key is saved locally and securely on your machine.*

---

## 🚀 Installation & Local Development

### Prerequisites
To build or run this project locally, you will need:
- [Node.js](https://nodejs.org/) (v18 or newer)
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- A Windows Operating System

### Clone & Run

1. **Clone the repository:**
   ```bash
   git clone https://github.com/jasial2/srt-transcreation-assistant.git
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

### Building the Final Installer

To compile the application into a Mac `.dmg` setup file:

```bash
npm run tauri build
```
Once finished, your installers will be available in the `src-tauri/target/release/bundle/nsis/` directory.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/jasial2/srt-transcreation-assistant/issues) if you want to contribute.

## 📝 License

This project is licensed under the MIT License.
