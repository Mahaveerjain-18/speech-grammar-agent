# 🎙️ Speech Grammar Agent

A **local, offline-first** web application that lets you speak or type text and instantly receive grammar corrections and suggestions — no cloud APIs required.

Built with:
- [Flask](https://flask.palletsprojects.com/) — lightweight Python web server
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — fast, local speech-to-text using OpenAI's Whisper model
- [LanguageTool](https://languagetool.org/) — offline grammar and style checker

---

## ✨ Features

- 🎤 **Speech-to-Text** — Record audio directly in the browser; transcription runs locally via Whisper (`small` model, CPU-friendly)
- ✍️ **Text Input** — Type or paste text directly to check grammar without speaking
- 🔍 **Grammar Checking** — Powered by LanguageTool with offline support; identifies errors, warnings, and style suggestions
- ✅ **Auto-Correction** — Generates a corrected version of your text automatically
- 🔕 **No External API Calls** — Everything runs on your machine

---

## 🚀 Getting Started

### Prerequisites

- Python 3.9+
- [ffmpeg](https://ffmpeg.org/download.html) (required by `faster-whisper` for audio decoding)

Install ffmpeg via Homebrew on macOS:
```bash
brew install ffmpeg
```

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/speech-grammar-agent.git
   cd speech-grammar-agent
   ```

2. **Create and activate a virtual environment**
   ```bash
   python3 -m venv venv
   source venv/bin/activate   # macOS/Linux
   # venv\Scripts\activate    # Windows
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

### Running the App

```bash
python app.py
```

Then open your browser and navigate to:

```
http://localhost:8080
```

> **Note:** On first run, the app will automatically download the Whisper model (~500 MB) and LanguageTool binaries (~200 MB). Subsequent starts are instant.

---

## 📁 Project Structure

```
speech-grammar-agent/
├── app.py              # Flask application — routes and core logic
├── requirements.txt    # Python dependencies
├── templates/
│   └── index.html      # Frontend UI
└── static/             # Static assets (CSS, JS, etc.)
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/` | Serves the main UI |
| `POST` | `/transcribe` | Accepts an audio file, returns transcribed text |
| `POST` | `/check-grammar` | Accepts JSON `{ "text": "..." }`, returns grammar matches and corrected text |

### `/transcribe` — Request
- **Content-Type:** `multipart/form-data`
- **Body:** `audio` field containing the audio file (`.webm`, `.wav`, etc.)

### `/transcribe` — Response
```json
{
  "text": "Your transcribed text here.",
  "language": "en"
}
```

### `/check-grammar` — Request
```json
{ "text": "This are a example sentence." }
```

### `/check-grammar` — Response
```json
{
  "corrected": "This is an example sentence.",
  "matches": [
    {
      "message": "Use 'is' instead of 'are'.",
      "offset": 5,
      "length": 3,
      "replacements": ["is"],
      "ruleId": "SUBJECT_VERB_AGREEMENT",
      "category": "GRAMMAR",
      "type": "error"
    }
  ]
}
```

---

## ⚙️ Configuration

The Whisper model and LanguageTool are loaded lazily on first use. To change the Whisper model size, edit `app.py`:

```python
_whisper_model = WhisperModel("small", device="cpu", compute_type="int8")
```

Available model sizes: `tiny`, `base`, `small`, `medium`, `large`. Larger models are more accurate but require more RAM and time.

---

## 📦 Dependencies

| Package | Purpose |
|---------|---------|
| `flask` | Web framework |
| `faster-whisper` | Offline speech transcription |
| `language-tool-python` | Offline grammar checking |
| `pydub` | Audio processing utilities |

---

## 📄 License

This project is open-source. Feel free to use, modify, and distribute it.
