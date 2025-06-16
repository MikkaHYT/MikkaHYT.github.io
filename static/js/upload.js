class PhotoUpload {
    constructor() {
        this.maxFileSize = 10 * 1024 * 1024; // 10MB for better phone compatibility
        this.allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        this.phoneServerActive = false;
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        const uploadConfirm = document.getElementById('upload-confirm');
        const phoneUploadBtn = document.getElementById('phone-upload-btn');


        // Phone upload
        phoneUploadBtn.addEventListener('click', () => {
            this.togglePhoneUpload();
        });


        uploadConfirm.addEventListener('click', () => {
            this.confirmUpload();
        });
    }

    async togglePhoneUpload() {
        const phoneUploadBtn = document.getElementById('phone-upload-btn');
        const phoneUploadSection = document.getElementById('phone-upload-section');

        if (!this.phoneServerActive) {
            // Start phone upload server
            phoneUploadBtn.textContent = 'Starting...';
            phoneUploadBtn.disabled = true;

            try {
                const serverUrl = await window.phoneServer.startServer();
                if (serverUrl) {
                    this.phoneServerActive = true;
                    phoneUploadBtn.textContent = '📱 Stop Phone Upload';
                    phoneUploadBtn.disabled = false;
                    phoneUploadSection.style.display = 'block';
                    
                    // Add some breathing room
                    setTimeout(() => {
                        phoneUploadSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }, 500);
                } else {
                    throw new Error('Failed to start server');
                }
            } catch (error) {
                console.error('Failed to start phone server:', error);
                phoneUploadBtn.textContent = '📱 Upload from Phone (Failed)';
                phoneUploadBtn.disabled = false;
                this.showUploadStatus('Failed to start phone upload server', 'error');
            }
        } else {
            // Stop phone upload server
            window.phoneServer.stopServer();
            this.phoneServerActive = false;
            phoneUploadBtn.textContent = '📱 Upload from Phone';
            phoneUploadSection.style.display = 'none';
        }
    }

    handleFiles(files) {
        const validFiles = [];
        
        for (let file of files) {
            if (this.validateFile(file)) {
                validFiles.push(file);
            }
        }

        if (validFiles.length > 0) {
            this.previewFiles(validFiles);
        } else {
            this.showUploadStatus('No valid image files selected. Please select JPEG, PNG, GIF, or WebP files under 10MB.', 'error');
        }
    }

    validateFile(file) {
        if (!this.allowedTypes.includes(file.type.toLowerCase())) {
            console.warn(`Invalid file type: ${file.type}`);
            return false;
        }

        if (file.size > this.maxFileSize) {
            console.warn(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB`);
            return false;
        }

        return true;
    }

    previewFiles(files) {
        const uploadArea = document.getElementById('upload-area');
        uploadArea.innerHTML = `
            <div style="color: #00ff88; font-size: 1.2rem; margin-bottom: 10px;">✅ ${files.length} photo${files.length > 1 ? 's' : ''} selected</div>
            <div style="font-size: 0.9rem; opacity: 0.8;">Ready to upload to slideshow</div>
        `;
        
        this.selectedFiles = files;
        
        // Enable upload button
        const uploadBtn = document.getElementById('upload-confirm');
        uploadBtn.disabled = false;
        uploadBtn.textContent = `Upload ${files.length} Photo${files.length > 1 ? 's' : ''}`;
    }

    async confirmUpload() {
        if (!this.selectedFiles || this.selectedFiles.length === 0) {
            this.showUploadStatus('No files selected', 'error');
            return;
        }

        const uploadArea = document.getElementById('upload-area');
        const uploadBtn = document.getElementById('upload-confirm');
        
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Processing...';
        uploadArea.innerHTML = '<div style="font-size: 1.1rem;">📤 Processing photos...</div>';

        try {
            const dataUrls = [];
            
            for (let i = 0; i < this.selectedFiles.length; i++) {
                const file = this.selectedFiles[i];
                uploadArea.innerHTML = `
                    <div style="font-size: 1.1rem; margin-bottom: 10px;">📤 Processing photo ${i + 1}/${this.selectedFiles.length}</div>
                    <div style="font-size: 0.9rem; opacity: 0.8;">${file.name}</div>
                `;
                
                const dataUrl = await this.fileToDataUrl(file);
                dataUrls.push(dataUrl);
            }

            // Add to slideshow
            window.slideshow.addPhotos(dataUrls);
            
            // Show success
            uploadArea.innerHTML = `
                <div style="color: #00ff88; font-size: 1.2rem; margin-bottom: 10px;">✅ Upload Complete!</div>
                <div style="font-size: 0.9rem; opacity: 0.8;">Added ${dataUrls.length} photo${dataUrls.length > 1 ? 's' : ''} to slideshow</div>
            `;
            uploadBtn.textContent = 'Upload Another';
            
            // Reset after delay
            setTimeout(() => {
                this.resetUploadArea();
            }, 3000);

        } catch (error) {
            console.error('Upload failed:', error);
            this.showUploadStatus('Upload failed. Please try again.', 'error');
            uploadBtn.disabled = false;
            uploadBtn.textContent = 'Try Again';
        }
    }

    fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    resetUploadArea() {
        const uploadBtn = document.getElementById('upload-confirm');
        

        this.selectedFiles = null;
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Select Photos First';
    }

    showUploadStatus(message, type) {
        const uploadArea = document.getElementById('upload-area');
        const color = type === 'error' ? '#ff6b6b' : '#00ff88';
        const icon = type === 'error' ? '❌' : '✅';
        
        uploadArea.innerHTML = `
            <div style="color: ${color}; font-size: 1.1rem; margin-bottom: 10px;">${icon} ${message}</div>
        `;
        
        // Reset after delay for errors
        if (type === 'error') {
            setTimeout(() => {
                this.resetUploadArea();
            }, 3000);
        }
    }

    showModal() {
        const modal = document.getElementById('upload-modal');
        
        // Reset modal state
        this.resetUploadArea();
        
        // Stop any running phone server when modal opens
        if (this.phoneServerActive) {
            this.togglePhoneUpload();
        }
        
        modal.classList.remove('hidden');
        window.tvNav.refresh();
    }

    hideModal() {
        const modal = document.getElementById('upload-modal');
        
        // Stop phone server when modal closes
        if (this.phoneServerActive) {
            window.phoneServer.stopServer();
            this.phoneServerActive = false;
        }
        
        modal.classList.add('hidden');
        window.tvNav.refresh();
    }
}

window.photoUpload = new PhotoUpload();