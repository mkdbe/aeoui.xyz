'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const geoip   = require('geoip-lite');

const app  = express();
const PORT = 3002;

const ANALYTICS_FILE = path.join(__dirname, 'analytics.json');
const MAX_VISITS     = 10000;

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION — edit these
// ─────────────────────────────────────────────────────────────────────────────
const EXCLUDED_IPS = [
    '38.49.72.41',
];

const BOT_PATTERNS = /googlebot|bingbot|yandex|baidu|semrush|ahrefsbot|curl|wget|python-requests|scrapy|slackbot|pinterest|whatsapp|facebookexternalhit|twitterbot|linkedinbot|discordbot|telegrambot|applebot|duckduckbot|ia_archiver|mj12bot|dotbot|petalbot|bytespider/i;

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function loadAnalytics() {
    if (!fs.existsSync(ANALYTICS_FILE)) {
        fs.writeFileSync(ANALYTICS_FILE, JSON.stringify({ visits: [] }));
    }
    try {
        return JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8'));
    } catch {
        return { visits: [] };
    }
}

function saveAnalytics(data) {
    // Cap at MAX_VISITS to prevent unbounded growth
    if (data.visits.length > MAX_VISITS) {
        data.visits = data.visits.slice(-MAX_VISITS);
    }
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(data));
}

function getIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.connection.remoteAddress || req.ip;
}

function getDeviceType(ua) {
    if (/mobile|android|iphone|ipod/i.test(ua)) return 'mobile';
    if (/ipad|tablet/i.test(ua))                 return 'tablet';
    return 'desktop';
}

function getBrowser(ua) {
    if (/edg\//i.test(ua))     return 'Edge';
    if (/opr\//i.test(ua))     return 'Opera';
    if (/chrome/i.test(ua))    return 'Chrome';
    if (/safari/i.test(ua))    return 'Safari';
    if (/firefox/i.test(ua))   return 'Firefox';
    if (/msie|trident/i.test(ua)) return 'IE';
    return 'Other';
}

function getOS(ua) {
    if (/windows/i.test(ua))  return 'Windows';
    if (/mac os x/i.test(ua)) return 'macOS';
    if (/iphone|ipad/i.test(ua)) return 'iOS';
    if (/android/i.test(ua))  return 'Android';
    if (/linux/i.test(ua))    return 'Linux';
    return 'Other';
}

function getSource(req) {
    const ref = req.headers['referer'] || req.headers['referrer'] || '';
    if (!ref) return 'direct';
    try {
        const host = new URL(ref).hostname.replace('www.', '');
        if (/google/.test(host))   return 'google';
        if (/bing/.test(host))     return 'bing';
        if (/duckduckgo/.test(host)) return 'duckduckgo';
        if (/twitter|x\.com/.test(host)) return 'twitter';
        if (/facebook/.test(host)) return 'facebook';
        if (/instagram/.test(host)) return 'instagram';
        if (/reddit/.test(host))   return 'reddit';
        return host || 'direct';
    } catch {
        return 'direct';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────
function logVisit(req, res, next) {
    // Only log page loads (not media, assets, api calls)
    if (req.path !== '/' && req.path !== '/index.html') return next();

    const ua = req.headers['user-agent'] || '';
    const ip = getIP(req);

    // Skip bots and excluded IPs
    if (BOT_PATTERNS.test(ua))       return next();
    if (EXCLUDED_IPS.includes(ip))   return next();

    const geo      = geoip.lookup(ip) || {};
    const location = [geo.city, geo.country].filter(Boolean).join(', ') || 'Unknown';
    const sessionId = `${ip}-${Date.now()}`;

    const visit = {
        id:        sessionId,
        timestamp: new Date().toISOString(),
        ip,
        location,
        device:    getDeviceType(ua),
        browser:   getBrowser(ua),
        os:        getOS(ua),
        source:    getSource(req),
        ua,
        duration:  0,
        navCount:  0,
    };

    const data = loadAnalytics();
    data.visits.push(visit);
    saveAnalytics(data);

    // Attach session ID to response header so client can reference it
    res.setHeader('X-Session-Id', sessionId);
    next();
}

app.use(logVisit);

// ─────────────────────────────────────────────────────────────────────────────
// API ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// Heartbeat — client calls every 10s to update session duration
app.post('/api/heartbeat', express.json(), (req, res) => {
    const { sessionId, duration } = req.body;
    if (!sessionId) return res.sendStatus(400);

    const data = loadAnalytics();
    const visit = data.visits.find(v => v.id === sessionId);
    if (visit) {
        visit.duration = duration || visit.duration;
        saveAnalytics(data);
    }
    res.sendStatus(200);
});

// Track navigation (recording changes)
app.post('/api/track-nav', express.json(), (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.sendStatus(400);

    const data = loadAnalytics();
    const visit = data.visits.find(v => v.id === sessionId);
    if (visit) {
        visit.navCount = (visit.navCount || 0) + 1;
        saveAnalytics(data);
    }
    res.sendStatus(200);
});

// Analytics data
app.get('/api/analytics', (req, res) => {
    res.json(loadAnalytics());
});

// Analytics dashboard
app.get('/analytics', (req, res) => {
    res.sendFile(path.join(__dirname, 'analytics-dashboard.html'));
});

// ─────────────────────────────────────────────────────────────────────────────
// STATIC FILES — serve everything else
// ─────────────────────────────────────────────────────────────────────────────
app.use(express.static(__dirname, {
    // Don't cache index.html
    setHeaders(res, filePath) {
        if (path.basename(filePath) === 'index.html') {
            res.setHeader('Cache-Control', 'no-cache');
        } else if (/\.(mp3|mp4|ogg|webm|flac)$/i.test(filePath)) {
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
        } else if (/\.(jpg|jpeg|png|webp|gif)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
        }
    }
}));

// Fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`aeoui running on port ${PORT}`);
});
