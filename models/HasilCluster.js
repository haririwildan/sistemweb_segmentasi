const mongoose = require('mongoose');

const hasilClusterSchema = new mongoose.Schema({
    nama_am: String,
    customer: String,
    pekerjaan: String,
    portofolio: String,
    sales_amount: Number,
    stage: String,
    cluster: Number,
    deskripsi_cluster: String
});

module.exports = mongoose.model('HasilCluster', hasilClusterSchema);
