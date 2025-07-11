const express = require('express');
const router = express.Router();
const prospekController = require('../controllers/prospekController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware);

// Halaman utama
router.get('/', prospekController.index);

// Cluster routes
router.get('/cluster', prospekController.showClusterResult);

router.get('/edit/:id', prospekController.editForm);
router.post('/edit/:id', prospekController.updateProspek);
router.post('/delete/:id', prospekController.deleteProspek);

// Proses cluster
router.post('/cluster', prospekController.cluster);

// ✅ Tambahan baru:
router.get('/input', prospekController.inputForm);
router.post('/input', prospekController.saveProspek);
router.get('/cluster/:id', prospekController.detailCluster);

module.exports = router;