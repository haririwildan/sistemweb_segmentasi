const axios = require('axios');
const Prospek = require('../models/Prospek');
const ClusterResult = require('../models/HasilCluster');

exports.index = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    try {
        const totalData = await Prospek.countDocuments();
        const totalPages = Math.ceil(totalData / limit);
        const data = await Prospek.find().skip(skip).limit(limit);

        res.render('index', {
            data,
            currentPage: page,
            totalPages
        });
    } catch (error) {
        res.status(500).send("Terjadi kesalahan saat mengambil data.");
    }
};

exports.cluster = async (req, res) => {
    try {
        const docs = await Prospek.find().sort({ createdAt: 1 });

        if (docs.length < 3) {
            return res.render('result', {
                clusters: [],
                message: `Minimal 3 data diperlukan, baru ada ${docs.length}.`
            });
        }

        const input = docs.map(d => ({
            nama_am: d.nama_am,
            customer: d.customer,
            pekerjaan: d.pekerjaan,
            sales_amount: d.sales_amount,
            stage: d.stage,
            portofolio: d.portofolio
        }));

        // 🔗 Kirim data ke Flask
        const pythonApiUrl = process.env.PYTHON_API_URL;
        const response = await axios.post(pythonApiUrl, { data: input });
        const { data: clusters, silhouette_score, k_terbaik } = response.data;

        if (!Array.isArray(clusters)) {
            throw new Error('Output "data" bukan array');
        }

        await ClusterResult.deleteMany();
        await ClusterResult.insertMany(clusters);

        return processAndRenderClusters(clusters, docs, res, false, silhouette_score, k_terbaik);
    } catch (e) {
        console.error('❌ Gagal cluster:', e.message);
        return res.render('result', {
            clusters: [],
            message: 'Gagal melakukan clustering. Cek koneksi ke Python server.'
        });
    }
};

exports.showClusterResult = async (req, res) => {
    try {
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Vary': '*'
        });

        const results = await ClusterResult.find();
        const docs = await Prospek.find().sort({ createdAt: 1 });

        if (!results.length) {
            return res.redirect('/cluster');
        }

        const clusterGroups = {};
        results.forEach(doc => {
            const key = doc.cluster;
            if (!clusterGroups[key]) {
                clusterGroups[key] = {
                    cluster: doc.cluster,
                    deskripsi: doc.deskripsi_cluster,
                    jumlah: 0,
                    totalSales: 0,
                    stageCounts: {}
                };
            }

            clusterGroups[key].jumlah += 1;
            clusterGroups[key].totalSales += doc.sales_amount;

            const stage = doc.stage;
            clusterGroups[key].stageCounts[stage] = (clusterGroups[key].stageCounts[stage] || 0) + 1;
        });

        const clusters = Object.values(clusterGroups).map(cluster => {
            const stage_dominan = Object.entries(cluster.stageCounts).sort((a, b) => b[1] - a[1])[0][0];
            return {
                cluster: cluster.cluster,
                deskripsi: cluster.deskripsi,
                jumlah: cluster.jumlah,
                rata_rata_sales: cluster.totalSales / cluster.jumlah,
                stage_dominan
            };
        });

        const totalProspek = results.length;

        let autoSummary = `Dari total ${totalProspek} prospek yang dianalisis, sistem membagi mereka ke dalam ${clusters.length} segmen. `;
        clusters.forEach(cluster => {
            autoSummary += `Cluster ${cluster.cluster} merupakan segmen dengan ${cluster.deskripsi.toLowerCase()}, terdiri dari ${cluster.jumlah} prospek, rata-rata sales mencapai Rp ${cluster.rata_rata_sales.toLocaleString()}, dan dominan berada pada tahap ${cluster.stage_dominan}. `;
        });

        const sortedClusters = [...clusters].sort((a, b) => b.rata_rata_sales - a.rata_rata_sales);
        let finalConclusion = `Berdasarkan segmentasi, tim sales dapat memfokuskan upaya lebih besar pada Cluster ${sortedClusters[0].cluster} untuk mempercepat konversi. `;
        if (sortedClusters[1]) {
            finalConclusion += `Cluster ${sortedClusters[1].cluster} bisa ditindaklanjuti dengan strategi nurturing. `;
        }
        if (sortedClusters[2]) {
            finalConclusion += `Cluster ${sortedClusters[2].cluster} memerlukan pendekatan ulang atau evaluasi kelayakan.`;
        }

        res.render('result', {
            title: 'Hasil Segmentasi Prospek',
            clusters: clusters,
            message: null // atau bisa string kosong ""
        });
    } catch (e) {
        console.error('Error showing cluster result:', e);
        res.redirect('/');
    }
};

function processAndRenderClusters(clusters, docs, res, fromDetail = false, silhouetteScore = null, bestK = null) {
    const enriched = clusters.map(c => {
        const match = docs.find(d => d.nama_am === c.nama_am && d.customer === c.customer);
        return {
            cluster: c.cluster,
            label: c.deskripsi_cluster || 'Tanpa Label',
            nama_am: c.nama_am,
            customer: c.customer,
            sales_amount: match?.sales_amount || 0,
            stage: match?.stage || '-',
            portofolio: match?.portofolio || '-'
        };
    });

    const groupedClusters = {};

    enriched.forEach(item => {
        if (!groupedClusters[item.cluster]) {
            groupedClusters[item.cluster] = {
                cluster: item.cluster,
                label: item.label,
                jumlah_pelanggan: 0,
                total_sales: 0,
                stages: [],
                pelanggan: [],
                portofolio: []
            };
        }

        const group = groupedClusters[item.cluster];
        group.jumlah_pelanggan += 1;
        group.total_sales += item.sales_amount;
        group.stages.push(item.stage);
        group.pelanggan.push(item.customer);
        group.portofolio.push(item.portofolio);
    });

    const finalClusters = Object.values(groupedClusters).map(g => {
        const rata_rata_sales = g.total_sales / g.jumlah_pelanggan;

        const tahapan_dominan = g.stages.sort((a, b) =>
            g.stages.filter(s => s === b).length - g.stages.filter(s => s === a).length
        )[0];

        const portofolio_dominan = g.portofolio.sort((a, b) =>
            g.portofolio.filter(p => p === b).length - g.portofolio.filter(p => p === a).length
        )[0];

        let strategi = '-';
        if (g.label === 'Prospek Tinggi') {
            strategi = 'Follow-up prioritas tinggi untuk closing cepat';
        } else if (g.label === 'Prospek Sedang' && rata_rata_sales > 100_000_000) {
            strategi = 'Teruskan nurturing hingga tahap deal';
        } else if (g.label === 'Prospek Rendah') {
            strategi = 'Lakukan promosi berkala';
        } else {
            strategi = 'Evaluasi ulang data pelanggan';
        }

        return {
            cluster: g.cluster,
            label: g.label,
            jumlah_pelanggan: g.jumlah_pelanggan,
            portofolio_dominan,
            rata_rata_sales,
            tahapan_dominan,
            pelanggan: g.pelanggan,
            strategi
        };
    });

    // Buat ringkasan otomatis berdasarkan finalClusters
    const totalProspek = finalClusters.reduce((acc, c) => acc + c.jumlah_pelanggan, 0);
    // Tambahkan final conclusion berdasarkan urutan rata-rata sales
    const sorted = [...finalClusters].sort((a, b) => b.rata_rata_sales - a.rata_rata_sales);

    let finalConclusion = `Berdasarkan segmentasi, tim sales dapat memfokuskan upaya lebih besar pada Cluster ${sorted[0].cluster} untuk mempercepat konversi. `;
    if (sorted[1]) {
        finalConclusion += `Cluster ${sorted[1].cluster} bisa ditindaklanjuti dengan strategi nurturing. `;
    }
    if (sorted[2]) {
        finalConclusion += `Cluster ${sorted[2].cluster} memerlukan pendekatan ulang atau evaluasi kelayakan.`;
    }

    let autoSummary = `Dari total ${totalProspek} prospek, dibagi ke dalam ${finalClusters.length} cluster. `;
    finalClusters.forEach(c => {
        autoSummary += `Cluster ${c.cluster} berisi ${c.jumlah_pelanggan} pelanggan, dominan portofolio ${c.portofolio_dominan}, rata-rata sales Rp ${Math.round(c.rata_rata_sales).toLocaleString()}, tahapan ${c.tahapan_dominan}. `;
    });

    return res.render('result', {
        clusters: finalClusters,
        message: null,
        fromDetail,
        silhouetteScore,
        bestK,
        autoSummary,
        finalConclusion
    });

}

exports.inputForm = (req, res) => {
    // Middleware sudah menangani autentikasi
    res.render('input', {
        user: req.session.user // Jika perlu data user di form input
    });
};

exports.saveProspek = async (req, res) => {
    try {
        const newData = new Prospek({
            nama_am: req.body.nama_am,
            customer: req.body.customer,
            pekerjaan: req.body.pekerjaan,
            portofolio: req.body.portofolio,
            sales_amount: req.body.sales_amount,
            stage: req.body.stage
        });

        await newData.save();

        res.redirect('/');
    } catch (err) {
        console.error("❌ Gagal menyimpan prospek:", err);
        res.render('input', {
            message: 'Gagal menyimpan data. Coba lagi.'
        });
    }
};

exports.detailCluster = async (req, res) => {
    try {
        const clusterId = parseInt(req.params.id);
        if (isNaN(clusterId)) {
            return res.status(400).render('result', {
                clusters: [],
                message: 'ID cluster tidak valid.'
            });
        }

        // Ambil semua data hasil clustering dari database berdasarkan ID cluster
        const clusterMembers = await ClusterResult.find({ cluster: clusterId });

        if (!clusterMembers.length) {
            return res.render('result', {
                clusters: [],
                message: `Tidak ditemukan data untuk cluster ID ${clusterId}.`
            });
        }

        // Hitung ringkasan
        const totalSales = clusterMembers.reduce((sum, item) => sum + parseFloat(item.sales_amount || 0), 0);
        const avgSales = totalSales / clusterMembers.length;
        const dominanStage = getMostFrequent(clusterMembers.map(m => m.stage));
        const dominanPortofolio = getMostFrequent(clusterMembers.map(m => m.portofolio));
        const deskripsiCluster = clusterMembers[0].deskripsi_cluster || '-';
        const strategi = clusterMembers[0].strategi || '-';

        res.render('cluster-detail', {
            clusterId,
            members: clusterMembers,
            summary: {
                jumlah: clusterMembers.length,
                rataRataSales: avgSales.toFixed(2),
                stageDominan: dominanStage,
                portofolioDominan: dominanPortofolio,
                deskripsi: deskripsiCluster,
                strategi
            },
            label: deskripsiCluster, // ✅ Tambahkan ini
            pelanggan: clusterMembers, // ✅ Tambahkan ini juga
            message: null
        });
    } catch (err) {
        console.error('❌ Gagal mengambil detail cluster:', err);
        res.status(500).render('result', {
            clusters: [],
            message: 'Terjadi kesalahan saat memuat detail cluster.'
        });
    }
};

// Fungsi bantu: Menghitung item yang paling sering muncul
function getMostFrequent(arr) {
    return arr.reduce((acc, curr) => {
        acc.freq[curr] = (acc.freq[curr] || 0) + 1;
        if (acc.freq[curr] > acc.maxFreq) {
            acc.maxFreq = acc.freq[curr];
            acc.value = curr;
        }
        return acc;
    }, { freq: {}, maxFreq: 0, value: '-' }).value;
}

exports.editForm = async (req, res) => {
    try {
        const data = await Prospek.findById(req.params.id);
        if (!data) {
            return res.status(404).send('Data tidak ditemukan');
        }

        res.render('edit', { data });
    } catch (err) {
        console.error('❌ Gagal menampilkan form edit:', err);
        res.status(500).send('Terjadi kesalahan server.');
    }
};

exports.updateProspek = async (req, res) => {
    try {
        await Prospek.findByIdAndUpdate(req.params.id, {
            nama_am: req.body.nama_am,
            customer: req.body.customer,
            pekerjaan: req.body.pekerjaan,
            portofolio: req.body.portofolio,
            sales_amount: req.body.sales_amount,
            stage: req.body.stage
        });

        res.redirect('/');
    } catch (err) {
        console.error("❌ Gagal update prospek:", err);
        res.status(500).send("Gagal memperbarui data.");
    }
};

exports.deleteProspek = async (req, res) => {
    try {
        await Prospek.findByIdAndDelete(req.params.id);

        // Hapus hasil cluster karena data prospek berubah
        await ClusterResult.deleteMany();
        console.log("♻️  Cache cluster dihapus karena data berubah.");

        res.redirect('/');
    } catch (err) {
        console.error("❌ Gagal menghapus prospek:", err);
        res.status(500).send("Gagal menghapus data.");
    }
};