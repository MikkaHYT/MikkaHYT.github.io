class SpotifyService {
    constructor() {
        this.clientId = '7064e62e011b4563932083ae28312b16';
        this.clientSecret = 'd7bb179a6a494295a2013893f809805c';
        this.redirectUri = 'http://localhost:8080/callback'; // For Tizen TV
        this.accessToken = null;
        this.refreshToken = null;
        this.isAuthenticated = false;
        this.currentTrack = null;
        this.updateInterval = null;
        this.authCodeVerifier = null;
        this.authState = null;
        this.authPollInterval = null;
    }    async init() {
        // Check if we have stored tokens
        const storedTokens = localStorage.getItem('spotifyTokens');
        if (storedTokens) {
            try {
                const tokens = JSON.parse(storedTokens);
                this.accessToken = tokens.accessToken;
                this.refreshToken = tokens.refreshToken;
                
                // Test if tokens are still valid
                const isValid = await this.testConnection();
                if (isValid) {
                    this.isAuthenticated = true;
                    this.startPolling();
                    this.updateSpotifyUI();
                    return;
                }
            } catch (error) {
                console.error('Error loading stored tokens:', error);
                localStorage.removeItem('spotifyTokens');
            }
        }
        
        // Show disabled UI if not authenticated
        this.showDisabledUI();
    }

    showDisabledUI() {
        const spotifyContainer = document.getElementById('spotify-container');
        spotifyContainer.innerHTML = `
            <div class="spotify-disabled">
                <div style="font-size: 1.2rem; opacity: 0.5; margin-bottom: 10px;">🎵 Spotify</div>
                <div style="font-size: 0.9rem; opacity: 0.4;">Press "Music" button to connect</div>
            </div>
        `;
    }    // Generate PKCE challenge for security
    generateCodeChallenge() {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        let array = new Uint8Array(64);
        crypto.getRandomValues(array);
        
        this.authCodeVerifier = Array.from(array, byte => possible[byte % possible.length]).join('');
        
        return crypto.subtle.digest('SHA-256', new TextEncoder().encode(this.authCodeVerifier))
            .then(buffer => {
                return btoa(String.fromCharCode(...new Uint8Array(buffer)))
                    .replace(/\+/g, '-')
                    .replace(/\//g, '_')
                    .replace(/=/g, '');
            });
    }

    async startAuth() {
        try {
            // Generate PKCE challenge
            const codeChallenge = await this.generateCodeChallenge();
            this.authState = Math.random().toString(36).substring(7);
            
            // Create authorization URL
            const scopes = [
                'user-read-currently-playing',
                'user-read-playback-state',
                'user-modify-playback-state',
                'streaming'
            ].join(' ');
            
            const authUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
                response_type: 'code',
                client_id: this.clientId,
                scope: scopes,
                redirect_uri: this.redirectUri,
                state: this.authState,
                code_challenge_method: 'S256',
                code_challenge: codeChallenge
            });
            
            this.showQRCodeAuth(authUrl);
            
        } catch (error) {
            console.error('Spotify authentication setup failed:', error);
            this.showAuthError();
        }
    }

    showQRCodeAuth(authUrl) {
        // This method will be called when the Music button is pressed
        // We'll create a modal similar to the upload modal
        this.createAuthModal(authUrl);
    }

    createAuthModal(authUrl) {
        // Remove existing auth modal if any
        const existingModal = document.getElementById('spotify-auth-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'spotify-auth-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>🎵 Connect to Spotify</h2>
                
                <div class="auth-section">
                    <p>Scan this QR code with your phone to authenticate:</p>
                    
                    <div class="qr-container">
                        <div id="spotify-qr-code" class="qr-code"></div>
                        <div class="auth-url-container">
                            <div class="auth-url-label">Or visit this URL:</div>
                            <div id="spotify-auth-url" class="auth-url-display">${authUrl}</div>
                        </div>
                    </div>
                    
                    <div class="auth-instructions">
                        <p>After authorizing on your phone:</p>
                        <ol>
                            <li>You'll be redirected to a page with a code</li>
                            <li>Enter that code below</li>
                        </ol>
                    </div>
                    
                    <div class="code-input-section">
                        <label for="auth-code-input">Authorization Code:</label>
                        <input type="text" id="auth-code-input" class="auth-code-input" placeholder="Enter the code from your phone">
                        <button id="submit-auth-code" class="nav-button">Submit Code</button>
                    </div>
                    
                    <div class="auth-status" id="auth-status"></div>
                </div>
                
                <div class="modal-actions">
                    <button id="cancel-auth" class="nav-button secondary-button">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Generate QR code
        this.generateQRCode(authUrl, 'spotify-qr-code');
        
        // Bind events
        this.bindAuthModalEvents(modal);
        
        // Show modal
        modal.classList.remove('hidden');
        
        // Focus on input
        const input = document.getElementById('auth-code-input');
        if (input) {
            setTimeout(() => input.focus(), 100);
        }
    }

    generateQRCode(text, containerId) {
        // Simple QR code generation using a service
        const qrContainer = document.getElementById(containerId);
        if (qrContainer) {
            qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}" alt="QR Code" style="max-width: 100%; height: auto;">`;
        }
    }

    bindAuthModalEvents(modal) {
        const cancelBtn = modal.querySelector('#cancel-auth');
        const submitBtn = modal.querySelector('#submit-auth-code');
        const codeInput = modal.querySelector('#auth-code-input');
        
        cancelBtn.addEventListener('click', () => {
            this.closeAuthModal();
        });
        
        submitBtn.addEventListener('click', () => {
            const code = codeInput.value.trim();
            if (code) {
                this.exchangeCodeForToken(code);
            }
        });
        
        codeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const code = codeInput.value.trim();
                if (code) {
                    this.exchangeCodeForToken(code);
                }
            }
        });
    }

    async exchangeCodeForToken(authCode) {
        const statusDiv = document.getElementById('auth-status');
        statusDiv.innerHTML = '<div style="color: #ffd700;">🔄 Authenticating...</div>';
        
        try {
            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: authCode,
                    redirect_uri: this.redirectUri,
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    code_verifier: this.authCodeVerifier
                })
            });

            if (response.ok) {
                const data = await response.json();
                this.accessToken = data.access_token;
                this.refreshToken = data.refresh_token;
                
                // Store tokens
                localStorage.setItem('spotifyTokens', JSON.stringify({
                    accessToken: this.accessToken,
                    refreshToken: this.refreshToken,
                    expiresAt: Date.now() + (data.expires_in * 1000)
                }));
                
                this.isAuthenticated = true;
                statusDiv.innerHTML = '<div style="color: #1DB954;">✅ Successfully authenticated!</div>';
                
                // Close modal and start using Spotify
                setTimeout(() => {
                    this.closeAuthModal();
                    this.startPolling();
                    this.updateSpotifyUI();
                    
                    if (window.tvDashboard) {
                        window.tvDashboard.showNotification('🎵 Spotify connected successfully!');
                    }
                }, 2000);
                
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error_description || 'Authentication failed');
            }
        } catch (error) {
            console.error('Token exchange failed:', error);
            statusDiv.innerHTML = `<div style="color: #ff6b6b;">❌ Authentication failed: ${error.message}</div>`;
        }
    }

    closeAuthModal() {
        const modal = document.getElementById('spotify-auth-modal');
        if (modal) {
            modal.remove();
        }
        
        // Clear auth state
        this.authCodeVerifier = null;
        this.authState = null;
        
        if (this.authPollInterval) {
            clearInterval(this.authPollInterval);
            this.authPollInterval = null;
        }
    }    showAuthError() {
        const statusDiv = document.getElementById('auth-status');
        if (statusDiv) {
            statusDiv.innerHTML = '<div style="color: #ff6b6b;">❌ Authentication failed. Please try again.</div>';
        } else {
            // If no status div (not in modal), show notification
            if (window.tvDashboard) {
                window.tvDashboard.showNotification('🎵 ❌ Spotify authentication failed');
            }
        }
    }

    updateSpotifyUI() {
        const spotifyContainer = document.getElementById('spotify-container');
        
        if (!this.isAuthenticated) {
            this.showDisabledUI();
            return;
        }
        
        if (!this.currentTrack) {
            spotifyContainer.innerHTML = `
                <div class="spotify-idle">
                    <div style="font-size: 1.2rem; opacity: 0.7;">🎵 Spotify Connected</div>
                    <div style="font-size: 0.9rem; opacity: 0.5; margin-top: 5px;">No music playing</div>
                </div>
            `;
            return;
        }
        
        const progressPercent = (this.currentTrack.progress / this.currentTrack.duration) * 100;
        const currentTime = this.formatTime(this.currentTrack.progress);
        const totalTime = this.formatTime(this.currentTrack.duration);
        
        spotifyContainer.innerHTML = `
            <div class="spotify-player">
                <div class="track-info">
                    <img src="${this.currentTrack.image}" alt="Album Art" class="album-art">
                    <div class="track-details">
                        <div class="track-name">${this.currentTrack.name}</div>
                        <div class="track-artist">${this.currentTrack.artist}</div>
                        <div class="track-album">${this.currentTrack.album}</div>
                    </div>
                </div>
                
                <div class="playback-controls">
                    <button id="spotify-prev" class="control-btn">⏮️</button>
                    <button id="spotify-play-pause" class="control-btn main-control">
                        ${this.currentTrack.isPlaying ? '⏸️' : '▶️'}
                    </button>
                    <button id="spotify-next" class="control-btn">⏭️</button>
                </div>
                
                <div class="progress-section">
                    <span class="time-current">${currentTime}</span>
                    <div class="progress-bar-spotify">
                        <div class="progress-fill-spotify" style="width: ${progressPercent}%"></div>
                    </div>
                    <span class="time-total">${totalTime}</span>
                </div>
            </div>
        `;
        
        // Bind control events
        this.bindPlayerControls();
    }

    bindPlayerControls() {
        const prevBtn = document.getElementById('spotify-prev');
        const playPauseBtn = document.getElementById('spotify-play-pause');
        const nextBtn = document.getElementById('spotify-next');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.previousTrack());
        }
        
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => this.togglePlayback());
        }
          if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextTrack());
        }
    }

    async togglePlayback() {
        if (!this.currentTrack || !this.accessToken) return;
        
        try {
            const endpoint = this.currentTrack.isPlaying ? 'pause' : 'play';
            const response = await fetch(`https://api.spotify.com/v1/me/player/${endpoint}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.status === 401) {
                const refreshed = await this.refreshAccessToken();
                if (refreshed) {
                    return this.togglePlayback();
                }
                return;
            }
            
            if (response.ok || response.status === 204) {
                // Update local state immediately for better UX
                this.currentTrack.isPlaying = !this.currentTrack.isPlaying;
                
                // Update button
                const playPauseBtn = document.getElementById('spotify-play-pause');
                if (playPauseBtn) {
                    playPauseBtn.textContent = this.currentTrack.isPlaying ? '⏸️' : '▶️';
                }
                
                // Show notification
                if (window.tvDashboard) {
                    const action = this.currentTrack.isPlaying ? 'Playing' : 'Paused';
                    window.tvDashboard.showNotification(`🎵 ${action}: ${this.currentTrack.name}`);
                }
                
                // Refresh current state after a short delay
                setTimeout(() => this.getCurrentlyPlaying(), 1000);
            } else {
                console.error('Failed to toggle playback:', response.status);
            }
        } catch (error) {
            console.error('Playback control failed:', error);
        }
    }

    async nextTrack() {
        if (!this.accessToken) return;
        
        try {
            const response = await fetch('https://api.spotify.com/v1/me/player/next', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
            
            if (response.status === 401) {
                const refreshed = await this.refreshAccessToken();
                if (refreshed) {
                    return this.nextTrack();
                }
                return;
            }
            
            if (response.ok || response.status === 204) {
                if (window.tvDashboard) {
                    window.tvDashboard.showNotification('🎵 ⏭️ Next track');
                }
                
                // Refresh current state after a short delay
                setTimeout(() => this.getCurrentlyPlaying(), 1000);
            } else {
                console.error('Failed to skip to next track:', response.status);
            }
        } catch (error) {
            console.error('Next track failed:', error);
        }
    }

    async previousTrack() {
        if (!this.accessToken) return;
          try {
            const response = await fetch('https://api.spotify.com/v1/me/player/previous', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
            
            if (response.status === 401) {
                const refreshed = await this.refreshAccessToken();
                if (refreshed) {
                    return this.previousTrack();
                }
                return;
            }
            
            if (response.ok || response.status === 204) {
                if (window.tvDashboard) {
                    window.tvDashboard.showNotification('🎵 ⏮️ Previous track');
                }
                
                // Refresh current state after a short delay
                setTimeout(() => this.getCurrentlyPlaying(), 1000);
            } else {
                console.error('Failed to skip to previous track:', response.status);
            }        } catch (error) {
            console.error('Previous track failed:', error);
        }
    }

    formatTime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    disconnect() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        if (this.authPollInterval) {
            clearInterval(this.authPollInterval);
            this.authPollInterval = null;
        }
        
        this.accessToken = null;
        this.refreshToken = null;
        this.isAuthenticated = false;
        this.currentTrack = null;
        this.authCodeVerifier = null;
        this.authState = null;
        
        localStorage.removeItem('spotifyTokens');
        this.showDisabledUI();
        
        if (window.tvDashboard) {
            window.tvDashboard.showNotification('🎵 Spotify disconnected');
        }
    }

    // Method to handle Music button press
    handleMusicButtonPress() {
        if (this.isAuthenticated) {
            // If already authenticated, show current track or player controls
            this.updateSpotifyUI();
        } else {
            // Start authentication flow
            this.startAuth();
        }
    }

    async testConnection() {
        if (!this.accessToken) return false;
        
        try {
            const response = await fetch('https://api.spotify.com/v1/me', {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
            
            if (response.status === 401) {
                // Token expired, try to refresh
                if (this.refreshToken) {
                    return await this.refreshAccessToken();
                }
                return false;
            }
            
            return response.ok;
        } catch (error) {
            console.error('Spotify connection test failed:', error);
            return false;
        }
    }

    async refreshAccessToken() {
        if (!this.refreshToken) return false;
        
        try {
            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: this.refreshToken,
                    client_id: this.clientId,
                    client_secret: this.clientSecret
                })
            });

            if (response.ok) {
                const data = await response.json();
                this.accessToken = data.access_token;
                
                // Update stored tokens
                localStorage.setItem('spotifyTokens', JSON.stringify({
                    accessToken: this.accessToken,
                    refreshToken: this.refreshToken,
                    expiresAt: Date.now() + (data.expires_in * 1000)
                }));
                
                return true;
            } else {
                console.error('Failed to refresh token');
                return false;
            }
        } catch (error) {
            console.error('Token refresh failed:', error);
            return false;
        }
    }

    startPolling() {
        // Poll for currently playing track every 5 seconds
        this.updateInterval = setInterval(() => {
            this.getCurrentlyPlaying();
        }, 5000);
        
        // Get initial track
        this.getCurrentlyPlaying();
    }

    async getCurrentlyPlaying() {
        if (!this.accessToken) return;
        
        try {
            const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });
            
            if (response.status === 401) {
                // Token expired, try to refresh
                const refreshed = await this.refreshAccessToken();
                if (refreshed) {
                    // Retry the request
                    return this.getCurrentlyPlaying();
                } else {
                    // Authentication failed, disconnect
                    this.disconnect();
                    return;
                }
            }
            
            if (response.status === 204) {
                // No track currently playing
                this.currentTrack = null;
                this.updateSpotifyUI();
                return;
            }
            
            if (response.ok) {
                const data = await response.json();
                
                if (data.item) {
                    this.currentTrack = {
                        name: data.item.name,
                        artist: data.item.artists.map(artist => artist.name).join(', '),
                        album: data.item.album.name,
                        image: data.item.album.images[0]?.url || 'https://via.placeholder.com/80x80/1DB954/FFFFFF?text=♪',
                        duration: data.item.duration_ms,
                        progress: data.progress_ms || 0,
                        isPlaying: data.is_playing,
                        id: data.item.id,
                        uri: data.item.uri
                    };
                    
                    this.updateSpotifyUI();
                } else {
                    this.currentTrack = null;
                    this.updateSpotifyUI();
                }
            }
        } catch (error) {
            console.error('Failed to get currently playing:', error);
        }
    }
}

window.spotifyService = new SpotifyService();
