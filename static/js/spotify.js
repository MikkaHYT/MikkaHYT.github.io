class SpotifyService {
    constructor() {
        this.isAuthenticated = false;
        this.currentTrack = null;
        this.isPlaying = false;
        this.updateInterval = null;
        this.username = null;
    }

    async init() {
        // Get current user from session
        this.username = this.getCurrentUser();
        
        if (!this.username) {
            this.showNotification('🔐 Please log in to use Spotify features');
            return;
        }

        // Check if user just completed authentication
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('spotify') === 'connected') {
            this.showNotification('🎵 Spotify connected successfully!');
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        await this.checkAuthStatus();
        
        if (this.isAuthenticated) {
            this.startStatusUpdates();
        }
    }

    getCurrentUser() {
        // Get username from localStorage (set during login)
        return localStorage.getItem('username') || null;
    }

    async checkAuthStatus() {
        if (!this.username) {
            this.isAuthenticated = false;
            return;
        }

        try {
            const response = await fetch('/spotify-status', {
                credentials: 'include' // Include session cookies
            });
            
            if (response.ok) {
                this.isAuthenticated = true;
                const data = await response.json();
                this.updateUI(data);
            } else if (response.status === 401) {
                this.isAuthenticated = false;
                this.displayNotConnected();
            } else {
                this.isAuthenticated = false;
                console.error('Failed to check Spotify status:', response.statusText);
            }
        } catch (error) {
            console.error('Failed to check Spotify status:', error);
            this.isAuthenticated = false;
        }
    }

    async authenticate() {
        if (!this.username) {
            this.showNotification('🔐 Please log in first to connect Spotify');
            return;
        }

        // Redirect to Spotify login
        window.location.href = '/spotify-login';
    }

    async disconnect() {
        if (!this.username) {
            this.showNotification('🔐 Not logged in');
            return;
        }

        try {
            const response = await fetch('/spotify-disconnect', {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                this.isAuthenticated = false;
                this.showNotification('🎵 Spotify disconnected');
                this.displayNotConnected();
                this.stopStatusUpdates();
            } else {
                this.showNotification('🎵 ❌ Failed to disconnect Spotify');
            }
        } catch (error) {
            console.error('Spotify disconnect error:', error);
            this.showNotification('🎵 ❌ Failed to disconnect Spotify');
        }
    }

    async controlPlayback(action) {
        if (!this.username) {
            this.showNotification('🔐 Please log in first');
            return;
        }

        if (!this.isAuthenticated) {
            this.showNotification('🎵 ❌ Please connect Spotify first');
            return;
        }

        try {
            const response = await fetch('/spotify-control', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ action })
            });

            if (response.ok) {
                // Update status after a short delay
                setTimeout(() => this.updateStatus(), 500);
            } else if (response.status === 401) {
                this.isAuthenticated = false;
                this.showNotification('🎵 ❌ Spotify session expired. Please reconnect.');
                this.displayNotConnected();
            } else {
                this.showNotification('🎵 ❌ Control action failed');
            }
        } catch (error) {
            console.error('Spotify control error:', error);
            this.showNotification('🎵 ❌ Control action failed');
        }
    }

    async updateStatus() {
        if (!this.username || !this.isAuthenticated) return;

        try {
            const response = await fetch('/spotify-status', {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                this.updateUI(data);
            } else if (response.status === 401) {
                this.isAuthenticated = false;
                this.displayNotConnected();
                this.stopStatusUpdates();
            }
        } catch (error) {
            console.error('Failed to update Spotify status:', error);
        }
    }

    updateUI(data) {
        this.isPlaying = data.is_playing || false;
        
        if (data.item) {
            this.currentTrack = data.item;
            this.displayNowPlaying(data);
        } else {
            this.displayNoTrack();
        }

        this.updateControls();
    }

    displayNowPlaying(data) {
        const spotifyWidget = document.getElementById('spotify-widget');
        if (!spotifyWidget) return;

        const track = data.item;
        const artists = track.artists.map(artist => artist.name).join(', ');
        const albumArt = track.album.images[0]?.url || '';

        spotifyWidget.innerHTML = `
            <div class="now-playing">
                <div class="album-art">
                    <img src="${albumArt}" alt="${track.album.name}" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjMzMzIi8+Cjx0ZXh0IHg9IjMyIiB5PSIzNiIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjI0IiBmaWxsPSIjNjY2IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj7wn46lPC90ZXh0Pgo8L3N2Zz4='">
                    <div class="play-indicator ${this.isPlaying ? 'playing' : ''}">
                        ${this.isPlaying ? '⏸️' : '▶️'}
                    </div>
                </div>
                <div class="track-info">
                    <div class="track-name">${track.name}</div>
                    <div class="artist-name">${artists}</div>
                    <div class="album-name">${track.album.name}</div>
                </div>
                <div class="progress-bar">
                    <div class="progress" style="width: ${(data.progress_ms / track.duration_ms) * 100}%"></div>
                </div>
                <div class="spotify-actions">
                    <button onclick="window.spotifyService.disconnect()" class="disconnect-btn" title="Disconnect Spotify">
                        🔗❌
                    </button>
                </div>
            </div>
        `;
    }

    displayNoTrack() {
        const spotifyWidget = document.getElementById('spotify-widget');
        if (!spotifyWidget) return;

        if (this.isAuthenticated) {
            spotifyWidget.innerHTML = `
                <div class="no-track">
                    <div class="spotify-logo">🎵</div>
                    <div class="message">No music playing</div>
                    <div class="spotify-actions">
                        <button onclick="window.spotifyService.authenticate()" class="connect-btn">
                            Open Spotify
                        </button>
                        <button onclick="window.spotifyService.disconnect()" class="disconnect-btn">
                            Disconnect
                        </button>
                    </div>
                </div>
            `;
        } else {
            this.displayNotConnected();
        }
    }

    displayNotConnected() {
        const spotifyWidget = document.getElementById('spotify-widget');
        if (!spotifyWidget) return;

        if (this.username) {
            spotifyWidget.innerHTML = `
                <div class="no-track">
                    <div class="spotify-logo">🎵</div>
                    <div class="message">Connect Spotify</div>
                    <div class="user-info">Logged in as: ${this.username}</div>
                    <button onclick="window.spotifyService.authenticate()" class="connect-btn">
                        Connect Spotify
                    </button>
                </div>
            `;
        } else {
            spotifyWidget.innerHTML = `
                <div class="no-track">
                    <div class="spotify-logo">🎵</div>
                    <div class="message">Please log in</div>
                    <div class="user-info">Login required for Spotify features</div>
                </div>
            `;
        }
    }

    updateControls() {
        const controls = document.querySelectorAll('.spotify-control');
        controls.forEach(control => {
            if (this.isAuthenticated && this.username) {
                control.style.opacity = '1';
                control.style.pointerEvents = 'auto';
            } else {
                control.style.opacity = '0.5';
                control.style.pointerEvents = 'none';
            }
        });
    }

    startStatusUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        this.updateInterval = setInterval(() => {
            this.updateStatus();
        }, 5000); // Update every 5 seconds
    }

    stopStatusUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    handleMusicButtonPress() {
        if (!this.username) {
            this.showNotification('🔐 Please log in first');
            if (window.tvDashboard && window.tvDashboard.showLoginModal) {
                window.tvDashboard.showLoginModal();
            }
            return;
        }

        if (!this.isAuthenticated) {
            this.authenticate();
        } else if (this.currentTrack) {
            this.controlPlayback(this.isPlaying ? 'pause' : 'play');
        } else {
            this.showNotification('🎵 No active Spotify session');
        }
    }

    togglePlayback() {
        this.controlPlayback(this.isPlaying ? 'pause' : 'play');
    }

    nextTrack() {
        this.controlPlayback('next');
    }

    previousTrack() {
        this.controlPlayback('previous');
    }

    showNotification(message) {
        if (window.tvDashboard && window.tvDashboard.showNotification) {
            window.tvDashboard.showNotification(message);
        } else {
            console.log(message);
        }
    }

    // Update username when user logs in
    updateUser(username) {
        this.username = username;
        localStorage.setItem('username', username);
        
        // Reinitialize if user changed
        this.init();
    }

    // Clear user data when user logs out
    clearUser() {
        this.username = null;
        this.isAuthenticated = false;
        localStorage.removeItem('username');
        this.stopStatusUpdates();
        this.displayNotConnected();
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.spotifyService = new SpotifyService();
});