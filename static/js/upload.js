class TVSessionManager {
    constructor() {
        this.sessionCode = null;
        this.socket = null;
        this.init();
    }

    init() {
        // Initialize socket.io if available
        if (typeof io !== 'undefined') {
            this.socket = io();
            this.setupSocketListeners();
        } else {
            console.warn('Socket.IO not available, using fallback mode');
        }
        
        this.generateNewSession();
        this.setupEventListeners();
    }

    async generateNewSession() {
        try {
            const response = await fetch('/generate-session');
            const data = await response.json();
            this.sessionCode = data.sessionCode;
            
            const sessionCodeElement = document.getElementById('session-code');
            if (sessionCodeElement) {
                sessionCodeElement.textContent = this.sessionCode;
            }
            
            // Join the socket room for this session if socket is available
            if (this.socket) {
                this.socket.emit('join_tv_session', { sessionCode: this.sessionCode });
            }
            
            // Load existing images for this session
            this.loadSessionImages();
            
        } catch (error) {
            console.error('Failed to generate session:', error);
            const sessionCodeElement = document.getElementById('session-code');
            if (sessionCodeElement) {
                sessionCodeElement.textContent = 'ERROR';
            }
        }
    }

    async loadSessionImages() {
        try {
            const response = await fetch(`/get-session-images/${this.sessionCode}`);
            const data = await response.json();
            
            // Add existing images to slideshow
            data.images.forEach(image => {
                this.addImageToSlideshow(image.data);
            });
            
        } catch (error) {
            console.error('Failed to load session images:', error);
        }
    }

    setupSocketListeners() {
        if (!this.socket) return;
        
        this.socket.on('new_image_uploaded', (data) => {
            if (data.sessionCode === this.sessionCode) {
                this.addImageToSlideshow(data.imageData);
                this.showNewImageNotification();
            }
        });
    }

    setupEventListeners() {
        const newCodeBtn = document.getElementById('new-code-btn');
        if (newCodeBtn) {
            newCodeBtn.addEventListener('click', () => {
                this.generateNewSession();
            });
        }
    }

    addImageToSlideshow(imageData) {
        // Add image to the slideshow system
        if (window.slideshow && window.slideshow.addImage) {
            window.slideshow.addImage(imageData);
        } else {
            // Store in localStorage as fallback
            const savedImages = JSON.parse(localStorage.getItem('tvImages') || '[]');
            savedImages.push(imageData);
            localStorage.setItem('tvImages', JSON.stringify(savedImages));
        }
    }

    showNewImageNotification() {
        const notification = document.createElement('div');
        notification.className = 'new-images-notification';
        notification.textContent = '📸 New photo uploaded!';
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(76, 175, 80, 0.9);
            color: white;
            padding: 20px 40px;
            border-radius: 10px;
            font-size: 18px;
            z-index: 1000;
            animation: slideIn 0.5s ease-out;
        `;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    showModal() {
        const modal = document.getElementById('upload-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    hideModal() {
        const modal = document.getElementById('upload-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }
}

// Create a photo upload service that dashboard.js expects
class PhotoUploadService {
    constructor() {
        this.sessionManager = null;
    }

    init() {
        this.sessionManager = new TVSessionManager();
    }

    showModal() {
        if (this.sessionManager) {
            this.sessionManager.showModal();
        }
    }

    hideModal() {
        if (this.sessionManager) {
            this.sessionManager.hideModal();
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.photoUpload = new PhotoUploadService();
    window.tvSession = new TVSessionManager();
});