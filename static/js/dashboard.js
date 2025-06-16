class TVDashboard {
    constructor() {
        this.settings = {
            slideshowSpeed: 5000,
            timeFormat: 12,
            weatherLocation: 'London'
        };
        this.isPlaying = true;
        
        this.init();
    }    init() {
        this.loadSettings();
        this.bindEvents();
        this.startClock();
        
        // Initialize modules
        window.weatherService.init(this.settings.weatherLocation);
        window.slideshow.init();
        window.photoUpload.init();
        window.spotifyService.init();
        
        // Start slideshow
        this.startSlideshow();
    }    bindEvents() {
        // Control buttons
        document.getElementById('upload-btn').addEventListener('click', () => {
            window.photoUpload.showModal();
        });

        document.getElementById('spotify-quick-control').addEventListener('click', () => {
            this.toggleSpotifyPlayer();
        });

        document.getElementById('slideshow-toggle').addEventListener('click', () => {
            this.toggleSlideshow();
        });

        document.getElementById('settings-btn').addEventListener('click', () => {
            this.showSettings();
        });

        // Settings modal
        document.getElementById('settings-save').addEventListener('click', () => {
            this.saveSettings();
        });

        document.getElementById('settings-cancel').addEventListener('click', () => {
            this.hideSettings();
        });

        // Upload modal
        document.getElementById('upload-cancel').addEventListener('click', () => {
            window.photoUpload.hideModal();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            switch(e.keyCode) {
                case 32: // Spacebar
                    this.toggleSlideshow();
                    e.preventDefault();
                    break;
                case 85: // U key
                    window.photoUpload.showModal();
                    e.preventDefault();
                    break;
                case 83: // S key
                    this.showSettings();
                    e.preventDefault();
                    break;
                case 77: // M key
                    this.toggleSpotifyPlayer();
                    e.preventDefault();
                    break;
                case 80: // P key (Play/Pause)
                    if (window.spotifyService.currentTrack) {
                        window.spotifyService.togglePlayback();
                    }
                    e.preventDefault();
                    break;
                case 78: // N key (Next)
                    if (window.spotifyService.currentTrack) {
                        window.spotifyService.nextTrack();
                    }
                    e.preventDefault();
                    break;
            }
        });
    }

    startClock() {
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
    }

    updateClock() {
        const now = new Date();
        const timeElement = document.getElementById('time');
        const dateElement = document.getElementById('date');

        // Format time
        let hours = now.getHours();
        let minutes = now.getMinutes();
        let ampm = '';

        if (this.settings.timeFormat === 12) {
            ampm = hours >= 12 ? ' PM' : ' AM';
            hours = hours % 12;
            hours = hours ? hours : 12;
        }

        const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}${ampm}`;
        timeElement.textContent = timeStr;

        // Format date
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        dateElement.textContent = now.toLocaleDateString('en-US', options);
    }

    startSlideshow() {
        if (this.slideshowInterval) {
            clearInterval(this.slideshowInterval);
        }

        this.slideshowInterval = setInterval(() => {
            if (this.isPlaying) {
                window.slideshow.nextImage();
            }
        }, this.settings.slideshowSpeed);
    }

    toggleSlideshow() {
        this.isPlaying = !this.isPlaying;
        const button = document.getElementById('slideshow-toggle');
        
        if (this.isPlaying) {
            button.innerHTML = '⏸️ Pause Slideshow';
            this.startSlideshow();
        } else {
            button.innerHTML = '▶️ Play Slideshow';
            clearInterval(this.slideshowInterval);
        }
    }

    showSettings() {
        const modal = document.getElementById('settings-modal');
        
        // Populate current settings
        document.getElementById('slideshow-speed').value = this.settings.slideshowSpeed;
        document.getElementById('weather-location').value = this.settings.weatherLocation;
        document.getElementById('time-format').value = this.settings.timeFormat;
        
        modal.classList.remove('hidden');
        window.tvNav.refresh();
    }

    hideSettings() {
        document.getElementById('settings-modal').classList.add('hidden');
        window.tvNav.refresh();
    }

    saveSettings() {
        // Get new settings
        this.settings.slideshowSpeed = parseInt(document.getElementById('slideshow-speed').value);
        this.settings.weatherLocation = document.getElementById('weather-location').value;
        this.settings.timeFormat = parseInt(document.getElementById('time-format').value);

        // Save to localStorage
        localStorage.setItem('tvDashboardSettings', JSON.stringify(this.settings));

        // Apply changes
        this.startSlideshow();
        window.weatherService.updateLocation(this.settings.weatherLocation);

        this.hideSettings();
        
        // Show confirmation
        this.showNotification('Settings saved!');
    }

    loadSettings() {
        const saved = localStorage.getItem('tvDashboardSettings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }
    }

    showNotification(message) {
        // Create temporary notification
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,255,136,0.9);
            color: white;
            padding: 20px 40px;
            border-radius: 10px;
            font-size: 1.2rem;
            z-index: 1000;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 2000);
    }    toggleSpotifyPlayer() {
        // Use the Spotify service to handle music button press
        if (window.spotifyService) {
            window.spotifyService.handleMusicButtonPress();
        } else {
            console.error('Spotify service not available');
            this.showNotification('🎵 ❌ Spotify service not available');
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.tvDashboard = new TVDashboard();
});