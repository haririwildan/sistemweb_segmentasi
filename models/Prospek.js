const mongoose = require('mongoose');

const prospekSchema = new mongoose.Schema({
    nama_am: String,
    customer: String,
    pekerjaan: String,
    sales_amount: Number,
    stage: {
        type: String,
        enum: ['Inisiasi', 'SPH', 'Negosiasi', 'BAKN', 'Win']
    },
    portofolio: {
        type: String,
        enum: ['PD', 'PM', 'PS']
    }
}, { timestamps: true });

module.exports = mongoose.model('Prospek', prospekSchema);