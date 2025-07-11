from kmodes.kprototypes import KPrototypes
from sklearn.metrics import silhouette_score
import pandas as pd
import json
import sys
import numpy as np
from pymongo import MongoClient

# Ambil input JSON dari Node.js
input_data = json.load(sys.stdin)
df = pd.DataFrame(input_data)

# Minimal data untuk clustering
if len(df) < 3:
    sys.stderr.write("Error: Minimal 3 data diperlukan.")
    exit()

# Pisahkan fitur numerik dan kategorikal
categorical = ['nama_am', 'customer', 'pekerjaan', 'stage', 'portofolio']
numerical = ['sales_amount']
matrix_encoded = pd.get_dummies(df[categorical])
matrix_all = pd.concat([matrix_encoded, df[numerical]], axis=1)

# Loop k terbaik
max_k = min(6, len(df) - 1)
best_score = -1
best_k = 2
best_labels = None

for k in range(2, max_k + 1):
    try:
        kproto = KPrototypes(n_clusters=k, init='Cao', random_state=42)
        clusters = kproto.fit_predict(df[categorical + numerical].to_numpy(), categorical=[0,1,2,3,4])

        if len(set(clusters)) < 2 or len(set(clusters)) >= len(df):
            continue

        score = silhouette_score(matrix_all, clusters)

        if score > best_score:
            best_score = score
            best_k = k
            best_labels = clusters
    except Exception as e:
        sys.stderr.write(f"Error pada k={k}: {str(e)}\n")
        continue

# Jika gagal semua
if best_labels is None:
    print("Error: Gagal menentukan klaster.")
    exit()

# Tambahkan hasil cluster
df['cluster'] = best_labels

# Mapping deskripsi berdasarkan cluster
cluster_descriptions = {
    0: "Prospek Tinggi",
    1: "Prospek Sedang",
    2: "Prospek Rendah",
    3: "Potensi Lemah",
    4: "Tidak Tertarik",
    5: "Prospek Potensial"
}

df['deskripsi_cluster'] = df['cluster'].map(cluster_descriptions)

result = df.to_dict(orient='records')

# Simpan ke MongoDB
try:
    client = MongoClient("mongodb://localhost:27017/")
    db = client["salesdb"]  # Ganti nama database sesuai yang kamu pakai
    cluster_collection = db["hasil_clusters"]
    meta_collection = db["cluster_metadata"]

    cluster_collection.delete_many({})
    cluster_collection.insert_many(result)

    meta_collection.delete_many({})
    meta_collection.insert_one({
        "silhouette_score": best_score,
        "k_terbaik": best_k
    })

    print("✅ Hasil clustering berhasil disimpan ke MongoDB", file=sys.stderr)

    for r in result:
        r.pop('_id', None)
    
    output = {
        "data": result,
        "silhouette_score": best_score,
        "k_terbaik": best_k
    }
    # Kirim output ke stdout agar Node.js bisa parsing
    print(json.dumps(output))

except Exception as e:
    print(f"❌ Gagal simpan ke MongoDB: {e}", file=sys.stderr)
    exit()