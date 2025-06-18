class TVDashboard {
    constructor() {
        this.settings = {
            slideshowSpeed: 5000,
            timeFormat: 12,
            weatherLocation: 'London'
        };
        this.isPlaying = true;
        
        this.init();
    }

    init() {
        this.loadSettings();
        this.bindEvents();
        this.startClock();
        
        // Initialize modules with error handling
        this.initializeModules();
        
        // Start slideshow
        this.startSlideshow();
    }

    initializeModules() {
        // Initialize weather service if available
        if (window.weatherService && window.weatherService.init) {
            window.weatherService.init(this.settings.weatherLocation);
        } else {
            console.warn('Weather service not available');
        }

        // Initialize slideshow if available
        if (window.slideshow && window.slideshow.init) {
            window.slideshow.init();
        } else {
            console.warn('Slideshow service not available');
        }

        // Initialize photo upload if available
        if (window.photoUpload && window.photoUpload.init) {
            window.photoUpload.init();
        } else {
            console.warn('Photo upload service not available');
        }

        // Initialize Spotify service if available
        if (window.spotifyService && window.spotifyService.init) {
            window.spotifyService.init();
        } else {
            console.warn('Spotify service not available');
        }
    }

    bindEvents() {
        // Control buttons with error handling
        const uploadBtn = document.getElementById('upload-btn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                if (window.photoUpload && window.photoUpload.showModal) {
                    window.photoUpload.showModal();
                } else {
                    console.warn('Photo upload not available');
                }
            });
        }

        const spotifyBtn = document.getElementById('spotify-quick-control');
        if (spotifyBtn) {
            spotifyBtn.addEventListener('click', () => {
                this.toggleSpotifyPlayer();
            });
        }

        const slideshowBtn = document.getElementById('slideshow-toggle');
        if (slideshowBtn) {
            slideshowBtn.addEventListener('click', () => {
                this.toggleSlideshow();
            });
        }

        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                this.showSettings();
            });
        }

        // Settings modal
        const settingsSave = document.getElementById('settings-save');
        if (settingsSave) {
            settingsSave.addEventListener('click', () => {
                this.saveSettings();
            });
        }

        const settingsCancel = document.getElementById('settings-cancel');
        if (settingsCancel) {
            settingsCancel.addEventListener('click', () => {
                this.hideSettings();
            });
        }

        // Upload modal
        const uploadCancel = document.getElementById('upload-cancel');
        if (uploadCancel) {
            uploadCancel.addEventListener('click', () => {
                if (window.photoUpload && window.photoUpload.hideModal) {
                    window.photoUpload.hideModal();
                }
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            switch(e.keyCode) {
                case 32: // Spacebar
                    this.toggleSlideshow();
                    e.preventDefault();
                    break;
                case 85: // U key
                    if (window.photoUpload && window.photoUpload.showModal) {
                        window.photoUpload.showModal();
                    }
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
                    if (window.spotifyService && window.spotifyService.currentTrack) {
                        window.spotifyService.togglePlayback();
                    }
                    e.preventDefault();
                    break;
                case 78: // N key (Next)
                    if (window.spotifyService && window.spotifyService.currentTrack) {
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

        if (!timeElement || !dateElement) return;

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
            if (this.isPlaying && window.slideshow && window.slideshow.nextImage) {
                window.slideshow.nextImage();
            }
        }, this.settings.slideshowSpeed);
    }

    toggleSlideshow() {
        this.isPlaying = !this.isPlaying;
        const button = document.getElementById('slideshow-toggle');
        
        if (button) {
            if (this.isPlaying) {
                button.innerHTML = '⏸️ Pause Slideshow';
                this.startSlideshow();
            } else {
                button.innerHTML = '▶️ Play Slideshow';
                clearInterval(this.slideshowInterval);
            }
        }
    }

    showLoginModal() {
        // Generate a new OAuth URI and QR code for Spotify authentication
        const clientId = '7064e62e011b4563932083ae28312b16';
        const redirectUri = encodeURIComponent('https://814850.xyz/callback');
        const state = Math.random().toString(36).substring(2, 10); // random state for security
        const codeChallenge = Math.random().toString(36).substring(2, 34); // placeholder, use PKCE in production
        const scope = encodeURIComponent('user-read-currently-playing user-read-playback-state user-modify-playback-state streaming');
        const oauthUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${clientId}&scope=${scope}&redirect_uri=${redirectUri}&state=${state}&code_challenge_method=S256&code_challenge=${codeChallenge}`;

        // Update QR code and URL in modal
        const qrImg = document.querySelector('#spotify-qr-code img');
        const authUrlDisplay = document.getElementById('spotify-auth-url');
        if (qrImg) {
            qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(oauthUrl)}`;
        }
        if (authUrlDisplay) {
            authUrlDisplay.textContent = oauthUrl;
        }

        // Show the modal
        const modal = document.getElementById('spotify-auth-modal');
        if (modal) {
            modal.style.display = '';
            modal.classList.remove('hidden');
            if (window.tvNav && window.tvNav.refresh) {
            window.tvNav.refresh();
            }
        }
    }

    showSettings() {
        const modal = document.getElementById('settings-modal');
        
        if (modal) {
            // Populate current settings
            const slideshowSpeed = document.getElementById('slideshow-speed');
            const weatherLocation = document.getElementById('weather-location');
            const timeFormat = document.getElementById('time-format');
            
            if (slideshowSpeed) slideshowSpeed.value = this.settings.slideshowSpeed;
            if (weatherLocation) weatherLocation.value = this.settings.weatherLocation;
            if (timeFormat) timeFormat.value = this.settings.timeFormat;
            
            modal.classList.remove('hidden');
            
            if (window.tvNav && window.tvNav.refresh) {
                window.tvNav.refresh();
            }
        }
    }

    hideSettings() {
        const modal = document.getElementById('settings-modal');
        if (modal) {
            modal.classList.add('hidden');
            if (window.tvNav && window.tvNav.refresh) {
                window.tvNav.refresh();
            }
        }
    }

    saveSettings() {
        // Get new settings
        const slideshowSpeed = document.getElementById('slideshow-speed');
        const weatherLocation = document.getElementById('weather-location');
        const timeFormat = document.getElementById('time-format');
        
        if (slideshowSpeed) this.settings.slideshowSpeed = parseInt(slideshowSpeed.value);
        if (weatherLocation) this.settings.weatherLocation = weatherLocation.value;
        if (timeFormat) this.settings.timeFormat = parseInt(timeFormat.value);

        // Save to localStorage
        localStorage.setItem('tvDashboardSettings', JSON.stringify(this.settings));

        // Apply changes
        this.startSlideshow();
        if (window.weatherService && window.weatherService.updateLocation) {
            window.weatherService.updateLocation(this.settings.weatherLocation);
        }

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
    }

    toggleSpotifyPlayer() {
        // Use the Spotify service to handle music button press
        if (window.spotifyService && window.spotifyService.handleMusicButtonPress) {
            window.spotifyService.handleMusicButtonPress();
        } else {
            console.warn('Spotify service not available');
            this.showNotification('🎵 ❌ Spotify service not available');
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.tvDashboard = new TVDashboard();
});