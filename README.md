# Static Blog Server

A simple static blog server built with Node.js that serves markdown files as blog posts with GitHub-style dark mode syntax highlighting, fuzzy search, and automatic sorting by creation date.

## Features

- 📝 **Markdown Support**: Automatically converts `.md` files to HTML with GitHub Flavored Markdown
- 🌙 **Dark Mode**: GitHub dark theme with syntax highlighting
- 🔍 **Fuzzy Search**: Real-time search through post titles, content, and excerpts
- 📅 **Auto-Sorting**: Posts sorted by creation date (newest first)
- 🖼️ **Image Support**: Serves images from the `images/` directory
- 📱 **Responsive**: Mobile-friendly design
- ⚡ **Fast**: Template caching and post caching for better performance
- 🎨 **Modular**: Separated HTML templates for easy customization

## Directory Structure

```
blog/
├── server.js          # Main server file
├── package.json       # Dependencies
├── posts/             # Markdown blog posts
│   ├── My-Recipes.md
│   └── Local-LLM-benchmark.md
├── images/            # Static images
├── templates/         # HTML templates
│   ├── blog.html      # Main blog page template
│   ├── post.html      # Individual post template
│   └── 404.html       # 404 error page template
└── README.md          # This file
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:

   **For development (with hot-reloading):**
   ```bash
   npm run dev
   ```

   **For production:**
   ```bash
   npm start
   ```

3. Open your browser and go to `http://localhost:3000`

## Development

### Hot-Reloading

The development server includes hot-reloading functionality using nodemon:

- Automatically restarts the server when you change `server.js`
- Reloads templates without caching when you modify files in `templates/`
- Detects new or modified markdown files in `posts/`
- 1-second delay to avoid rapid restarts during file saves

**Files watched for changes:**
- `server.js` - Server code changes
- `templates/*.html` - Template modifications
- `posts/*.md` - Blog post updates

**To start development mode:**
```bash
npm run dev
```

The server will display restart notifications and automatically pick up your changes.

## Usage

### Adding New Blog Posts

1. Create a new `.md` file in the `posts/` directory
2. Add your content using standard Markdown syntax
3. The title will be automatically extracted from the first `# Heading` in the file
4. The server will automatically pick up the new post (may take up to 5 minutes due to caching)

### Adding Images

1. Place image files in the `images/` directory
2. Reference them in your markdown files using:
```markdown
![Alt text](/images/your-image.png)
```

### Search Functionality

- Use the search box on the main page
- Search works across post titles, content, and excerpts
- Results are fuzzy-matched, so typos are forgiven
- Real-time search triggers after typing (with a 500ms delay)

## API Endpoints

The server also provides JSON API endpoints:

- `GET /api/posts` - Get all posts metadata
- `GET /api/posts?search=query` - Search posts
- `GET /api/post/:id` - Get individual post content

## Template Customization

The HTML templates are located in the `templates/` directory:

- `blog.html` - Main blog listing page
- `post.html` - Individual post display
- `404.html` - Error page

Templates use simple `{{placeholder}}` syntax for variable substitution.

## Configuration

You can customize the server by modifying these variables in `server.js`:

- `PORT` - Server port (default: 3000)
- `CACHE_DURATION` - How long to cache posts in memory (default: 5 minutes)

## Features in Detail

### Markdown Processing
- GitHub Flavored Markdown support
- Syntax highlighting for code blocks
- Automatic line breaks
- Tables, lists, blockquotes, and more

### Search
- Powered by Fuse.js for fuzzy matching
- Searches through titles, content, and excerpts
- Configurable search threshold and scoring

### Performance
- Template caching to avoid re-reading files
- Post metadata caching with configurable duration
- Static file serving for images and assets

### Responsive Design
- Mobile-first responsive design
- Dark theme optimized for readability
- Clean, GitHub-inspired styling

## Development

To modify the templates or add new features:

1. Edit the HTML templates in `templates/`
2. Modify the server logic in `server.js`
3. The server will automatically pick up template changes
4. For server changes, restart with `npm start`

## Dependencies

- **express** - Web framework
- **marked** - Markdown parser
- **highlight.js** - Syntax highlighting
- **fuse.js** - Fuzzy search
- **cors** - Cross-origin resource sharing

## License

MIT License - feel free to use and modify as needed.
