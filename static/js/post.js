// Table of Contents logic
class TableOfContents {
    constructor() {
        this.hamburger = document.getElementById('hamburger');
        this.sidebar = document.getElementById('sidebar');
        this.sidebarOverlay = document.getElementById('sidebarOverlay');
        this.tableOfContents = document.getElementById('tableOfContents');
        this.init();
    }
    init() {
        this.generateTOC();
        this.bindEvents();
        this.handleScroll();
    }
    generateTOC() {
        const headings = document.querySelectorAll('.post-content h1, .post-content h2, .post-content h3, .post-content h4, .post-content h5, .post-content h6');
        if (headings.length === 0) {
            this.hamburger.style.display = 'none';
            return;
        }
        headings.forEach((heading, index) => {
            const id = `heading-${index}`;
            heading.id = id;
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = `#${id}`;
            a.textContent = heading.textContent;
            a.className = heading.tagName.toLowerCase();
            a.addEventListener('click', (e) => {
                e.preventDefault();
                const target = document.getElementById(id);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    if (window.innerWidth <= 768) {
                        this.closeSidebar();
                    }
                }
            });
            li.appendChild(a);
            this.tableOfContents.appendChild(li);
        });
    }
    bindEvents() {
        this.hamburger.addEventListener('click', () => this.toggleSidebar());
        this.sidebarOverlay.addEventListener('click', () => this.closeSidebar());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.sidebar.classList.contains('open')) {
                this.closeSidebar();
            }
        });
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            if (scrollTimeout) clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => this.handleScroll(), 100);
        });
    }
    openSidebar() {
        this.sidebar.classList.add('open');
        this.sidebarOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
        this.hamburger.classList.add('hidden');
    }
    closeSidebar() {
        this.sidebar.classList.remove('open');
        this.sidebarOverlay.classList.remove('open');
        document.body.style.overflow = '';
        this.hamburger.classList.remove('hidden');
    }
    toggleSidebar() {
        if (this.sidebar.classList.contains('open')) {
            this.closeSidebar();
        } else {
            this.openSidebar();
        }
    }
    handleScroll() {
        const headings = document.querySelectorAll('.post-content h1, .post-content h2, .post-content h3, .post-content h4, .post-content h5, .post-content h6');
        const tocLinks = document.querySelectorAll('.toc a');
        let currentActiveIndex = -1;
        const scrollTop = window.pageYOffset;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        const isNearBottom = scrollTop + windowHeight >= documentHeight - 100;
        if (isNearBottom && !this.sidebar.classList.contains('open')) {
            this.hamburger.classList.add('hidden');
        } else if (!this.sidebar.classList.contains('open')) {
            this.hamburger.classList.remove('hidden');
        }
        for (let i = headings.length - 1; i >= 0; i--) {
            const heading = headings[i];
            const rect = heading.getBoundingClientRect();
            if (rect.top <= windowHeight * 0.3) {
                currentActiveIndex = i;
                break;
            }
        }
        tocLinks.forEach((link, index) => {
            if (index === currentActiveIndex) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new TableOfContents();
    new window.SearchBarManager({ mode: 'post' });
    if (typeof hljs !== 'undefined') {
        hljs.highlightAll();
    }
});
