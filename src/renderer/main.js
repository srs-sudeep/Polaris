// Hide preloader after app loads
window.addEventListener('DOMContentLoaded', () => {
    const preloader = document.getElementById('preloader');
    
    // Simulate loading time for smooth experience
    setTimeout(() => {
        preloader.classList.add('fade-out');
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
        
        document.querySelector('.tab-btn[data-tab="translation"]').classList.add('active');
        document.getElementById('translation-tab').classList.add('active');
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

// Initialize
updateStatus('Monitoring clipboard for Japanese text...', true);