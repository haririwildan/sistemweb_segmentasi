const User = require('../models/User');
const bcrypt = require('bcrypt');

exports.getRegister = (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.render('register', { error: null });
};

exports.postRegister = async (req, res) => {
    const { username, email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
        return res.render('register', { error: 'Konfirmasi password tidak cocok.' });
    }

    try {
        const existingUser = await User.findOne({
            $or: [{ username }, { email }]
        });

        if (existingUser) {
            return res.render('register', { error: 'Username atau email sudah digunakan.' });
        }

        const hashed = await bcrypt.hash(password, 10);
        const user = new User({ username, email, password: hashed });
        await user.save();

        res.redirect('/login');
    } catch (err) {
        console.error('❌ Register Error:', err);
        res.render('register', { error: 'Registrasi gagal. Silakan coba lagi.' });
    }
};

exports.getLogin = (req, res) => {
    // Jika sudah login, redirect ke home
    if (req.session.userId) {
        return res.redirect('/');
    }
    res.set('Cache-Control', 'no-store');
    res.render('login', {
        error: null,
    });
};

exports.postLogin = async (req, res) => {
    const { identifier, password } = req.body;

    try {
        const user = await User.findOne({
            $or: [{ username: identifier }, { email: identifier }]
        });

        if (!user) {
            return res.render('login', {
                error: 'Username atau email tidak ditemukan.',
                identifier // Mengembalikan input identifier ke form
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render('login', {
                error: 'Password salah.',
                identifier // Mengembalikan input identifier ke form
            });
        }

        // Simpan data user di session
        req.session.regenerate((err) => {
            if (err) {
                console.error('Session regeneration error:', err);
                return res.render('login', {
                    error: 'Terjadi kesalahan sistem. Silakan coba lagi.',
                    identifier
                });
            }

            req.session.userId = user._id;
            req.session.user = {
                username: user.username,
                email: user.email,
                // Tambahkan data lain yang diperlukan
                lastLogin: new Date()
            };

            // Simpan session sebelum redirect
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.render('login', {
                        error: 'Terjadi kesalahan sistem. Silakan coba lagi.',
                        identifier
                    });
                }

                // Redirect ke halaman asal atau home
                const redirectTo = req.query.redirect || '/';
                res.redirect(redirectTo);
            });
        });
    } catch (err) {
        console.error('❌ Login Error:', err);
        res.render('login', {
            error: 'Terjadi kesalahan saat login. Silakan coba lagi.',
            identifier
        });
    }
};

exports.logout = (req, res) => {
    // Simpan sessionId sebelum dihapus untuk clear cookie
    const sessionId = req.sessionID;

    // Hancurkan session
    req.session.destroy((err) => {
        if (err) {
            console.error('❌ Logout Error:', err);
            return res.status(500).send('Gagal logout');
        }

        // Clear cookie secara menyeluruh
        res.clearCookie('connect.sid', {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });

        // Hapus juga dari session store (MongoDB)
        const store = req.sessionStore;
        if (store && store.destroy) {
            store.destroy(sessionId, (err) => {
                if (err) console.error('❌ Session store destroy error:', err);
            });
        }

        // Redirect dengan cache busting dan force reload
        res.redirect('/login?_=' + Date.now());
    });
};