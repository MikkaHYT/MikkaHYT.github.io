class TVSessionManager {
    constructor() {
        this.sessionCode = null;
        this.socket = io();
        this.init();
    }

    init() {
        this.generateNewSession();
        this.setupSocketListeners();
        this.setupEventListeners();
    }

    async generateNewSession() {
        try {
            const response = await fetch('/generate-session');
            const data = await response.json();
            this.sessionCode = data.sessionCode;
            
            document.getElementById('session-code').textContent = this.sessionCode;
            
            // Join the socket room for this session
            this.socket.emit('join_tv_session', { sessionCode: this.sessionCode });
            
            // Load existing images for this session
            this.loadSessionImages();
            
        } catch (error) {
            console.error('Failed to generate session:', error);
            document.getElementById('session-code').textContent = 'ERROR';
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
        this.socket.on('new_image_uploaded', (data) => {
            if (data.sessionCode === this.sessionCode) {
                this.addImageToSlideshow(data.imageData);
                this.showNewImageNotification();
            }
        });
    }

    setupEventListeners() {
        document.getElementById('new-code-btn').addEventListener('click', () => {
            this.generateNewSession();
        });
    }

    addImageToSlideshow(imageData) {
        // Add image to the slideshow system
        if (window.slideshow) {
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
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.tvSession = new TVSessionManager();
});