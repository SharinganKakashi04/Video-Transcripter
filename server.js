const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 500 * 1024 * 1024 // 500MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /mp4|mov|avi|webm|mkv|flv|wmv/;
        const ext = path.extname(file.originalname).toLowerCase().slice(1);
        if (allowedTypes.test(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only video files are allowed.'));
        }
    }
});

// Serve static files (frontend)
app.use(express.static('public'));

// Extract audio from video using ffmpeg
async function extractAudio(videoPath, audioPath) {
    try {
        const command = `ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}"`;
        await execPromise(command);
        console.log('Audio extracted successfully');
    } catch (error) {
        console.error('FFmpeg error:', error.stderr);
        throw new Error('Failed to extract audio from video');
    }
}

// Transcribe using local Whisper (OpenAI's open-source model)
async function transcribeWithWhisper(audioPath) {
    try {
        // Use Whisper CLI (installed via pip)
        // This runs the model locally - 100% FREE!
        const command = `whisper "${audioPath}" --model base --language en --output_format txt --output_dir /tmp`;
        
        console.log('Running Whisper transcription...');
        const { stdout, stderr } = await execPromise(command, {
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        });
        
        // Read the generated transcript file
        const baseName = path.basename(audioPath, path.extname(audioPath));
        const transcriptPath = `/tmp/${baseName}.txt`;
        
        if (fs.existsSync(transcriptPath)) {
            const transcript = fs.readFileSync(transcriptPath, 'utf8');
            fs.unlinkSync(transcriptPath); // Clean up
            return transcript.trim();
        } else {
            throw new Error('Transcript file not generated');
        }
    } catch (error) {
        console.error('Whisper error:', error);
        throw new Error('Transcription failed: ' + error.message);
    }
}

// Alternative: Use faster-whisper (optimized version)
async function transcribeWithFasterWhisper(audioPath) {
    try {
        // Create a Python script inline to use faster-whisper
        const pythonScript = `
import sys
from faster_whisper import WhisperModel

model = WhisperModel("base", device="cpu", compute_type="int8")
segments, info = model.transcribe("${audioPath}", language="en", beam_size=5)

transcript = " ".join([segment.text for segment in segments])
print(transcript)
`;
        
        const scriptPath = '/tmp/transcribe.py';
        fs.writeFileSync(scriptPath, pythonScript);
        
        console.log('Running Faster-Whisper transcription...');
        const { stdout } = await execPromise(`python3 ${scriptPath}`, {
            maxBuffer: 10 * 1024 * 1024
        });
        
        fs.unlinkSync(scriptPath);
        return stdout.trim();
    } catch (error) {
        console.error('Faster-Whisper error:', error);
        throw new Error('Transcription failed: ' + error.message);
    }
}

// Main transcription endpoint
app.post('/api/transcribe', upload.single('video'), async (req, res) => {
    let videoPath, audioPath;

    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No video file uploaded' });
        }

        videoPath = req.file.path;
        audioPath = videoPath + '.wav';

        console.log('Processing video:', req.file.originalname);

        // Extract audio from video
        console.log('Extracting audio...');
        await extractAudio(videoPath, audioPath);

        // Transcribe audio using local Whisper
        console.log('Transcribing...');
        let transcript;
        
        try {
            // Try faster-whisper first (more optimized)
            transcript = await transcribeWithFasterWhisper(audioPath);
        } catch (error) {
            console.log('Faster-whisper not available, falling back to standard whisper');
            // Fall back to standard whisper
            transcript = await transcribeWithWhisper(audioPath);
        }

        console.log('Transcription complete');

        // Send response
        res.json({ transcript });

    } catch (error) {
        console.error('Transcription error:', error);
        res.status(500).json({ 
            error: error.message || 'Transcription failed' 
        });
    } finally {
        // Clean up files
        if (videoPath && fs.existsSync(videoPath)) {
            fs.unlinkSync(videoPath);
        }
        if (audioPath && fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok',
        mode: 'local-whisper'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📱 Frontend: http://localhost:${PORT}`);
    console.log(`🎙️  API: http://localhost:${PORT}/api/transcribe`);
    console.log(`💰 Mode: FREE - Local Whisper (no API costs)`);
});