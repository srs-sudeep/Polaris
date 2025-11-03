const { createWorker } = require('tesseract.js');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

let worker = null;

async function initializeOCR() {
  if (!worker) {
    worker = await createWorker('jpn', 1, {
      logger: m => {
        // Optional: Remove console.log for production
        if (m.status === 'recognizing text') {
          // Only log progress occasionally
        }
      }
    });
  }
  return worker;
}

async function captureScreen() {
  // Cross-platform screenshot using native tools
  // For macOS and Linux, use native commands
  // For Windows, desktopCapturer is handled in main.js
  const platform = process.platform;
  const tempPath = path.join(os.tmpdir(), `screenshot_${Date.now()}.png`);
  
  return new Promise((resolve, reject) => {
    if (platform === 'win32') {
      // Windows: desktopCapturer is handled in main.js via IPC
      reject(new Error('Use IPC capture-screen handler from main process'));
      return;
    }
    
    let command;
    if (platform === 'darwin') {
      // macOS: Use screencapture
      command = `screencapture -x "${tempPath}"`;
    } else {
      // Linux: Use import (ImageMagick) or scrot
      command = `import -window root "${tempPath}" 2>/dev/null || scrot "${tempPath}"`;
    }
    
    if (command) {
      exec(command, async (error) => {
        if (error) {
          reject(new Error(`Screen capture command failed: ${error.message}`));
          return;
        }
        
        try {
          const imageBuffer = await fs.readFile(tempPath);
          await fs.unlink(tempPath).catch(() => {}); // Clean up
          resolve(imageBuffer);
        } catch (err) {
          reject(err);
        }
      });
    } else {
      reject(new Error('Unsupported platform for native screen capture'));
    }
  });
}

async function extractTextFromImage(imageBuffer) {
  try {
    const ocrWorker = await initializeOCR();
    const { data: { text } } = await ocrWorker.recognize(imageBuffer);
    return text.trim();
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error(`Failed to extract text: ${error.message}`);
  }
}

// Note: Region capture requires screen selection tool
// For now, this function is a placeholder
// You can implement region selection using a transparent overlay window
async function extractTextFromRegion(x, y, width, height) {
  // This would require implementing a screen selection tool
  // For now, use the full screen capture
  const imageBuffer = await captureScreen();
  return await extractTextFromImage(imageBuffer);
}

module.exports = {
  captureScreen,
  extractTextFromImage,
  extractTextFromRegion,
  initializeOCR
};
