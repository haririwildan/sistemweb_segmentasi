require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const layout = require('express-ejs-layouts');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const app = express();

// Koneksi MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Koneksi ke MongoDB berhasil'))
    .catch((err) => console.error(err));

// Session Configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'rahasiaWildan123',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        ttl: 24 * 60 * 60 // 1 hari
    }),
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 1 hari
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    },
    rolling: true
}));

// Setelah session config
app.use((req, res, next) => {
    // Middleware untuk handle session yang tidak valid
    if (req.session && !req.session.regenerate) {
        delete req.session;
    }
    next();
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Share session data ke views
app.use((req, res, next) => {
    res.locals.session = req.session;
    next();
});

// Navigation history
app.use((req, res, next) => {
    if (req.method === 'GET' && req.session) {
        req.session.lastUrl = req.session.currentUrl;
        req.session.currentUrl = req.originalUrl;
    }
    next();
});

// Cache control
app.use((req, res, next) => {
    if (!['/login', '/register'].includes(req.path)) {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    }
    next();
});

// Authentication middleware
const authMiddleware = require('./middlewares/authMiddleware');
app.use(authMiddleware);

// Back navigation handling
const backNavigation = require('./middlewares/backNavigation');
app.use(backNavigation);

// View engine setup
app.set('view engine', 'ejs');
app.use(layout);

// Routes
const authRoutes = require('./routes/authRoutes');
const prospekRoutes = require('./routes/prospekRoutes');
app.use('/', authRoutes);
app.use('/', prospekRoutes);

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).render('error', {
        message: 'Terjadi kesalahan pada server',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// vercel connect
module.exports = app;