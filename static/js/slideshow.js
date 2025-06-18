class Slideshow {
    constructor() {
        this.images = [];
        this.currentIndex = 0;
        this.interval = null;
        this.speed = 5000;
        this.isPlaying = true;
        this.loadStoredImages();
        this.init();
    }

    loadStoredImages() {
        // Load images from localStorage
        const savedImages = JSON.parse(localStorage.getItem('tvImages') || '[]');
        this.images = savedImages;
        
        // Add some default images if none exist
        if (this.images.length === 0) {
            this.images = [
                'https://picsum.photos/1920/1080?random=1',
                'https://picsum.photos/1920/1080?random=2',
                'https://picsum.photos/1920/1080?random=3'
            ];
        }
    }

    addImage(imageData) {
        this.images.push(imageData);
        // Save to localStorage
        localStorage.setItem('tvImages', JSON.stringify(this.images));
        
        // If slideshow is empty, start it
        if (this.images.length === 1) {
            this.displayImage(0);
            this.start();
        }
    }

    displayImage(index) {
        if (this.images.length === 0) return;
        
        const slideshow = document.getElementById('slideshow');
        const img = document.createElement('div');
        img.className = 'slide active';
        img.style.backgroundImage = `url(${this.images[index]})`;
        img.style.backgroundSize = 'cover';
        img.style.backgroundPosition = 'center';
        img.style.width = '100%';
        img.style.height = '100%';
        
        // Remove old slides
        slideshow.innerHTML = '';
        slideshow.appendChild(img);
    }

    next() {
        if (this.images.length === 0) return;
        this.currentIndex = (this.currentIndex + 1) % this.images.length;
        this.displayImage(this.currentIndex);
    }

    start() {
        if (this.images.length > 0 && !this.interval) {
            this.interval = setInterval(() => this.next(), this.speed);
            this.isPlaying = true;
        }
    }

    pause() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            this.isPlaying = false;
        }
    }

    init() {
        if (this.images.length > 0) {
            this.displayImage(0);
            this.start();
        }
    }
}

// Make slideshow globally available
window.slideshow = new Slideshow();

// Setup toggle button
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('slideshow-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            if (window.slideshow.isPlaying) {
                window.slideshow.pause();
                toggleBtn.textContent = '▶️ Play Slideshow';
            } else {
                window.slideshow.start();
                toggleBtn.textContent = '⏸️ Pause Slideshow';
            }
        });
    }
});