import os
import tempfile
import logging

# ---------------------------------------------------------------------------
# Model cache — use Render's persistent disk when available, else ~/.cache
# ---------------------------------------------------------------------------
_CACHE_DIR = os.environ.get(
    "MODEL_CACHE_DIR",
    os.path.join(os.path.expanduser("~"), ".cache", "speech-grammar-agent"),
)
os.makedirs(_CACHE_DIR, exist_ok=True)

# Tell LanguageTool where to store its downloaded files
os.environ.setdefault("LANGUAGE_TOOL_HOME", os.path.join(_CACHE_DIR, "languagetool"))
from flask import Flask, request, jsonify, render_template

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Lazy-loaded singletons so startup feedback is immediate
# ---------------------------------------------------------------------------
_whisper_model = None
_grammar_tool = None


def get_whisper_model():
    """Load faster-whisper model on first use (small model, CPU)."""
    global _whisper_model
    if _whisper_model is None:
        logger.info("Loading Whisper model (small) — first run downloads ~500 MB …")
        from faster_whisper import WhisperModel
        whisper_cache = os.path.join(_CACHE_DIR, "whisper")
        os.makedirs(whisper_cache, exist_ok=True)
        _whisper_model = WhisperModel(
            "small",
            device="cpu",
            compute_type="int8",
            download_root=whisper_cache,
        )
        logger.info("Whisper model loaded ✓")
    return _whisper_model


# Capitalization rules to skip — speech transcription may not capitalise properly
SKIP_RULES = {
    "UPPERCASE_SENTENCE_START",
    "CAPITALIZATION",
    "CAPS_LOCK",
}


def get_grammar_tool():
    """Initialise LanguageTool for offline grammar checking."""
    global _grammar_tool
    if _grammar_tool is None:
        logger.info("Starting LanguageTool (local server) — first run downloads ~200 MB …")
        import language_tool_python
        _grammar_tool = language_tool_python.LanguageTool("en-US")
        logger.info("LanguageTool ready ✓")
    return _grammar_tool


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/transcribe", methods=["POST"])
def transcribe():
    """Accept an audio file and return Whisper transcription."""
    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files["audio"]
    # Use the correct extension so ffmpeg can detect the container format
    ext = ".webm"
    if audio_file.filename:
        ext = os.path.splitext(audio_file.filename)[1] or ext
    tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
    try:
        audio_file.save(tmp.name)
        tmp.close()

        model = get_whisper_model()
        segments, info = model.transcribe(
            tmp.name,
            beam_size=5,
            language="en",           # skip auto-detection for faster + more accurate results
            vad_filter=True,         # filter out silence / noise
            vad_parameters=dict(
                min_silence_duration_ms=500,
            ),
        )
        text = " ".join(seg.text.strip() for seg in segments)

        # Always capitalise the first letter of the transcription
        if text:
            text = text[0].upper() + text[1:]

        return jsonify({"text": text, "language": info.language})
    except Exception as e:
        logger.exception("Transcription failed")
        return jsonify({"error": str(e)}), 500
    finally:
        os.unlink(tmp.name)


@app.route("/check-grammar", methods=["POST"])
def check_grammar():
    """Run LanguageTool on the supplied text and return matches."""
    data = request.get_json(force=True)
    text = data.get("text", "")
    if not text.strip():
        return jsonify({"matches": [], "corrected": ""})

    try:
        tool = get_grammar_tool()
        # Capitalise first letter before checking grammar
        if text:
            text = text[0].upper() + text[1:]
        all_matches = tool.check(text)
        # Filter out capitalization rules — not relevant for speech
        matches = [m for m in all_matches if m.rule_id not in SKIP_RULES
                   and (m.category or "").upper() != "CAPITALIZATION"]
        corrected = language_tool_python_correct(text, matches)

        issues = []
        for m in matches:
            issues.append({
                "message": m.message,
                "offset": m.offset,
                "length": m.error_length,
                "replacements": m.replacements[:5],
                "ruleId": m.rule_id,
                "category": m.category,
                "type": classify_issue(m),
            })

        return jsonify({"matches": issues, "corrected": corrected})
    except Exception as e:
        logger.exception("Grammar check failed")
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def language_tool_python_correct(text, matches):
    """Apply LanguageTool corrections to produce a corrected string."""
    import language_tool_python
    return language_tool_python.utils.correct(text, matches)


def classify_issue(match):
    """Classify a grammar issue as error / warning / suggestion."""
    cat = (match.category or "").lower()
    rule = (match.rule_id or "").lower()
    if any(k in cat for k in ("grammar", "typo", "confused_word")):
        return "error"
    if any(k in cat for k in ("punctuation", "capitalization", "compounding")):
        return "warning"
    return "suggestion"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("\n🎙️  Speech Grammar Agent")
    print("   Open http://localhost:8080 in your browser\n")
    app.run(host="0.0.0.0", port=8080, debug=False)
