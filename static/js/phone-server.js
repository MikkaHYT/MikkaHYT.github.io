class PhoneUploadServer {
    constructor() {
        this.isRunning = false;
        this.tvId = this.generateTVId();
        this.uploadCode = this.generateUploadCode();
    }

    generateTVId() {
        return Math.random().toString(36).substr(2, 8).toUpperCase();
    }

    generateUploadCode() {
        return Math.floor(1000 + Math.random() * 9000).toString();
    }

    async startServer() {
        try {
            // Instead of hosting externally, we'll use a simple code-based system
            this.isRunning = true;
            
            // Show the upload instructions
            this.showUploadInstructions();
            
            // Start checking for uploads
            this.startUploadChecker();
            
            console.log(`Phone upload started with code: ${this.uploadCode}`);
            return this.uploadCode;
            
        } catch (error) {
            console.error('Failed to start upload system:', error);
            return null;
        }
    }

    showUploadInstructions() {
        const qrContainer = document.getElementById('qr-code');
        const urlContainer = document.getElementById('upload-url');
        
        // Create a simple instruction interface instead of QR code
        qrContainer.innerHTML = `
            <div style="background: rgba(255,255,255,0.1); padding: 30px; border-radius: 15px; text-align: center;">
                <div style="font-size: 2.5rem; margin-bottom: 15px;">📱</div>
                <div style="font-size: 1.4rem; font-weight: 600; margin-bottom: 10px;">Upload Code</div>
                <div style="font-size: 3rem; font-weight: 700; color: #00ff88; margin: 15px 0; letter-spacing: 5px; font-family: monospace;">${this.uploadCode}</div>
                <div style="font-size: 0.9rem; opacity: 0.8;">Enter this code on the upload website</div>
            </div>
        `;
        
        urlContainer.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 1.1rem; margin-bottom: 10px; color: #00ff88;">📱 On your phone:</div>
                <div style="background: rgba(0,255,136,0.1); padding: 15px; border-radius: 10px; margin: 10px 0;">
                    <div style="font-size: 1rem; font-weight: 600;">1. Go to: <span style="color: #00ff88;">tvupload.com</span></div>
                    <div style="font-size: 0.9rem; margin-top: 5px;">2. Enter code: <span style="color: #00ff88; font-family: monospace; font-weight: 600;">${this.uploadCode}</span></div>
                    <div style="font-size: 0.9rem; margin-top: 5px;">3. Upload your photos</div>
                </div>
                <div style="font-size: 0.8rem; opacity: 0.7; margin-top: 10px;">
                    Photos will appear on your TV within 10 seconds
                </div>
            </div>
        `;
        
        // Also create a manual upload area that works with drag-and-drop from phone browsers
        this.createManualUploadArea();
    }

    createManualUploadArea() {
        const container = document.getElementById('qr-code').parentElement;
        
        // Remove existing manual area
        const existing = container.querySelector('.manual-upload-area');
        if (existing) existing.remove();
        
        const manualArea = document.createElement('div');
        manualArea.className = 'manual-upload-area';
        manualArea.innerHTML = `
            <div style="margin-top: 30px; padding: 20px; background: rgba(255,255,255,0.05); border-radius: 15px; border: 2px dashed rgba(255,255,255,0.3);">
                <div style="text-align: center; margin-bottom: 15px;">
                    <div style="font-size: 1.1rem; font-weight: 600; margin-bottom: 5px;">📁 Or Upload Directly:</div>
                    <div style="font-size: 0.9rem; opacity: 0.8;">If you have photos on this device</div>
                </div>
                
                <input type="file" id="manual-phone-input" multiple accept="image/*" style="display: none;">
                
                <div id="manual-upload-zone" style="
                    border: 2px dashed rgba(255,255,255,0.4);
                    padding: 30px 20px;
                    text-align: center;
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                " onmouseover="this.style.borderColor='#00ff88'; this.style.backgroundColor='rgba(0,255,136,0.1)'" 
                   onmouseout="this.style.borderColor='rgba(255,255,255,0.4)'; this.style.backgroundColor='transparent'">
                    <div style="font-size: 1.5rem; margin-bottom: 10px;">📷</div>
                    <div style="font-size: 1rem;">Click to select photos</div>
                    <div style="font-size: 0.8rem; opacity: 0.7; margin-top: 5px;">or drag and drop them here</div>
                </div>
                
                <div id="manual-upload-status" style="margin-top: 15px; text-align: center; display: none;"></div>
            </div>
        `;
        
        container.appendChild(manualArea);
        
        // Bind events for manual upload
        this.bindManualUploadEvents();
    }

    bindManualUploadEvents() {
        const manualInput = document.getElementById('manual-phone-input');
        const uploadZone = document.getElementById('manual-upload-zone');
        const statusDiv = document.getElementById('manual-upload-status');
        
        if (!manualInput || !uploadZone) return;
        
        // Click to select
        uploadZone.addEventListener('click', () => {
            manualInput.click();
        });
        
        // File selection
        manualInput.addEventListener('change', (e) => {
            this.handleManualUpload(Array.from(e.target.files), statusDiv);
        });
        
        // Drag and drop
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = '#00ff88';
            uploadZone.style.backgroundColor = 'rgba(0,255,136,0.1)';
        });
        
        uploadZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = 'rgba(255,255,255,0.4)';
            uploadZone.style.backgroundColor = 'transparent';
        });
        
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = 'rgba(255,255,255,0.4)';
            uploadZone.style.backgroundColor = 'transparent';
            
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            this.handleManualUpload(files, statusDiv);
        });
    }

    async handleManualUpload(files, statusDiv) {
        if (files.length === 0) {
            this.showManualStatus(statusDiv, 'No image files selected', 'error');
            return;
        }
        
        this.showManualStatus(statusDiv, `Processing ${files.length} photo${files.length > 1 ? 's' : ''}...`, 'info');
        
        try {
            const dataUrls = [];
            
            for (let file of files) {
                const dataUrl = await this.fileToDataUrl(file);
                dataUrls.push(dataUrl);
            }
            
            // Add directly to slideshow
            window.slideshow.addPhotos(dataUrls);
            
            this.showManualStatus(statusDiv, `✅ Added ${files.length} photo${files.length > 1 ? 's' : ''} to slideshow!`, 'success');
            
            // Show TV notification
            if (window.tvDashboard && window.tvDashboard.showNotification) {
                window.tvDashboard.showNotification(`📁 Added ${files.length} photos directly!`);
            }
            
            // Reset after success
            setTimeout(() => {
                document.getElementById('manual-phone-input').value = '';
                statusDiv.style.display = 'none';
            }, 3000);
            
        } catch (error) {
            console.error('Manual upload failed:', error);
            this.showManualStatus(statusDiv, 'Upload failed. Please try again.', 'error');
        }
    }

    showManualStatus(statusDiv, message, type) {
        const colors = {
            info: '#00aaff',
            success: '#00ff88',
            error: '#ff6b6b'
        };
        
        statusDiv.style.display = 'block';
        statusDiv.style.color = colors[type] || '#ffffff';
        statusDiv.textContent = message;
    }

    fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    startUploadChecker() {
        // Check for uploads using our upload code
        this.uploadCheckInterval = setInterval(() => {
            this.checkForCodeBasedUploads();
        }, 3000);
    }

    async checkForCodeBasedUploads() {
        try {
            // Check localStorage for uploads with our code
            const uploadKey = `phone_upload_${this.uploadCode}`;
            const uploadData = localStorage.getItem(uploadKey);
            
            if (uploadData) {
                const data = JSON.parse(uploadData);
                if (data.photos && data.photos.length > 0) {
                    // Extract data URLs
                    const dataUrls = data.photos.map(photo => photo.data || photo);
                    
                    // Add to slideshow
                    window.slideshow.addPhotos(dataUrls);
                    
                    // Clear processed uploads
                    localStorage.removeItem(uploadKey);
                    
                    // Show notification
                    if (window.tvDashboard && window.tvDashboard.showNotification) {
                        window.tvDashboard.showNotification(`📱 Received ${data.photos.length} photos with code ${this.uploadCode}!`);
                    }
                    
                    console.log(`Processed ${data.photos.length} photos from code ${this.uploadCode}`);
                    return data.photos.length;
                }
            }
            
            // Also check for direct postMessage from phone browsers
            window.addEventListener('message', (event) => {
                if (event.data.type === 'PHONE_UPLOAD' && event.data.code === this.uploadCode) {
                    const photos = event.data.photos;
                    if (photos && photos.length > 0) {
                        const dataUrls = photos.map(photo => photo.data || photo);
                        window.slideshow.addPhotos(dataUrls);
                        
                        if (window.tvDashboard && window.tvDashboard.showNotification) {
                            window.tvDashboard.showNotification(`📱 Received ${photos.length} photos!`);
                        }
                    }
                }
            });
            
        } catch (error) {
            console.error('Error checking for uploads:', error);
        }
        
        return 0;
    }

    stopServer() {
        if (this.uploadCheckInterval) {
            clearInterval(this.uploadCheckInterval);
        }
        
        this.isRunning = false;
        console.log('Phone upload system stopped');
    }
}

window.phoneServer = new PhoneUploadServer();