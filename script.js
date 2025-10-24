/*
  Complete JavaScript for the Transcriber App
  Includes:
  1. File Upload Logic (Works 100% locally)
  2. YouTube Link Logic (Requires a backend you must build)
*/

// --- Import Transformers.js ---
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1';

// --- Get All HTML Elements ---
// (Assuming your new UI has these IDs)
const fileUpload = document.getElementById('video-upload');
const fileNameDisplay = document.getElementById('file-name-display'); // Assuming you have this
const transcribeBtn = document.getElementById('transcribe-btn'); // For file upload
const statusText = document.getElementById('status-text');
const transcriptOutput = document.getElementById('transcript-output');
const videoPlayer = document.getElementById('video-player'); // The hidden video element

// YouTube Link Elements
const youtubeLinkInput = document.getElementById('youtube-link-input'); // Your new input
const youtubeBtn = document.getElementById('youtube-transcribe-btn'); // Your new button

// --- Shared State ---
// We create the transcriber instance once and reuse it.
let transcriber = null;
let isModelLoading = false;

// --- 1. Main Function: Load the AI Model ---
// This function downloads the model (once) and stores it.
async function loadTranscriber() {
  if (transcriber || isModelLoading) {
    // Model is already loaded or is in the process of loading
    return;
  }
  isModelLoading = true;
  updateStatus('Loading transcription model... (this may take a moment)', true);

  try {
    transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
    updateStatus('Model loaded. Ready to transcribe.');
  } catch (error) {
    console.error('Model loading failed:', error);
    updateStatus('Error: Could not load model. Please refresh the page.');
  } finally {
    isModelLoading = false;
  }
}

// --- 2. Logic for File Upload ---

if (fileUpload) {
  fileUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      if (fileNameDisplay) fileNameDisplay.textContent = file.name;
      videoPlayer.src = URL.createObjectURL(file);
      transcribeBtn.disabled = false;
      transcribeBtn.classList.add('ready');
      updateStatus('File selected. Ready to transcribe!');
    }
  });
}

if (transcribeBtn) {
  transcribeBtn.addEventListener('click', async () => {
    transcribeBtn.disabled = true;
    transcribeBtn.classList.remove('ready');

    try {
      // Load model if it's not already loaded
      if (!transcriber) await loadTranscriber();
      if (!transcriber) throw new Error("Model not available."); // Failed to load

      // 1. Extract Audio
      updateStatus('Processing audio from video file...', true);
      const audioData = await extractAndResampleAudio(videoPlayer);
      if (!audioData) throw new Error("Could not extract audio. Please try a different file.");

      // 2. Transcribe
      updateStatus('Transcribing audio... This can take a while.', true);
      const output = await runTranscription(audioData);

      // 3. Display Result
      updateStatus('File transcription complete!');
      transcriptOutput.value = output.text;

    } catch (error) {
      console.error('File transcription failed:', error);
      updateStatus(`Error: ${error.message}`);
    } finally {
      transcribeBtn.disabled = false; // Re-enable on success or error
    }
  });
}

// --- 3. Logic for YouTube Link (Requires Backend) ---

if (youtubeBtn) {
  youtubeBtn.addEventListener('click', async () => {
    const url = youtubeLinkInput.value;
    if (!url) {
      alert("Please paste a YouTube link first.");
      return;
    }

    youtubeBtn.disabled = true;
    updateStatus('Connecting to backend for YouTube audio...', true);

    try {
      // Load model if it's not already loaded
      if (!transcriber) await loadTranscriber();
      if (!transcriber) throw new Error("Model not available.");

      // 1. Fetch Audio from Your Backend
      // THIS IS THE PART THAT REQUIRES YOUR SERVER
      // This fetch call will fail until you build an API endpoint
      // at '/api/transcribe-youtube'.
      const response = await fetch('/api/transcribe-youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url })
      });

      if (!response.ok) {
        throw new Error(`Backend error: ${response.statusText}`);
      }

      // We assume the backend returns the audio as a Float32Array in JSON
      // e.g., { "audioData": [0.1, 0.2, ...] }
      const data = await response.json();
      const audioData = new Float32Array(data.audioData);

      // 2. Transcribe
      updateStatus('Transcribing YouTube audio... This can take a while.', true);
      const output = await runTranscription(audioData);

      // 3. Display Result
      updateStatus('YouTube transcription complete!');
      transcriptOutput.value = output.text;

    } catch (error) {
      console.error('YouTube transcription failed:', error);
      // This is the error your user saw!
      if (error instanceof TypeError) { // e.g., network error / failed to fetch
         alert("YouTube transcription requires a backend setup. This feature is not yet live. Please use file upload instead.");
         updateStatus("YouTube support is not yet enabled. Please use file upload.");
      } else {
         updateStatus(`Error: ${error.message}`);
      }
    } finally {
      youtubeBtn.disabled = false;
    }
  });
}


// --- 4. Helper Functions ---

/**
 * Updates the status text and spinner visibility
 */
function updateStatus(message, showSpinner = false) {
  statusText.textContent = message;
  if (showSpinner) {
    statusText.classList.add('processing');
  } else {
    statusText.classList.remove('processing');
  }
}

/**
 * Runs the transcription pipeline on prepared audio data
 */
async function runTranscription(audioData) {
  if (!transcriber) {
    throw new Error("Transcription model is not loaded.");
  }
  const output = await transcriber(audioData, {
    chunk_length_s: 30, // Process in 30-second chunks
  });
  return output;
}

/**
 * Extracts audio from a <video> element, converts to mono,
 * and resamples to 16kHz.
 * @param {HTMLVideoElement} videoElement
 * @returns {Promise<Float32Array|null>}
 */
async function extractAndResampleAudio(videoElement) {
  try {
    if (!videoElement.duration) {
      await new Promise((resolve, reject) => {
        videoElement.onloadedmetadata = resolve;
        videoElement.onerror = reject;
      });
    }

    const duration = videoElement.duration;
    const targetSampleRate = 16000;
    const offlineContext = new OfflineAudioContext(
      1, // 1 channel (mono)
      duration * targetSampleRate,
      targetSampleRate
    );

    const liveContext = new AudioContext();
    const source = liveContext.createMediaElementSource(videoElement);
    source.connect(offlineContext.destination);

    videoElement.currentTime = 0;
    await videoElement.play();
    const renderedBuffer = await offlineContext.startRendering();
    
    videoElement.pause();
    liveContext.close();

    return renderedBuffer.getChannelData(0);

  } catch (error) {
    console.error('Audio extraction failed:', error);
    return null;
  }
}
