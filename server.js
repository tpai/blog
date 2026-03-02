const express = require('express');
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const hljs = require('highlight.js');
const Fuse = require('fuse.js');
const cors = require('cors');
const matter = require('gray-matter');

const app = express();
const PORT = process.env.PORT || 3000;
const POSTS_PER_PAGE = 5;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Security configuration
const SECURITY_CONFIG = {
  maxFileSize: 10 * 1024 * 1024, // 10MB max file size
  maxSearchQueryLength: 1000,
  maxPostIdLength: 100,
  allowedTemplates: ['blog', 'post', '404'],
  rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
  rateLimitMaxRequests: 100,
  trustedDirectories: [
    path.join(__dirname, 'posts'),
    path.join(__dirname, 'templates'),
    path.join(__dirname, 'public'),
    path.join(__dirname, 'images')
  ]
};

// Input validation and sanitization utilities
class SecurityUtils {
  // Validate and sanitize file paths to prevent directory traversal
  static validateFilePath(filePath, allowedDir) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path');
    }
    
    // Resolve the path to get absolute path
    const resolvedPath = path.resolve(filePath);
    const resolvedAllowedDir = path.resolve(allowedDir);
    
    // Check if the resolved path is within the allowed directory
    if (!resolvedPath.startsWith(resolvedAllowedDir + path.sep) && resolvedPath !== resolvedAllowedDir) {
      throw new Error('Path traversal attempt detected');
    }
    
    return resolvedPath;
  }
  
  // Sanitize HTML content to prevent XSS
  static sanitizeHtml(html) {
    if (!html || typeof html !== 'string') return '';
    
    return html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }
  
  // Validate template names
  static validateTemplateName(templateName) {
    if (!templateName || typeof templateName !== 'string') {
      throw new Error('Invalid template name');
    }
    
    if (!SECURITY_CONFIG.allowedTemplates.includes(templateName)) {
      throw new Error('Template not allowed');
    }
    
    // Check for path traversal attempts
    if (templateName.includes('..') || templateName.includes('/') || templateName.includes('\\')) {
      throw new Error('Invalid template name format');
    }
    
    return templateName;
  }
  
  // Validate and sanitize search queries
  static validateSearchQuery(query) {
    if (!query) return '';
    if (typeof query !== 'string') return '';
    if (query.length > SECURITY_CONFIG.maxSearchQueryLength) {
      throw new Error('Search query too long');
    }
    
    // Remove potential XSS patterns
    return query.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/javascript:/gi, '')
                .replace(/on\w+\s*=/gi, '')
                .trim();
  }
  
  // Validate post IDs
  static validatePostId(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid post ID');
    }
    
    if (id.length > SECURITY_CONFIG.maxPostIdLength) {
      throw new Error('Post ID too long');
    }
    
    // Only allow alphanumeric characters, hyphens, and underscores
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new Error('Post ID contains invalid characters');
    }
    
    return id;
  }
  
  // Validate pagination parameters
  static validatePagination(page) {
    const pageNum = parseInt(page);
    if (isNaN(pageNum) || pageNum < 1 || pageNum > 10000) {
      return 1; // Default to page 1 for invalid input
    }
    return pageNum;
  }
}

// Rate limiting middleware
const requestCounts = new Map();
const rateLimitMiddleware = (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const windowStart = now - SECURITY_CONFIG.rateLimitWindowMs;
  
  // Clean old entries
  for (const [ip, requests] of requestCounts.entries()) {
    requestCounts.set(ip, requests.filter(timestamp => timestamp > windowStart));
    if (requestCounts.get(ip).length === 0) {
      requestCounts.delete(ip);
    }
  }
  
  // Check current IP
  const clientRequests = requestCounts.get(clientIp) || [];
  
  if (clientRequests.length >= SECURITY_CONFIG.rateLimitMaxRequests) {
    return res.status(429).json({ 
      error: 'Too many requests', 
      retryAfter: Math.ceil(SECURITY_CONFIG.rateLimitWindowMs / 1000) 
    });
  }
  
  clientRequests.push(now);
  requestCounts.set(clientIp, clientRequests);
  
  next();
};

// Security headers middleware
const securityHeadersMiddleware = (req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' cdnjs.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline' cdnjs.cloudflare.com; " +
    "img-src 'self' data:; " +
    "font-src 'self' cdnjs.cloudflare.com; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none';"
  );
  
  next();
};

// Configure Express middleware with security
app.set('trust proxy', true); // For rate limiting with proxies
app.use(securityHeadersMiddleware);
app.use(rateLimitMiddleware);

// Configure CORS with restrictions
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true, // Disable CORS in production
  credentials: false,
  optionsSuccessStatus: 200
}));

// Body parsing with size limits
app.use(express.json({ 
  limit: '1mb',
  strict: true
}));

// Static file serving with security
app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'deny',
  index: false,
  maxAge: '1d',
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

app.use('/static', express.static(path.join(__dirname, 'static'), {
  dotfiles: 'deny',
  index: false,
  maxAge: '1d',
  setHeaders: (res, path) => {
    if (path.endsWith('.css')) {
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day cache for CSS
    }
  }
}));

app.use('/images', express.static(path.join(__dirname, 'images'), {
  dotfiles: 'deny',
  index: false,
  maxAge: '7d'
}));

// Configure marked with security options
marked.setOptions({
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (err) {
        return hljs.highlightAuto(code).value;
      }
    }
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
  gfm: true,
  sanitize: false, // We handle sanitization separately
  smartLists: true,
  smartypants: false // Disable to prevent potential issues
});

// Cache for blog posts and templates
let blogPostsCache = null;
let lastCacheUpdate = 0;
let templateCache = {};

// Template engine
class TemplateEngine {
  static loadTemplate(templateName) {
    try {
      // Validate template name for security
      const validatedName = SecurityUtils.validateTemplateName(templateName);
      
      // In development mode, always reload templates for hot-reloading
      if (process.env.NODE_ENV === 'development') {
        return this._readTemplate(validatedName);
      }
      
      // In production, use cache
      if (!templateCache[validatedName]) {
        templateCache[validatedName] = this._readTemplate(validatedName);
      }
      return templateCache[validatedName];
    } catch (error) {
      console.error(`Security error loading template ${templateName}:`, error.message);
      return '';
    }
  }

  static _readTemplate(templateName) {
    try {
      const templatePath = path.join(__dirname, 'templates', `${templateName}.html`);
      
      // Validate file path for security
      SecurityUtils.validateFilePath(templatePath, path.join(__dirname, 'templates'));
      
      // Check file size
      const stats = fs.statSync(templatePath);
      if (stats.size > SECURITY_CONFIG.maxFileSize) {
        throw new Error('Template file too large');
      }
      
      return fs.readFileSync(templatePath, 'utf8');
    } catch (error) {
      console.error(`Error reading template ${templateName}:`, error.message);
      return '';
    }
  }

  static render(templateName, data = {}) {
    let template = this.loadTemplate(templateName);
    if (!template) return '';
    
    // Sanitize all data values to prevent XSS
    const sanitizedData = {};
    Object.keys(data).forEach(key => {
      if (typeof data[key] === 'string') {
        // Don't sanitize HTML content for specific keys that should contain HTML
        if (key === 'postContent' || key === 'postsList' || key === 'pagination') {
          sanitizedData[key] = data[key]; // Already processed by marked or generated safely
        } else {
          sanitizedData[key] = SecurityUtils.sanitizeHtml(data[key]);
        }
      } else {
        sanitizedData[key] = data[key];
      }
    });
    
    // Simple placeholder replacement
    Object.keys(sanitizedData).forEach(key => {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      template = template.replace(placeholder, sanitizedData[key] || '');
    });
    
    return template;
  }
}

// Blog post manager
class BlogPostManager {
  static getBlogPosts() {
    const now = Date.now();
    if (blogPostsCache && (now - lastCacheUpdate) < CACHE_DURATION) {
      return blogPostsCache;
    }

    const posts = this._loadPostsFromDisk();
    posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    blogPostsCache = posts;
    lastCacheUpdate = now;
    
    return posts;
  }

  static _loadPostsFromDisk() {
    const postsDir = path.join(__dirname, 'posts');
    const posts = [];

    try {
      // Validate posts directory
      SecurityUtils.validateFilePath(postsDir, __dirname);
      
      const files = fs.readdirSync(postsDir);
      const markdownFiles = files.filter(file => {
        // More strict filtering for security
        return file.toLowerCase().endsWith('.md') && 
               file.toLowerCase() !== 'readme.md' && 
               !file.startsWith('.') &&
               !/[<>:"|?*]/.test(file) && // Prevent invalid characters
               file.length <= 255; // Reasonable filename length limit
      });

      markdownFiles.forEach(file => {
        try {
          const post = this._parsePost(file);
          if (post) {
            posts.push(post);
          }
        } catch (error) {
          console.error(`Error processing post ${file}:`, error.message);
        }
      });

      return posts;
    } catch (error) {
      console.error('Error reading blog posts directory:', error.message);
      return [];
    }
  }

  static _parsePost(filename) {
    try {
      const filePath = path.join(__dirname, 'posts', filename);
      
      // Validate file path
      SecurityUtils.validateFilePath(filePath, path.join(__dirname, 'posts'));
      
      const stats = fs.statSync(filePath);
      
      // Check file size
      if (stats.size > SECURITY_CONFIG.maxFileSize) {
        throw new Error(`File ${filename} is too large`);
      }
      
      const fileContent = fs.readFileSync(filePath, 'utf8');
      
      // Parse frontmatter and content
      const parsed = matter(fileContent);
      const content = parsed.content;
      const frontmatter = parsed.data;
      
      // Validate and sanitize frontmatter
      const sanitizedFrontmatter = {};
      if (frontmatter && typeof frontmatter === 'object') {
        Object.keys(frontmatter).forEach(key => {
          if (typeof frontmatter[key] === 'string') {
            sanitizedFrontmatter[key] = SecurityUtils.sanitizeHtml(frontmatter[key]);
          } else {
            sanitizedFrontmatter[key] = frontmatter[key];
          }
        });
      }
      
      // Extract title from first H1 or use filename (sanitized)
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const rawTitle = titleMatch ? titleMatch[1] : path.basename(filename, '.md');
      const title = SecurityUtils.sanitizeHtml(rawTitle);
      
      // Use publishedDate from frontmatter, fallback to file creation time
      const publishedDate = sanitizedFrontmatter.publishedDate 
        ? new Date(sanitizedFrontmatter.publishedDate) 
        : stats.birthtime;
      
      // Clean content for search while preserving meaningful text
      const searchableContent = content
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .replace(/`.*?`/g, '')          // Remove inline code
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Keep link text
        .replace(/[#*]/g, '')           // Remove markdown formatting
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
        .replace(/javascript:/gi, '');  // Remove javascript: URLs
      
      // Create excerpt (sanitized)
      const rawExcerpt = searchableContent.trim().substring(0, 300) + 
        (searchableContent.length > 300 ? '...' : '');
      const excerpt = SecurityUtils.sanitizeHtml(rawExcerpt);
      
      // Generate secure post ID
      const postId = path.basename(filename, path.extname(filename))
        .replace(/[^a-zA-Z0-9_-]/g, '-') // Replace invalid chars with hyphens
        .substring(0, SECURITY_CONFIG.maxPostIdLength);
      
      return {
        id: postId,
        title,
        filename: SecurityUtils.sanitizeHtml(filename),
        content: searchableContent, // For search (already cleaned)
        rawContent: content, // For rendering (will be processed by marked)
        excerpt,
        createdAt: publishedDate,
        publishedDate: sanitizedFrontmatter.publishedDate,
        size: stats.size
      };
    } catch (error) {
      console.error(`Error parsing post ${filename}:`, error.message);
      return null;
    }
  }

  static getPostById(id) {
    try {
      const validatedId = SecurityUtils.validatePostId(id);
      const posts = this.getBlogPosts();
      return posts.find(p => p.id === validatedId);
    } catch (error) {
      console.error('Invalid post ID:', error.message);
      return null;
    }
  }
}

// Search functionality with security
class SearchEngine {
  static getFuseInstance() {
    const posts = BlogPostManager.getBlogPosts();
    const options = {
      keys: [
        { name: 'title', weight: 0.3 },
        { name: 'content', weight: 0.5 }
      ],
      isCaseSensitive: false,
      includeScore: true,
      shouldSort: true,
      includeMatches: true,
      findAllMatches: true,
      minMatchCharLength: 2,
      location: 0,
      threshold: 0.3,
      distance: 100,
      useExtendedSearch: true,
      ignoreLocation: true
    };
    return new Fuse(posts, options);
  }

  static search(query) {
    try {
      const sanitizedQuery = SecurityUtils.validateSearchQuery(query);
      if (!sanitizedQuery) return BlogPostManager.getBlogPosts();
      
      const fuse = this.getFuseInstance();
      const results = fuse.search(sanitizedQuery);
      
      // Sort results by score (lower is better)
      results.sort((a, b) => a.score - b.score);
      
      return results.map(result => ({
        ...result.item,
        score: result.score,
        matches: result.matches
      }));
    } catch (error) {
      console.error('Search error:', error.message);
      return BlogPostManager.getBlogPosts(); // Return all posts on error
    }
  }
}

// Pagination utility with validation
class Pagination {
  static paginate(items, page, itemsPerPage = POSTS_PER_PAGE) {
    const validatedPage = SecurityUtils.validatePagination(page);
    const totalItems = items.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (validatedPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = items.slice(startIndex, endIndex);
    
    return {
      items: paginatedItems,
      currentPage: validatedPage,
      totalPages,
      totalItems,
      itemsPerPage
    };
  }

  static generatePaginationHTML(pagination, searchQuery = '') {
    if (pagination.totalPages <= 1) return '';

    const { currentPage, totalPages } = pagination;
    const sanitizedQuery = SecurityUtils.sanitizeHtml(searchQuery);
    const queryParams = sanitizedQuery ? `search=${encodeURIComponent(sanitizedQuery)}&` : '';
    
    return `
      <div class="pagination">
        ${currentPage > 1 
          ? `<a href="/?${queryParams}page=${currentPage - 1}" class="pagination-btn">←</a>` 
          : '<span class="pagination-btn disabled">←</span>'
        }
        
        <span class="pagination-info">
          ${currentPage}/${totalPages}
        </span>
        
        ${currentPage < totalPages 
          ? `<a href="/?${queryParams}page=${currentPage + 1}" class="pagination-btn">→</a>` 
          : '<span class="pagination-btn disabled">→</span>'
        }
      </div>
    `;
  }
}

// HTML generators
class HTMLGenerator {
  static generateBlogHTML(posts, searchQuery = '', pagination = null) {
    const sanitizedSearchQuery = SecurityUtils.sanitizeHtml(searchQuery);
    
    const postListHTML = posts.length === 0 ? 
      `<div class="no-posts">
        ${sanitizedSearchQuery ? 'No posts found for your search.' : 'No blog posts found.'}
      </div>` : 
      posts.map(post => `
        <article class="post-preview" onclick="window.location.href='/post/${encodeURIComponent(post.id)}'" style="cursor: pointer;">
          <h2>${post.title}</h2>
          <div class="post-meta">
            <span class="date">${new Date(post.createdAt).toLocaleDateString()}</span>
            <span class="filename">${post.filename}</span>
          </div>
          <p class="excerpt">${post.excerpt}</p>
        </article>
      `).join('');

    let searchResults = '';
    if (sanitizedSearchQuery) {
      const totalFound = pagination ? pagination.totalItems : posts.length;
      searchResults = `Search results for "${sanitizedSearchQuery}" (${totalFound} ${totalFound === 1 ? 'post' : 'posts'} found)`;
    }

    const paginationHTML = pagination ? Pagination.generatePaginationHTML(pagination, sanitizedSearchQuery) : '';

    const pageTitle = sanitizedSearchQuery 
      ? `Tony Pai's Blog - Search: ${sanitizedSearchQuery}`
      : "Tony Pai's Blog";

    return TemplateEngine.render('blog', {
      pageTitle: pageTitle,
      searchQuery: sanitizedSearchQuery,
      searchResults: searchResults,
      postsList: postListHTML,
      pagination: paginationHTML,
      totalPosts: pagination ? pagination.totalItems : posts.length
    });
  }

  static generatePostHTML(post) {
    // Process markdown content (marked handles most security concerns)
    const htmlContent = marked(post.rawContent);
    
    return TemplateEngine.render('post', {
      postTitle: post.title,
      postContent: htmlContent,
      createdDate: new Date(post.createdAt).toLocaleDateString(),
      filename: post.filename
    });
  }

  static generate404HTML() {
    return TemplateEngine.render('404');
  }
}

// Routes with input validation
app.get('/', (req, res) => {
  try {
    const search = SecurityUtils.validateSearchQuery(req.query.search || '');
    const page = SecurityUtils.validatePagination(req.query.page || 1);
    
    const filteredPosts = SearchEngine.search(search);
    const pagination = Pagination.paginate(filteredPosts, page);
    
    const html = HTMLGenerator.generateBlogHTML(pagination.items, search, pagination);
    res.send(html);
  } catch (error) {
    console.error('Error in home route:', error.message);
    res.status(400).send(HTMLGenerator.generate404HTML());
  }
});

app.get('/api/posts', (req, res) => {
  try {
    const search = SecurityUtils.validateSearchQuery(req.query.search || '');
    const filteredPosts = SearchEngine.search(search);
    
    // Return metadata only for API (sanitized)
    const postsMetadata = filteredPosts.map(post => ({
      id: post.id,
      title: post.title,
      excerpt: post.excerpt,
      createdAt: post.createdAt,
      filename: post.filename
    }));
    
    res.json(postsMetadata);
  } catch (error) {
    console.error('Error in API posts route:', error.message);
    res.status(400).json({ error: 'Invalid request parameters' });
  }
});

app.get('/post/:id', (req, res) => {
  try {
    const post = BlogPostManager.getPostById(req.params.id);
    
    if (!post) {
      return res.status(404).send(HTMLGenerator.generate404HTML());
    }
    
    const html = HTMLGenerator.generatePostHTML(post);
    res.send(html);
  } catch (error) {
    console.error('Error in post route:', error.message);
    res.status(400).send(HTMLGenerator.generate404HTML());
  }
});

app.get('/api/post/:id', (req, res) => {
  try {
    const post = BlogPostManager.getPostById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    res.json(post);
  } catch (error) {
    console.error('Error in API post route:', error.message);
    res.status(400).json({ error: 'Invalid post ID' });
  }
});

app.get('/search', (req, res) => {
  try {
    const query = SecurityUtils.validateSearchQuery(req.query.q || '');
    const page = SecurityUtils.validatePagination(req.query.page || 1);
    
    if (!query) {
      return res.redirect('/');
    }
    
    const filteredPosts = SearchEngine.search(query);
    const pagination = Pagination.paginate(filteredPosts, page);
    
    const html = HTMLGenerator.generateBlogHTML(pagination.items, query, pagination);
    res.send(html);
  } catch (error) {
    console.error('Error in search route:', error.message);
    res.status(400).send(HTMLGenerator.generate404HTML());
  }
});

// Enhanced error handling middleware
app.use((err, req, res, next) => {
  // Log error details securely (don't expose sensitive info)
  console.error('Server error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
    ip: req.ip
  });
  
  // Don't expose error details in production
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;
    
  res.status(500).json({ error: message });
});

// 404 handler
app.use((req, res) => {
  res.status(404).send(HTMLGenerator.generate404HTML());
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Blog server running at http://localhost:${PORT}`);
  console.log(`📁 Serving markdown files from: ${__dirname}`);
  
  // Log found posts
  const posts = BlogPostManager.getBlogPosts();
  console.log(`📝 Found ${posts.length} blog posts:`);
  posts.forEach(post => {
    console.log(`   • ${post.title} (${post.filename})`);
  });
});
