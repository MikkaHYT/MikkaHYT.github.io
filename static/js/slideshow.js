class PhotoSlideshow {
    constructor() {
        this.photos = [];
        this.currentIndex = 0;
        this.defaultPhotos = [
            'https://picsum.photos/1920/1080?random=1',
            'https://picsum.photos/1920/1080?random=2',
            'https://picsum.photos/1920/1080?random=3',
            'https://picsum.photos/1920/1080?random=4',
            'https://picsum.photos/1920/1080?random=5'
        ];
    }

    init() {
        this.loadPhotos();
        this.showCurrentImage();
    }

    loadPhotos() {
        // Load from localStorage first
        const savedPhotos = localStorage.getItem('tvDashboardPhotos');
        if (savedPhotos) {
            const parsed = JSON.parse(savedPhotos);
            this.photos = [...parsed, ...this.defaultPhotos];
        } else {
            this.photos = [...this.defaultPhotos];
        }

        if (this.photos.length === 0) {
            this.photos = this.defaultPhotos;
        }
    }

    addPhoto(dataUrl) {
        this.photos.unshift(dataUrl); // Add to beginning
        this.savePhotos();
    }

    addPhotos(dataUrls) {
        this.photos.unshift(...dataUrls);
        this.savePhotos();
    }

    savePhotos() {
        // Only save user-uploaded photos (not default ones)
        const userPhotos = this.photos.filter(photo => !photo.includes('picsum.photos'));
        localStorage.setItem('tvDashboardPhotos', JSON.stringify(userPhotos));
    }

    nextImage() {
        this.currentIndex = (this.currentIndex + 1) % this.photos.length;
        this.showCurrentImage();
    }

    previousImage() {
        this.currentIndex = (this.currentIndex - 1 + this.photos.length) % this.photos.length;
        this.showCurrentImage();
    }

    showCurrentImage() {
        if (this.photos.length === 0) return;

        const slideshow = document.getElementById('slideshow');
        const imageUrl = this.photos[this.currentIndex];
        
        // Preload image to avoid flickering
        const img = new Image();
        img.onload = () => {
            slideshow.style.backgroundImage = `url(${imageUrl})`;
        };
        img.onerror = () => {
            // If image fails to load, try next one
            this.nextImage();
        };
        img.src = imageUrl;
    }

    removeCurrentImage() {
        if (this.photos.length <= 1) return;
        
        this.photos.splice(this.currentIndex, 1);
        this.savePhotos();
        
        if (this.currentIndex >= this.photos.length) {
            this.currentIndex = 0;
        }
        
        this.showCurrentImage();
    }

    getPhotoCount() {
        return this.photos.length;
    }
}

window.slideshow = new PhotoSlideshow();