/* ================================================================== */
/* Speech Grammar Agent — Frontend Logic                              */
/* ================================================================== */

(function () {
    "use strict";

    // DOM refs
    const recordBtn = document.getElementById("record-btn");
    const statusBadge = document.getElementById("status-badge");
    const timerEl = document.getElementById("timer");
    const recorderHint = document.getElementById("recorder-hint");
    const recorderSection = document.getElementById("recorder-section");
    const ringCanvas = document.getElementById("waveform-ring");
    const barsCanvas = document.getElementById("waveform-bars");
    const transcriptSection = document.getElementById("transcription-section");
    const transcriptText = document.getElementById("transcript-text");
    const grammarSection = document.getElementById("grammar-section");
    const highlightedText = document.getElementById("highlighted-text");
    const correctedBlock = document.getElementById("corrected-block");
    const correctedText = document.getElementById("corrected-text");
    const issueCounts = document.getElementById("issue-counts");
    const issuesList = document.getElementById("issues-list");
    const loadingOverlay = document.getElementById("loading-overlay");
    const loadingText = document.getElementById("loading-text");
    const copyTranscriptBtn = document.getElementById("copy-transcript-btn");
    const copyCorrectedBtn = document.getElementById("copy-corrected-btn");

    // Text input refs
    const textInput = document.getElementById("text-input");
    const charCount = document.getElementById("char-count");
    const checkGrammarBtn = document.getElementById("check-grammar-btn");
    const clearTextBtn = document.getElementById("clear-text-btn");

    // State
    let mediaRecorder = null;
    let audioChunks = [];
    let audioStream = null;
    let analyser = null;
    let animFrameId = null;
    let timerInterval = null;
    let secondsElapsed = 0;
    let isRecording = false;

    // Retina-ready canvases
    function setupHiDPI(canvas, w, h) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        const ctx = canvas.getContext("2d");
        ctx.scale(dpr, dpr);
        return ctx;
    }

    // ----------------------------------------------------------------
    // IDLE animation — gentle ambient ring when not recording
    // ----------------------------------------------------------------
    let idleFrame = null;
    const RING_SIZE = 220; // logical px
    const BAR_W = 680;
    const BAR_H = 56;

    function startIdleAnimation() {
        const ctx = setupHiDPI(ringCanvas, RING_SIZE, RING_SIZE);
        const bCtx = setupHiDPI(barsCanvas, BAR_W, BAR_H);
        let t = 0;

        function draw() {
            idleFrame = requestAnimationFrame(draw);
            t += 0.012;

            // --- Circular ring ---
            const cx = RING_SIZE / 2;
            const cy = RING_SIZE / 2;
            const r = 92;
            const barCount = 64;
            ctx.clearRect(0, 0, RING_SIZE, RING_SIZE);

            for (let i = 0; i < barCount; i++) {
                const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
                // Gentle sine wave with phase offset per bar
                const h = 4 + 3 * Math.sin(t * 2 + i * 0.3);
                const x1 = cx + Math.cos(angle) * r;
                const y1 = cy + Math.sin(angle) * r;
                const x2 = cx + Math.cos(angle) * (r + h);
                const y2 = cy + Math.sin(angle) * (r + h);

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.lineWidth = 2;
                ctx.strokeStyle = `hsla(255, 70%, 68%, ${0.2 + 0.1 * Math.sin(t + i * 0.2)})`;
                ctx.lineCap = "round";
                ctx.stroke();
            }

            // --- Linear bars ---
            const numBars = 80;
            const gap = 2;
            const bw = (BAR_W - (numBars - 1) * gap) / numBars;
            bCtx.clearRect(0, 0, BAR_W, BAR_H);

            for (let i = 0; i < numBars; i++) {
                const h = 3 + 2 * Math.sin(t * 1.5 + i * 0.15);
                const x = i * (bw + gap);
                const y = (BAR_H - h) / 2;
                bCtx.fillStyle = `hsla(255, 60%, 60%, 0.15)`;
                bCtx.beginPath();
                bCtx.roundRect(x, y, bw, h, 1);
                bCtx.fill();
            }
        }
        draw();
    }

    function stopIdleAnimation() {
        if (idleFrame) {
            cancelAnimationFrame(idleFrame);
            idleFrame = null;
        }
    }

    // Start idle animation on load
    startIdleAnimation();

    // ----------------------------------------------------------------
    // Record button
    // ----------------------------------------------------------------
    recordBtn.addEventListener("click", async () => {
        if (isRecording) {
            stopRecording();
        } else {
            await startRecording();
        }
    });

    async function startRecording() {
        try {
            audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            alert("Microphone access is required. Please allow it and try again.");
            return;
        }

        stopIdleAnimation();

        // Setup analyser for waveform
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(audioStream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);

        // Setup MediaRecorder
        mediaRecorder = new MediaRecorder(audioStream, { mimeType: getBestMime() });
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
            processAudio(blob);
            cleanupStream();
        };

        mediaRecorder.start();
        isRecording = true;
        recordBtn.classList.add("recording");
        recorderSection.classList.add("recording");
        timerEl.classList.add("recording-active");
        recorderHint.textContent = "Tap to stop";
        setBadge("recording", "Recording");
        startTimer();
        drawLiveVisualizers();
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
        }
        isRecording = false;
        recordBtn.classList.remove("recording");
        recorderSection.classList.remove("recording");
        timerEl.classList.remove("recording-active");
        recorderHint.textContent = "Tap to start recording";
        stopTimer();
        cancelAnimationFrame(animFrameId);
        startIdleAnimation();
    }

    function cleanupStream() {
        if (audioStream) {
            audioStream.getTracks().forEach((t) => t.stop());
            audioStream = null;
        }
    }

    function getBestMime() {
        const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg", "audio/mp4"];
        for (const t of types) {
            if (MediaRecorder.isTypeSupported(t)) return t;
        }
        return "";
    }

    // ----------------------------------------------------------------
    // Timer
    // ----------------------------------------------------------------
    function startTimer() {
        secondsElapsed = 0;
        timerEl.textContent = "00:00";
        timerInterval = setInterval(() => {
            secondsElapsed++;
            const m = String(Math.floor(secondsElapsed / 60)).padStart(2, "0");
            const s = String(secondsElapsed % 60).padStart(2, "0");
            timerEl.textContent = `${m}:${s}`;
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
    }

    // ----------------------------------------------------------------
    // Live visualizers (recording state)
    // ----------------------------------------------------------------
    function drawLiveVisualizers() {
        const ringCtx = setupHiDPI(ringCanvas, RING_SIZE, RING_SIZE);
        const barsCtx = setupHiDPI(barsCanvas, BAR_W, BAR_H);
        const freqLen = analyser.frequencyBinCount;
        const freqData = new Uint8Array(freqLen);
        const timeData = new Uint8Array(freqLen);

        // Smoothed heights for the linear bars
        const smoothBars = new Float32Array(80).fill(0);

        function draw() {
            animFrameId = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(freqData);
            analyser.getByteTimeDomainData(timeData);

            // ---- 1. Circular frequency ring ----
            const cx = RING_SIZE / 2;
            const cy = RING_SIZE / 2;
            const r = 88;
            const barCount = 64;
            ringCtx.clearRect(0, 0, RING_SIZE, RING_SIZE);

            for (let i = 0; i < barCount; i++) {
                const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
                // Map bar index to a frequency bin
                const fi = Math.floor((i / barCount) * freqLen * 0.7);
                const val = freqData[fi] / 255;
                const h = 4 + val * 22;

                const x1 = cx + Math.cos(angle) * r;
                const y1 = cy + Math.sin(angle) * r;
                const x2 = cx + Math.cos(angle) * (r + h);
                const y2 = cy + Math.sin(angle) * (r + h);

                // Gradient from accent to red based on intensity
                const hue = 255 - val * 200; // purple → red
                const lightness = 55 + val * 15;
                ringCtx.beginPath();
                ringCtx.moveTo(x1, y1);
                ringCtx.lineTo(x2, y2);
                ringCtx.lineWidth = 2.5;
                ringCtx.strokeStyle = `hsla(${hue}, 80%, ${lightness}%, ${0.4 + val * 0.6})`;
                ringCtx.lineCap = "round";
                ringCtx.stroke();
            }

            // ---- 2. Linear frequency bars ----
            const numBars = 80;
            const gap = 2;
            const bw = (BAR_W - (numBars - 1) * gap) / numBars;
            barsCtx.clearRect(0, 0, BAR_W, BAR_H);

            for (let i = 0; i < numBars; i++) {
                // Map bar to frequency bin
                const fi = Math.floor((i / numBars) * freqLen * 0.8);
                const raw = freqData[fi] / 255;
                // Smooth
                smoothBars[i] += (raw - smoothBars[i]) * 0.3;
                const val = smoothBars[i];

                const h = 3 + val * (BAR_H - 6);
                const x = i * (bw + gap);
                const y = (BAR_H - h) / 2;

                // Create gradient per bar: purple bottom → pink top at high intensity
                const hue = 255 - val * 180;
                const alpha = 0.25 + val * 0.75;
                barsCtx.fillStyle = `hsla(${hue}, 75%, 60%, ${alpha})`;
                barsCtx.beginPath();
                barsCtx.roundRect(x, y, bw, h, 2);
                barsCtx.fill();
            }
        }
        draw();
    }

    // ----------------------------------------------------------------
    // Process audio → transcribe → grammar check
    // ----------------------------------------------------------------
    async function processAudio(blob) {
        showLoading("Transcribing your speech…");
        setBadge("processing", "Processing");

        try {
            // 1. Transcribe
            const formData = new FormData();
            formData.append("audio", blob, "recording.webm");

            const trRes = await fetch("/transcribe", { method: "POST", body: formData });
            const trData = await trRes.json();

            if (trData.error) throw new Error(trData.error);

            const text = trData.text;
            transcriptText.textContent = text;
            transcriptSection.classList.remove("hidden");

            // 2. Grammar check
            setLoadingText("Checking grammar…");
            const grRes = await fetch("/check-grammar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
            });
            const grData = await grRes.json();

            if (grData.error) throw new Error(grData.error);

            renderGrammarResults(text, grData);
            setBadge("done", "Done");
        } catch (err) {
            console.error(err);
            alert("Error: " + err.message);
            setBadge("idle", "Ready");
        } finally {
            hideLoading();
        }
    }

    // ----------------------------------------------------------------
    // Render grammar results
    // ----------------------------------------------------------------
    function renderGrammarResults(originalText, data) {
        const { matches, corrected } = data;

        grammarSection.classList.remove("hidden");

        // Count by type
        const counts = { error: 0, warning: 0, suggestion: 0 };
        matches.forEach((m) => counts[m.type]++);

        if (matches.length === 0) {
            issueCounts.innerHTML = "";
            highlightedText.innerHTML =
                '<div class="no-issues">' +
                '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' +
                "No grammar issues found! 🎉</div>";
            issuesList.innerHTML = "";
            correctedBlock.classList.add("hidden");
            return;
        }

        // Render count chips
        issueCounts.innerHTML = Object.entries(counts)
            .filter(([, v]) => v > 0)
            .map(
                ([type, count]) =>
                    `<span class="count-chip ${type}"><span class="count-dot"></span>${count}</span>`
            )
            .join("");

        // Build highlighted text
        let segments = [];
        let lastIdx = 0;
        const asc = [...matches].sort((a, b) => a.offset - b.offset);
        for (const m of asc) {
            if (m.offset > lastIdx) {
                segments.push({ text: originalText.slice(lastIdx, m.offset), type: null });
            }
            segments.push({
                text: originalText.slice(m.offset, m.offset + m.length),
                type: m.type,
                message: m.message,
            });
            lastIdx = m.offset + m.length;
        }
        if (lastIdx < originalText.length) {
            segments.push({ text: originalText.slice(lastIdx), type: null });
        }

        highlightedText.innerHTML = segments
            .map((s) => {
                if (!s.type) return escapeHtml(s.text);
                return `<span class="highlight-${s.type}" title="${escapeHtml(s.message)}">${escapeHtml(s.text)}</span>`;
            })
            .join("");

        // Corrected text
        if (corrected && corrected !== originalText) {
            correctedText.textContent = corrected;
            correctedBlock.classList.remove("hidden");
        } else {
            correctedBlock.classList.add("hidden");
        }

        // Issues list
        issuesList.innerHTML = matches
            .map((m) => {
                const reps = m.replacements.length
                    ? `<div class="issue-replacements">${m.replacements.map((r) => `<span class="replacement-chip">${escapeHtml(r)}</span>`).join("")}</div>`
                    : "";
                return `<div class="issue-card ${m.type}"><div class="issue-message">${escapeHtml(m.message)}</div>${reps}</div>`;
            })
            .join("");
    }

    // ----------------------------------------------------------------
    // Copy buttons
    // ----------------------------------------------------------------
    copyTranscriptBtn.addEventListener("click", () => {
        copyText(transcriptText.textContent);
    });

    copyCorrectedBtn.addEventListener("click", () => {
        copyText(correctedText.textContent);
    });

    function copyText(text) {
        navigator.clipboard.writeText(text).then(() => {
            const el = document.activeElement;
            el.style.color = "var(--success-color)";
            setTimeout(() => (el.style.color = ""), 800);
        });
    }

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------
    function setBadge(cls, label) {
        statusBadge.className = "badge " + cls;
        statusBadge.textContent = label;
    }

    function showLoading(msg) {
        loadingText.textContent = msg;
        loadingOverlay.classList.remove("hidden");
    }

    function setLoadingText(msg) {
        loadingText.textContent = msg;
    }

    function hideLoading() {
        loadingOverlay.classList.add("hidden");
    }

    function escapeHtml(str) {
        const d = document.createElement("div");
        d.textContent = str;
        return d.innerHTML;
    }

    // ----------------------------------------------------------------
    // Text input grammar check
    // ----------------------------------------------------------------
    textInput.addEventListener("input", () => {
        const len = textInput.value.length;
        charCount.textContent = len + " character" + (len !== 1 ? "s" : "");
        checkGrammarBtn.disabled = len === 0;
        if (len > 0) {
            clearTextBtn.classList.remove("hidden");
        } else {
            clearTextBtn.classList.add("hidden");
        }
    });

    checkGrammarBtn.addEventListener("click", async () => {
        const text = textInput.value.trim();
        if (!text) return;

        showLoading("Checking grammar…");
        setBadge("processing", "Processing");

        try {
            const res = await fetch("/check-grammar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
            });
            const data = await res.json();

            if (data.error) throw new Error(data.error);

            // Hide the transcription section (this came from text input, not speech)
            transcriptSection.classList.add("hidden");

            renderGrammarResults(text, data);
            setBadge("done", "Done");
        } catch (err) {
            console.error(err);
            alert("Error: " + err.message);
            setBadge("idle", "Ready");
        } finally {
            hideLoading();
        }
    });

    clearTextBtn.addEventListener("click", () => {
        textInput.value = "";
        charCount.textContent = "0 characters";
        checkGrammarBtn.disabled = true;
        clearTextBtn.classList.add("hidden");
        grammarSection.classList.add("hidden");
        textInput.focus();
    });
})();
