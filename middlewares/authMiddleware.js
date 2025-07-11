module.exports = (req, res, next) => {
    const allowedPaths = ['/login', '/register', '/logout']; // Tambahkan /logout

    // Debugging session
    console.log('Session check:', {
        path: req.path,
        userId: req.session?.userId,
        sessionId: req.sessionID,
        sessionExists: !!req.session
    });

    // Jika mencoba akses terproteksi tanpa login
    if (!req.session?.userId && !allowedPaths.includes(req.path)) {
        return res.redirect('/login');
    }

    // Jika sudah login tapi mencoba akses login/register
    if (req.session?.userId && ['/login', '/register'].includes(req.path)) {
        return res.redirect('/');
    }

    next();
};