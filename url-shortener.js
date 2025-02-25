import express from 'express';
import { nanoid } from 'nanoid';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In-memory storage
const urlStorage = new Map();

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Serve the HTML frontend
const html = `
<!DOCTYPE html>
<html>
<head>
    <title>URL Shortener</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            max-width: 800px;
            margin: 2rem auto;
            padding: 0 1rem;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        input, button {
            width: 100%;
            padding: 0.75rem;
            margin: 0.5rem 0;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        button {
            background: #0070f3;
            color: white;
            border: none;
            cursor: pointer;
        }
        button:hover {
            background: #0051cc;
        }
        .result {
            margin-top: 1rem;
            padding: 1rem;
            background: #f0f9ff;
            border-radius: 4px;
            display: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>URL Shortener</h1>
        <div>
            <input type="url" id="urlInput" placeholder="Enter your URL with parameters...">
            <button onclick="shortenUrl()">Shorten URL</button>
        </div>
        <div id="result" class="result">
            <p>Shortened URL: <span id="shortUrl"></span></p>
            <button onclick="copyUrl()">Copy URL</button>
        </div>
    </div>

    <script>
        async function shortenUrl() {
            const longUrl = document.getElementById('urlInput').value;
            if (!longUrl) return;

            try {
                const response = await fetch('/api/shorten', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: longUrl })
                });
                const data = await response.json();
                
                const shortUrl = \`\${window.location.origin}/s/\${data.shortId}\`;
                document.getElementById('shortUrl').textContent = shortUrl;
                document.getElementById('result').style.display = 'block';
            } catch (error) {
                alert('Error shortening URL');
            }
        }

        async function copyUrl() {
            const shortUrl = document.getElementById('shortUrl').textContent;
            await navigator.clipboard.writeText(shortUrl);
            alert('URL copied to clipboard!');
        }
    </script>
</body>
</html>
`;

// API Routes
app.post('/api/shorten', (req, res) => {
    try {
        const longUrl = req.body.url;
        if (!longUrl) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Parse URL and extract parameters
        const urlObj = new URL(longUrl);
        const parameters = {};
        urlObj.searchParams.forEach((value, key) => {
            parameters[key] = value;
        });

        // Generate short ID and store URL data
        const shortId = nanoid(8);
        urlStorage.set(shortId, {
            longUrl: urlObj.origin + urlObj.pathname,
            parameters
        });

        res.json({ shortId });
    } catch (error) {
        res.status(400).json({ error: 'Invalid URL' });
    }
});

// Redirect route
app.get('/s/:shortId', (req, res) => {
    const urlData = urlStorage.get(req.params.shortId);
    if (!urlData) {
        return res.status(404).send('URL not found');
    }

    // Clear all cookies
    Object.keys(req.cookies || {}).forEach(cookie => {
        res.clearCookie(cookie);
    });

    // Construct URL with stored parameters
    const url = new URL(urlData.longUrl);
    Object.entries(urlData.parameters).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });

    // Set headers for GA4 organic search simulation
    res.setHeader('Referrer-Policy', 'unsafe-url');
    res.setHeader('Referer', 'https://www.google.com/search');

    res.redirect(url.toString());
});

// Serve frontend
app.get('/', (req, res) => {
    res.send(html);
});

// Start server
const port = process.env.PORT || 3000;

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
});
