// Load tab content from separate files
async function loadTabContent(tabId, htmlFile) {
    try {
        const response = await fetch(htmlFile);
        const html = await response.text();
        const tabPane = document.getElementById(`${tabId}-tab`);
        if (tabPane) {
            tabPane.innerHTML = html;
        }
    } catch (error) {
        console.error(`Error loading ${tabId} tab:`, error);
    }
}

// Hide preloader after app loads
window.addEventListener('DOMContentLoaded', async () => {
    const preloader = document.getElementById('preloader');
    
    // Load tab content
    await loadTabContent('translation', 'src/tabs/translation.html');
    await loadTabContent('ocr', 'src/tabs/ocr.html');
    await loadTabContent('info', 'src/tabs/info.html');
    
    // Initialize OCR tab functionality
    initializeOCRTab();
    
    // Initialize status after tabs are loaded (wait a bit for DOM to update)
    setTimeout(() => {
        updateStatus('Monitoring clipboard for Japanese text...', true);
    }, 100);
    
    // Simulate loading time for smooth experience
    setTimeout(() => {
        preloader.classList.add('fade-out');
        // Show app container after preloader starts fading
        const appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.classList.add('loaded');
        }
        // Remove preloader from DOM after fade animation
        setTimeout(() => {
            preloader.style.display = 'none';
        }, 500);
    }, 1500); // Show preloader for 1.5 seconds
});

// Tab switching functionality
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class from all tabs and panes
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        
        // Add active class to clicked tab
        btn.classList.add('active');
        const tabName = btn.dataset.tab;
        document.getElementById(`${tabName}-tab`).classList.add('active');
    });
});

// Update status
function updateStatus(message, isActive = true) {
    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');
    
    if (statusText && statusDot) {
        statusText.textContent = message;
        if (isActive) {
            statusDot.classList.add('active');
        } else {
            statusDot.classList.remove('active');
        }
    }
}

// Function to calculate and resize window based on content
function resizeWindowToContent() {
    // Wait a bit for content to render
    setTimeout(() => {
        const appContainer = document.querySelector('.app-container');
        const contentHeight = appContainer ? appContainer.scrollHeight : 600;
        
        // Add some padding and account for window chrome
        const windowHeight = Math.min(contentHeight + 50, 900);
        
        window.electronAPI.resizeWindow(500, windowHeight);
    }, 100);
}

// Listen for translation updates from main process
window.electronAPI.onTranslationUpdate((data) => {
    const originalText = document.getElementById('originalText');
    const translationResult = document.getElementById('translationResult');
    
    // Switch to translation tab when translation comes in
    if (data.original || data.translation) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        
        const translationTabBtn = document.querySelector('.tab-btn[data-tab="translation"]');
        const translationTab = document.getElementById('translation-tab');
        if (translationTabBtn && translationTab) {
            translationTabBtn.classList.add('active');
            translationTab.classList.add('active');
        }
    }
    
    if (data.original) {
        originalText.textContent = data.original;
        originalText.style.color = '#333';
    }
    
    if (data.translation) {
        translationResult.textContent = data.translation;
        translationResult.style.color = '#FF6F00';
        updateStatus('Translation complete!', true);
        
        // Resize window to fit content
        resizeWindowToContent();
    }
    
    if (data.error) {
        translationResult.textContent = 'Error: ' + data.error;
        translationResult.style.color = '#e74c3c';
        updateStatus('Translation error', false);
    }
    
    if (data.translating) {
        translationResult.textContent = 'Translating...';
        translationResult.style.color = '#FF8F00';
        updateStatus('Translating...', true);
    }
});

// Listen for OCR hotkey trigger from main process
window.electronAPI.onTriggerOCRSnip(() => {
    console.log('OCR hotkey triggered');
    // Switch to OCR tab and trigger selection
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    const ocrTabBtn = document.querySelector('.tab-btn[data-tab="ocr"]');
    const ocrTab = document.getElementById('ocr-tab');
    if (ocrTabBtn && ocrTab) {
        ocrTabBtn.classList.add('active');
        ocrTab.classList.add('active');
    }
    
    // Wait a bit for tab to be visible, then trigger button click
    setTimeout(() => {
        const selectAreaBtn = document.getElementById('selectAreaBtn');
        if (selectAreaBtn) {
            selectAreaBtn.click();
        }
    }, 100);
});

// OCR Tab functionality
function initializeOCRTab() {
    // Wait for OCR tab to be loaded
    setTimeout(() => {
        const selectAreaBtn = document.getElementById('selectAreaBtn');
        const clearOverlayBtn = document.getElementById('clearOverlayBtn');
        const showOverlayBtn = document.getElementById('showOverlayBtn');
        const ocrStatus = document.getElementById('ocrStatus');
        const ocrOriginalText = document.getElementById('ocrOriginalText');
        const ocrTranslationResult = document.getElementById('ocrTranslationResult');

        if (selectAreaBtn) {
            selectAreaBtn.addEventListener('click', async () => {
                selectAreaBtn.disabled = true;
                const loadingIndicator = document.getElementById('loadingIndicator');
                const loadingText = document.getElementById('loadingText');
                
                if (loadingIndicator) {
                    loadingIndicator.style.display = 'none';
                }
                ocrStatus.textContent = 'Select an area on your screen...';
                
                try {
                    await window.electronAPI.startScreenSelection();
                } catch (error) {
                    console.error('Error starting screen selection:', error);
                    ocrStatus.textContent = 'Error: ' + error.message;
                    selectAreaBtn.disabled = false;
                    if (loadingIndicator) {
                        loadingIndicator.style.display = 'none';
                    }
                }
            });
        }

        if (clearOverlayBtn) {
            clearOverlayBtn.addEventListener('click', async () => {
                await window.electronAPI.clearOverlay();
                ocrStatus.textContent = 'Overlay cleared';
            });
        }

        if (showOverlayBtn) {
            showOverlayBtn.addEventListener('click', async () => {
                await window.electronAPI.showOverlay();
                ocrStatus.textContent = 'Overlay shown';
            });
        }

        // Listen for OCR results
        window.electronAPI.onOCRResult((result) => {
            console.log('OCR Result received:', result);
            const loadingIndicator = document.getElementById('loadingIndicator');
            const loadingText = document.getElementById('loadingText');
            
            // Hide loading indicator and show status
            if (loadingIndicator) {
                loadingIndicator.style.display = 'none';
            }
            if (ocrStatus) {
                ocrStatus.style.display = 'block';
            }
            
            if (result.success) {
                console.log('Displaying OCR results in UI');
                ocrOriginalText.textContent = result.original || 'No text extracted';
                ocrTranslationResult.textContent = result.translation || 'Translation not available';
                ocrStatus.textContent = '✓ Translation complete! Check overlay above selected area.';
                ocrStatus.style.color = '#4CAF50';
                
                // Switch to OCR tab to show results
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                const ocrTabBtn = document.querySelector('.tab-btn[data-tab="ocr"]');
                const ocrTab = document.getElementById('ocr-tab');
                if (ocrTabBtn && ocrTab) {
                    ocrTabBtn.classList.add('active');
                    ocrTab.classList.add('active');
                }
            } else {
                // Only show error if it's not a cancellation
                if (!result.cancelled) {
                    console.error('OCR Error:', result.error);
                    ocrStatus.textContent = 'Error: ' + (result.error || 'Unknown error');
                    ocrStatus.style.color = '#f44336';
                    ocrOriginalText.textContent = 'Error occurred';
                    ocrTranslationResult.textContent = result.error || 'Unknown error occurred';
                } else {
                    // Selection was cancelled, just reset status
                    ocrStatus.textContent = 'Selection cancelled. Click button to try again.';
                    ocrStatus.style.color = '#666';
                }
            }
            
            if (selectAreaBtn) {
                selectAreaBtn.disabled = false;
            }
        });
        
        // Listen for OCR processing stages
        window.electronAPI.onOCRProcessingStage?.((stage) => {
            console.log('OCR Processing Stage:', stage.message);
            const loadingIndicator = document.getElementById('loadingIndicator');
            const loadingText = document.getElementById('loadingText');
            
            if (loadingIndicator && loadingText) {
                console.log('Showing loading indicator');
                loadingIndicator.style.display = 'flex';
                loadingText.textContent = stage.message || 'Processing...';
                ocrStatus.textContent = stage.message || 'Processing...';
                ocrStatus.style.display = 'none'; // Hide old status while loading
            }
        });
    }, 200);
}