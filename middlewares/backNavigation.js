module.exports = function (req, res, next) {
    if (req.method === 'GET' && req.session) {
        // Jika mencoba kembali ke halaman cluster setelah dari detail
        if (req.url === '/cluster' && req.session.lastUrl.includes('/cluster/')) {
            return res.redirect('/');
        }
    }
    next();
};