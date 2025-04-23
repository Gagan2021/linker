import express from 'express';
import { nanoid } from 'nanoid';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from 'redis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const redisClient = createClient({
    url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
});

redisClient.connect()
    .then(() => console.log('Connected to Redis'))
    .catch(err => console.error('Redis connection error:', err));
const app = express();
app.use(express.json());
app.use(express.static('public'));

// Frontend HTML (unchanged)
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
        input, button, select {
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
            <input type="text" id="domainInput" placeholder="Enter domain (e.g., ex.com)">
            <select id="trafficType">
                <option value="organic">Organic Traffic</option>
                <option value="custom_utm">Custom UTM</option>
            </select>
            <input type="text" id="utmInput" placeholder="Enter UTM string (e.g., utm_source=newsletter&utm_medium=email)" style="display: none;">
            <button onclick="shortenUrl()">Shorten URL</button>
        </div>
        <div id="result" class="result">
            <p>Shortened URL: <span id="shortUrl"></span></p>
            <button onclick="copyUrl()">Copy URL</button>
        </div>
    </div>

    <script>
        const trafficTypeSelect = document.getElementById('trafficType');
        const utmInput = document.getElementById('utmInput');

        trafficTypeSelect.addEventListener('change', () => {
            utmInput.style.display = trafficTypeSelect.value === 'custom_utm' ? 'block' : 'none';
        });

        async function shortenUrl() {
            const domain = document.getElementById('domainInput').value;
            const trafficType = document.getElementById('trafficType').value;
            let utmString = '';

            if (trafficType === 'custom_utm') {
                utmString = document.getElementById('utmInput').value;
            }

            if (!domain) return;

            try {
                const response = await fetch('/api/shorten', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ domain, trafficType, utmString })
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

// Random string generator for Google redirect
function generateRandomString(length) {
    const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

// Google redirect link generator
function generateGoogleRedirectLink(targetUrl) {
    const baseUrl = 'https://www.google.com/url';
    const fixedParams = {
        sa: 't',
        source: 'web',
        rct: 'j',
        opi: '89978449',
        url: targetUrl,
        usg: 'AOvVaw3YTuLjBL02hOLrgnxSom7A',
        utm_source: 'google',
        utm_medium: 'organic'
    };

    const randomMiddle = generateRandomString(6);
    const randomLocation = generateRandomString(12);
    const ved = `2ahUKEwj${randomMiddle}l-2MAx${randomLocation}QFnoECCYQAQ`;

    const queryParams = new URLSearchParams({ ...fixedParams, ved }).toString();
    return `${baseUrl}?${queryParams}`;
}

// API Routes
app.post('/api/shorten', async (req, res) => {
    try {
        const { domain, trafficType, utmString } = req.body;
        if (!domain) {
            return res.status(400).json({ error: 'Domain is required' });
        }

        const shortId = nanoid(8);
        const data = {
            domain,
            trafficType,
            utmString: trafficType === 'custom_utm' ? utmString : null
        };
        await redisClient.set(shortId, JSON.stringify(data));

        res.json({ shortId });
    } catch (error) {
        res.status(400).json({ error: 'Invalid input' });
    }
});

// Redirect route with clearing cookies and headers
app.get('/s/:shortId', async (req, res) => {
    try {
        const shortId = req.params.shortId;
        const data = await redisClient.get(shortId);
        if (!data) {
            return res.status(404).send('URL not found');
        }

        const { domain, trafficType, utmString } = JSON.parse(data);
        let targetUrl = `https://${domain}`;

        // Clear cookies
        Object.keys(req.cookies || {}).forEach(cookie => {
            res.clearCookie(cookie);
        });

        // Clear headers
        res.removeHeader('Referer');
        res.removeHeader('Referrer-Policy');

        // Handle redirect based on traffic type
        if (trafficType === 'custom_utm' && utmString) {
            // Parse UTM string and use user-provided values
            const utmParams = new URLSearchParams(utmString);
            targetUrl += `?${utmParams.toString()}`;
            res.redirect(targetUrl);
        } else {
            const googleRedirectUrl = generateGoogleRedirectLink(targetUrl);
            res.redirect(googleRedirectUrl);
        }
    } catch (error) {
        res.status(500).send('Server error');
    }
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
