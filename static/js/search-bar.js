class SearchBarManager {
    constructor({ mode = 'blog', themeClass = 'search-modal-theme' } = {}) {
        this.mode = mode;
        this.hasSearchQuery = window.TEMPLATE_DATA && window.TEMPLATE_DATA.searchQuery !== "";
        this.searchModal = null;
        this.searchInput = null;
        this.lastHighlight = null;
        this.init();
    }

    init() {
        this.createSearchButton();
        this.bindEvents();
    }

    createSearchButton() {
        this.searchButton = document.createElement('button');
        this.searchButton.className = 'search-button';
        this.searchButton.innerHTML = '🔍';
        this.searchButton.setAttribute('aria-label', 'Search');
        document.body.appendChild(this.searchButton);
        this.searchButton.addEventListener('click', () => this.openSearchModal());
    }


    createSearchModal() {
        if (this.searchModal) return;
        const overlay = document.createElement('div');
        overlay.className = 'search-modal-overlay active';
        overlay.style.zIndex = 1300;

        const modal = document.createElement('div');
        modal.className = 'search-modal search-modal-theme';
        modal.style.position = 'fixed';
        modal.style.bottom = '1rem';
        modal.style.left = '50%';
        modal.style.transform = 'translateX(-50%)';
        modal.style.zIndex = 1301;

        const input = document.createElement('input');
        input.type = 'search';
        input.className = 'search-modal-input';
        input.placeholder = this.mode === 'blog' ? 'Search posts...' : 'Find on page...';
        input.setAttribute('aria-label', this.mode === 'blog' ? 'Search posts' : 'Find on page');
        modal.appendChild(input);

        const btn = document.createElement('button');
        btn.className = 'search-modal-btn';
        btn.textContent = this.mode === 'blog' ? 'Search' : 'Find';
        btn.setAttribute('aria-label', this.mode === 'blog' ? 'Search' : 'Find');
        modal.appendChild(btn);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        this.searchModal = overlay;
        this.searchInput = input;

        btn.addEventListener('click', () => this.submitSearch());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.submitSearch();
            if (e.key === 'Escape') this.closeSearchModal();
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.closeSearchModal();
        });
        setTimeout(() => input.focus(), 100);
    }

    openSearchModal() {
        this.createSearchModal();
        this.searchModal.style.display = 'block';
        setTimeout(() => this.searchInput.focus(), 100);
    }

    closeSearchModal() {
        if (this.searchModal) {
            this.searchModal.style.display = 'none';
            this.searchInput.value = '';
            this.clearHighlight();
        }
    }

    submitSearch() {
        const query = this.searchInput.value.trim();
        if (this.mode === 'blog') {
            if (query.length === 0 || query.length >= 2) {
                const searchPath = '/search';
                window.location.href = query ? `${searchPath}?q=${encodeURIComponent(query)}` : '/blog';
            } else {
                this.searchInput.setCustomValidity('Please enter at least 2 characters');
                this.searchInput.reportValidity();
                setTimeout(() => this.searchInput.setCustomValidity(''), 1200);
            }
        } else if (this.mode === 'post') {
            if (!query) {
                this.clearHighlight();
                return;
            }
            
            const postContent = document.querySelector('.post-content');
            if (!postContent) return;

            // If same query and has matches, move to next match
            if (query === this.lastQuery && this.matches && this.matches.length > 0) {
                const nextIndex = (this.currentMatchIndex + 1) % this.matches.length;
                this.navigateToMatch(nextIndex);
                return;
            }

            this.clearHighlight();
            this.lastQuery = query;
            
            // Track all matches for navigation
            this.matches = [];
            this.currentMatchIndex = -1;
            
            // Search in all text content
            const walker = document.createTreeWalker(
                postContent,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: function(node) {
                        return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                    }
                }
            );

            let node;
            while (node = walker.nextNode()) {
                const parent = node.parentElement;
                if (node.textContent.toLowerCase().includes(query.toLowerCase())) {
                    this.matches.push(parent);
                }
            }

            if (this.matches.length > 0) {
                this.navigateToMatch(0);
                if (this.matches.length > 1) {
                    this.showMatchCounter();
                }
            } else {
                this.searchInput.setCustomValidity('No matches found');
                this.searchInput.reportValidity();
                setTimeout(() => this.searchInput.setCustomValidity(''), 1200);
            }
        }
    }

    highlightAndScroll(element) {
        this.clearHighlight();
        element.classList.add('search-highlight');
        this.lastHighlight = element;
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    clearHighlight() {
        const highlights = document.querySelectorAll('.search-highlight');
        highlights.forEach(el => el.classList.remove('search-highlight'));
        this.lastHighlight = null;
        this.removeMatchCounter();
    }

    navigateToMatch(index) {
        if (!this.matches || this.matches.length === 0) return;
        
        this.currentMatchIndex = index;
        this.clearHighlight();
        
        const element = this.matches[index];
        element.classList.add('search-highlight');
        this.lastHighlight = element;
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        if (this.matches.length > 1) {
            this.updateMatchCounter();
        }
    }

    showMatchCounter() {
        if (!this.matchCounter) {
            this.matchCounter = document.createElement('div');
            this.matchCounter.className = 'match-counter';
            
            const prevButton = document.createElement('button');
            prevButton.textContent = '←';
            prevButton.addEventListener('click', () => {
                const newIndex = (this.currentMatchIndex - 1 + this.matches.length) % this.matches.length;
                this.navigateToMatch(newIndex);
            });
            
            const nextButton = document.createElement('button');
            nextButton.textContent = '→';
            nextButton.addEventListener('click', () => {
                const newIndex = (this.currentMatchIndex + 1) % this.matches.length;
                this.navigateToMatch(newIndex);
            });
            
            this.matchCountText = document.createElement('span');
            
            this.matchCounter.appendChild(prevButton);
            this.matchCounter.appendChild(this.matchCountText);
            this.matchCounter.appendChild(nextButton);
            
            this.searchModal.appendChild(this.matchCounter);
        }
        this.updateMatchCounter();
        this.matchCounter.style.display = 'flex';
    }

    updateMatchCounter() {
        if (this.matchCountText) {
            this.matchCountText.textContent = `${this.currentMatchIndex + 1}/${this.matches.length}`;
        }
    }

    removeMatchCounter() {
        if (this.matchCounter) {
            this.matchCounter.style.display = 'none';
        }
    }


    bindEvents() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeSearchModal();
            }
        });

        // Add highlight style for post mode
        if (this.mode === 'post') {
            const style = document.createElement('style');
            style.textContent = `
                .search-highlight { 
                    background: #7d8590; 
                    color: #000;
                    transition: background 0.3s; 
                }
                .match-counter {
                    position: absolute;
                    bottom: -40px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: var(--background-color);
                    padding: 5px 10px;
                    border-radius: 15px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                }
                .match-counter button {
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 0 5px;
                    color: var(--text-color);
                }
                .match-counter button:hover {
                    color: var(--link-color);
                }
            `;
            document.head.appendChild(style);
        }
    }
}
window.SearchBarManager = SearchBarManager;
