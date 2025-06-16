class TVNavigation {
    constructor() {
        this.focusableElements = [];
        this.currentIndex = 0;
        this.init();
    }

    init() {
        this.updateFocusableElements();
        this.setInitialFocus();
        this.bindEvents();
    }    updateFocusableElements() {
        // Get all visible focusable elements, prioritizing modal elements when modal is open
        const openModal = document.querySelector('.modal:not(.hidden)');
          if (openModal) {
            // If modal is open, only focus elements within the modal
            this.focusableElements = Array.from(
                openModal.querySelectorAll('button, input, select, .upload-area')
            ).filter(el => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden';
            });
        } else {
            // Normal behavior when no modal is open
            this.focusableElements = Array.from(
                document.querySelectorAll('button:not(.hidden), input:not(.hidden), select:not(.hidden), .control-btn')
            ).filter(el => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden';
                // Exclude elements inside hidden modals
            }).filter(el => {
                const parentModal = el.closest('.modal');
                return !parentModal || !parentModal.classList.contains('hidden');
            });
        }
    }

    setInitialFocus() {
        if (this.focusableElements.length > 0) {
            this.currentIndex = 0;
            this.highlightElement(0);
        }
    }

    highlightElement(index) {
        // Remove focus from all elements
        this.focusableElements.forEach(el => {
            el.classList.remove('focused');
        });

        // Add focus to current element
        if (this.focusableElements[index]) {
            this.focusableElements[index].classList.add('focused');
            this.focusableElements[index].focus();
        }
    }    bindEvents() {
        document.addEventListener('keydown', (e) => {
            // Skip if typing in input field (but not if it's file input)
            if (e.target.tagName === 'INPUT' && e.target.type === 'text') {
                return;
            }

            switch(e.keyCode) {
                case 37: // Left Arrow
                case 38: // Up Arrow
                    this.navigate('previous');
                    e.preventDefault();
                    break;
                case 39: // Right Arrow
                case 40: // Down Arrow
                    this.navigate('next');
                    e.preventDefault();
                    break;
                case 13: // Enter/OK
                    this.activate();
                    e.preventDefault();
                    break;
                case 27: // Escape/Back
                case 461: // TV Back button
                    this.handleBack();
                    e.preventDefault();
                    break;
            }
        });
    }

    navigate(direction) {
        if (direction === 'previous') {
            this.currentIndex = Math.max(0, this.currentIndex - 1);
        } else {
            this.currentIndex = Math.min(this.focusableElements.length - 1, this.currentIndex + 1);
        }
        this.highlightElement(this.currentIndex);
    }

    activate() {
        const activeElement = this.focusableElements[this.currentIndex];
        if (activeElement) {
            activeElement.click();
        }
    }

    handleBack() {
        // Close any open modals
        const modals = document.querySelectorAll('.modal:not(.hidden)');
        if (modals.length > 0) {
            modals[0].classList.add('hidden');
            this.refresh();
        }
    }

    refresh() {
        this.updateFocusableElements();
        this.setInitialFocus();
    }
}

// Initialize navigation
window.tvNav = new TVNavigation();