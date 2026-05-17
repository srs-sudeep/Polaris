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
        if (m.status === 'recognizing text') {
          // Keep OCR quiet in production; progress can be surfaced by callers.
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
  const result = await recognizeImage(imageBuffer);
  return result.text;
}

async function recognizeImage(imageBuffer) {
  try {
    const ocrWorker = await initializeOCR();
    const { data } = await ocrWorker.recognize(imageBuffer);
    return {
      text: normalizeOCRText(data?.text),
      blocks: normalizeOCRBlocks(data)
    };
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

function normalizeOCRText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeOCRBlocks(data) {
  const candidates = data?.paragraphs?.length
    ? data.paragraphs
    : data?.lines?.length
      ? data.lines
      : data?.blocks || [];

  return candidates
    .map((item) => {
      const text = normalizeOCRText(item?.text);
      if (!text) {
        return null;
      }

      return {
        text,
        confidence: Math.round(item?.confidence ?? item?.conf ?? 0),
        bbox: normalizeBoundingBox(item?.bbox)
      };
    })
    .filter(Boolean);
}

function normalizeBoundingBox(bbox) {
  if (!bbox) {
    return null;
  }

  const x0 = Number(bbox.x0 ?? bbox.left ?? bbox.x ?? 0);
  const y0 = Number(bbox.y0 ?? bbox.top ?? bbox.y ?? 0);
  const x1 = Number(bbox.x1 ?? x0 + Number(bbox.width ?? 0));
  const y1 = Number(bbox.y1 ?? y0 + Number(bbox.height ?? 0));

  return {
    x: x0,
    y: y0,
    width: Math.max(0, x1 - x0),
    height: Math.max(0, y1 - y0)
  };
}

async function terminateOCR() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}

module.exports = {
  captureScreen,
  extractTextFromImage,
  extractTextFromRegion,
  initializeOCR,
  recognizeImage,
  terminateOCR
};
