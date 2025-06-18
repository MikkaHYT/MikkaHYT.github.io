const socket = io();
        let currentUserID = null;

        // Auto-initialize when page loads
        document.addEventListener('DOMContentLoaded', async () => {
            await initializeUser();
        });

        async function initializeUser() {
            updateLoadingStatus('Checking for existing user ID...');
            
            // Check if user ID already exists in localStorage
            const savedUserID = localStorage.getItem('tv_user_id');
            
            if (savedUserID) {
                updateLoadingStatus('Verifying existing user ID...');
                
                // Verify the saved user ID is still valid
                const isValid = await verifyUserID(savedUserID);
                
                if (isValid) {
                    currentUserID = parseInt(savedUserID);
                    showDashboard();
                    return;
                } else {
                    // Remove invalid user ID
                    localStorage.removeItem('tv_user_id');
                }
            }
            
            // Request new user ID from server
            updateLoadingStatus('Requesting new user ID...');
            await requestNewUserID();
        }

        async function requestNewUserID() {
            try {
                const response = await fetch('/request-user-id', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include'
                });

                const data = await response.json();

                if (data.success) {
                    currentUserID = data.user_id;
                    localStorage.setItem('tv_user_id', currentUserID);
                    updateLoadingStatus(`User ID ${currentUserID} assigned!`);
                    
                    setTimeout(() => {
                        showDashboard();
                    }, 1000);
                } else {
                    updateLoadingStatus('Failed to get user ID: ' + data.error);
                    setTimeout(requestNewUserID, 3000); // Retry after 3 seconds
                }
            } catch (error) {
                console.error('Error requesting user ID:', error);
                updateLoadingStatus('Network error. Retrying...');
                setTimeout(requestNewUserID, 3000); // Retry after 3 seconds
            }
        }

        async function verifyUserID(userID) {
            try {
                const response = await fetch('/verify-user-id', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ user_id: userID }),
                    credentials: 'include'
                });

                const data = await response.json();
                return data.valid;
            } catch (error) {
                console.error('Error verifying user ID:', error);
                return false;
            }
        }

        function updateLoadingStatus(message) {
            document.getElementById('loading-status').textContent = message;
        }

        function showDashboard() {
            document.getElementById('loading-screen').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';
            document.getElementById('current-user').textContent = `User ID: ${currentUserID}`;
            
            // Initialize services after user ID is set
            if (window.spotifyService) {
                window.spotifyService.updateUser(currentUserID);
            }
            
            // Initialize other services...
            initializeAllServices();
        }

        function resetUserID() {
            if (confirm('Are you sure you want to reset your User ID? This will disconnect all services.')) {
                localStorage.removeItem('tv_user_id');
                currentUserID = null;
                
                // Clear all services
                if (window.spotifyService) {
                    window.spotifyService.clearUser();
                }
                
                // Reload page to get new ID
                location.reload();
            }
        }
