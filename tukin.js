// ==========================================
// MODUL KINERJA & TUKIN (TAHAP 4, 6, 7)
// ==========================================

let matrikTargets = [];
let matrikRealisasi = [];
let currentMatrikJabatan = "";

async function initMatrikView() {
    // Tampilkan filter pamong hanya jika admin
    const filterWrapper = document.getElementById("filter-pamong-wrapper");
    const selectPamong = document.getElementById("matrik-pamong");
    
    if (isCurrentUserAdmin()) {
        filterWrapper.style.display = "block";
        selectPamong.innerHTML = '<option value="">-- Semua / Pilih Pamong --</option>';
        employees.forEach(emp => {
            if (emp.role !== 'admin') {
                selectPamong.innerHTML += `<option value="${emp.id}">${emp.name} (${emp.department})</option>`;
            }
        });
    } else {
        filterWrapper.style.display = "none";
    }

    // Default bulan ini
    const d = new Date();
    document.getElementById("matrik-tahun").value = d.getFullYear().toString();
    document.getElementById("matrik-bulan").value = (d.getMonth() + 1).toString();
    
    await loadMatrikData();
}

async function loadMatrikData() {
    const contentArea = document.getElementById("matrik-content-area");
    contentArea.innerHTML = '<div style="text-align: center; padding: 2rem;">Memuat data...</div>';
    
    let empId = currentEmployeeId;
    if (isCurrentUserAdmin()) {
        const selected = document.getElementById("matrik-pamong").value;
        if (selected) empId = selected;
    }
    
    const emp = employees.find(e => e.id === empId);
    if (!emp) {
        contentArea.innerHTML = '<div style="text-align: center; padding: 2rem;">Silakan pilih akun pamong.</div>';
        return;
    }

    const tahun = parseInt(document.getElementById("matrik-tahun").value);
    const bulan = parseInt(document.getElementById("matrik-bulan").value);
    
    currentMatrikJabatan = emp.department; // Menggunakan departemen sebagai jabatan (Carik, Danarta, dll)
    if(currentMatrikJabatan.toLowerCase() === 'kemasyarakatan') currentMatrikJabatan = 'Kamituwa'; // Koreksi mapping jabatan

    try {
        // 1. Fetch Target
        const { data: targets, error: errTarget } = await supabaseClient
            .from('matrik_target')
            .select('*')
            .ilike('jabatan', `%${currentMatrikJabatan}%`)
            .order('nomor_kegiatan', { ascending: true });
            
        if (errTarget) throw errTarget;
        
        // 2. Fetch Realisasi
        const { data: realisasi, error: errReal } = await supabaseClient
            .from('matrik_realisasi')
            .select('*')
            .eq('employee_id', emp.id)
            .eq('periode_bulan', bulan)
            .eq('periode_tahun', tahun);
            
        if (errReal) throw errReal;
        
        matrikTargets = targets || [];
        matrikRealisasi = realisasi || [];
        
        renderMatrikTable(emp, bulan, tahun);
        
    } catch (e) {
        console.error(e);
        contentArea.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--danger);">Gagal memuat data matrik.</div>';
    }
}

function renderMatrikTable(emp, bulan, tahun) {
    const contentArea = document.getElementById("matrik-content-area");
    const bulanStr = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'][bulan-1];
    const monthKey = `target_${bulanStr.toLowerCase()}`;
    
    if (matrikTargets.length === 0) {
        contentArea.innerHTML = `<div style="text-align: center; padding: 2rem;">Data target belum tersedia untuk jabatan ${currentMatrikJabatan}.</div>`;
        return;
    }

    let totalTargetBulan = 0;
    let totalRealisasiBulan = 0;

    let html = `
        <div style="margin-bottom: 1rem;">
            <h3 style="color: white; margin-bottom: 0.5rem;">Matrik Kinerja: ${emp.name} (${currentMatrikJabatan})</h3>
            <p style="color: var(--text-secondary); font-size: 0.85rem;">Periode: ${bulanStr} ${tahun}</p>
        </div>
        <div class="table-container">
            <table class="table" style="min-width: 900px;">
                <thead>
                    <tr>
                        <th width="5%">No</th>
                        <th width="35%">Rencana Kegiatan</th>
                        <th width="8%">Target<br>Bulan Ini</th>
                        <th width="10%">Satuan</th>
                        <th width="10%">Realisasi</th>
                        <th width="10%">Capaian %</th>
                        <th width="22%">Bukti / Aksi</th>
                    </tr>
                </thead>
                <tbody>
    `;

    matrikTargets.forEach((t, i) => {
        // Find mapped realisasi
        const real = matrikRealisasi.find(r => r.matrik_target_id === t.id);
        const realisasiVal = real ? real.realisasi : 0;
        
        let targetBulan = 0;
        if(bulan === 1) targetBulan = t.target_jan;
        else if(bulan === 2) targetBulan = t.target_feb;
        else if(bulan === 3) targetBulan = t.target_mar;
        else if(bulan === 4) targetBulan = t.target_apr;
        else if(bulan === 5) targetBulan = t.target_mei;
        else if(bulan === 6) targetBulan = t.target_jun;
        else if(bulan === 7) targetBulan = t.target_jul;
        else if(bulan === 8) targetBulan = t.target_ags;
        else if(bulan === 9) targetBulan = t.target_sep;
        else if(bulan === 10) targetBulan = t.target_okt;
        else if(bulan === 11) targetBulan = t.target_nov;
        else if(bulan === 12) targetBulan = t.target_des;
        
        targetBulan = targetBulan || 0;
        
        // Accumulate for total capaian
        totalTargetBulan += targetBulan;
        totalRealisasiBulan += (realisasiVal > targetBulan ? targetBulan : realisasiVal); // Cap at target for percentage calculation
        
        let capaianPersen = targetBulan > 0 ? ((realisasiVal / targetBulan) * 100).toFixed(1) : (realisasiVal > 0 ? 100 : 0);
        
        // Input controls
        const inputHtml = `<input type="number" min="0" max="${targetBulan}" class="form-input" id="realisasi_${t.id}" value="${realisasiVal}" style="padding: 0.3rem; width: 60px; text-align: center;">`;
        const actionHtml = `
            <div style="display: flex; gap: 0.5rem; align-items: center;">
                <input type="file" id="bukti_${t.id}" accept="image/*,.pdf" style="width: 90px; font-size: 0.7rem;">
                <button class="btn btn-primary" onclick="simpanRealisasi('${t.id}', '${emp.id}', ${bulan}, ${tahun})" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;">Simpan</button>
            </div>
            ${real && real.bukti_url ? `<a href="${real.bukti_url}" target="_blank" style="font-size: 0.75rem; color: var(--primary); display: block; margin-top: 4px;">Lihat Bukti Tersimpan</a>` : ''}
        `;

        html += `
            <tr>
                <td>${t.nomor_kegiatan}</td>
                <td style="white-space: normal; line-height: 1.4;">${t.deskripsi}</td>
                <td style="text-align: center; font-weight: bold; color: var(--primary);">${targetBulan}</td>
                <td>${t.satuan}</td>
                <td>${inputHtml}</td>
                <td style="font-weight: bold;">${capaianPersen}%</td>
                <td>${actionHtml}</td>
            </tr>
        `;
    });

    let totalCapaianKinerja = totalTargetBulan > 0 ? ((totalRealisasiBulan / totalTargetBulan) * 100).toFixed(2) : 0;

    html += `
                </tbody>
            </table>
        </div>
        <div style="margin-top: 1.5rem; padding: 1.5rem; background: rgba(21, 128, 61, 0.1); border-radius: 8px; border: 1px solid rgba(21, 128, 61, 0.2);">
            <h4 style="color: var(--success); margin-bottom: 0.5rem;">Ringkasan Capaian Laporan Kinerja</h4>
            <div style="display: flex; gap: 2rem;">
                <div>Total Target Bulanan: <strong>${totalTargetBulan}</strong></div>
                <div>Total Realisasi Diterima: <strong>${totalRealisasiBulan}</strong></div>
                <div>Capaian Kinerja (Kotor): <strong style="font-size: 1.2rem; color: #fff;">${totalCapaianKinerja}%</strong></div>
            </div>
            <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.5rem;">*Capaian di atas akan dikalikan dengan Bobot 60% dan diakumulasikan dengan Bobot Presensi 40% pada akhir bulan.</p>
        </div>
    `;

    contentArea.innerHTML = html;
}

async function simpanRealisasi(matrikId, empId, bulan, tahun) {
    const inputRealisasi = document.getElementById(`realisasi_${matrikId}`).value;
    const inputFile = document.getElementById(`bukti_${matrikId}`).files[0];
    const realisasiVal = parseFloat(inputRealisasi) || 0;

    showToast("Menyimpan realisasi...", "warning");

    let buktiUrl = "";
    
    // Fallback: Jika Storage gagal dibuat, kita kompres jadi Base64 saja (seperti fitur Absen)
    if (inputFile) {
        try {
            buktiUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = function(e) {
                    if (inputFile.type.startsWith('image/')) {
                        compressImage(e.target.result, 800, 800, 0.6, function(compressedStr) {
                            resolve(compressedStr);
                        });
                    } else {
                        resolve(e.target.result); // PDF or other
                    }
                };
                reader.readAsDataURL(inputFile);
            });
        } catch(e) {
            console.error("Gagal kompresi file", e);
        }
    } else {
        // Gunakan URL lama jika tidak upload baru
        const existing = matrikRealisasi.find(r => r.matrik_target_id === matrikId);
        if (existing) buktiUrl = existing.bukti_url;
    }

    try {
        const payload = {
            employee_id: empId,
            matrik_target_id: matrikId,
            periode_bulan: bulan,
            periode_tahun: tahun,
            realisasi: realisasiVal,
            bukti_url: buktiUrl,
            user_input: empId
        };

        // Check if exists
        const existing = matrikRealisasi.find(r => r.matrik_target_id === matrikId);
        if (existing) {
            const { error } = await supabaseClient
                .from('matrik_realisasi')
                .update(payload)
                .eq('id', existing.id);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient
                .from('matrik_realisasi')
                .insert([payload]);
            if (error) throw error;
        }

        showToast("Realisasi berhasil disimpan!", "success");
        loadMatrikData(); // Refresh UI
    } catch (error) {
        showToast("Gagal menyimpan: " + error.message, "error");
        console.error(error);
    }
}

// ==========================================
// MODUL DASHBOARD TUKIN ADMIN (TAHAP 13-16)
// ==========================================

let tukinDataMaster = [];
let tukinPaguList = [];
let tukinRulesList = [];

async function initTukinAdminView() {
    const d = new Date();
    document.getElementById("tukin-admin-tahun").value = d.getFullYear().toString();
    document.getElementById("tukin-admin-bulan").value = (d.getMonth() + 1).toString();
    await fetchTukinMasterData();
}

async function fetchTukinMasterData() {
    try {
        const { data: pagu } = await supabaseClient.from('tukin_pagu').select('*');
        if (pagu) tukinPaguList = pagu;
        
        const { data: rules } = await supabaseClient.from('tukin_rules').select('*');
        if (rules) tukinRulesList = rules;
    } catch (e) {
        console.error("Gagal load master tukin", e);
    }
}

function getPaguForJabatan(jabatan) {
    if(!jabatan) return 0;
    const lower = jabatan.toLowerCase();
    
    // Exact mapping logic based on standard
    let mapped = 'Staf';
    if(lower.includes('carik')) mapped = 'Carik';
    else if(lower.includes('palapa') || lower.includes('pangripta') || lower.includes('tata laksana')) mapped = 'Palapa';
    else if(lower.includes('danarta')) mapped = 'Danarta';
    else if(lower.includes('jagabaya')) mapped = 'Jagabaya';
    else if(lower.includes('ulu')) mapped = 'Ulu-ulu';
    else if(lower.includes('kamituwa') || lower.includes('kemasyarakatan')) mapped = 'Kamituwa';
    else if(lower.includes('dukuh') || lower.includes('kepala dusun')) mapped = 'Dukuh';
    
    const p = tukinPaguList.find(x => x.jabatan.toLowerCase() === mapped.toLowerCase());
    return p ? p.nominal_pagu : 0;
}

function getKategoriByScore(score) {
    // Score is 0.00 - 1.00
    let match = tukinRulesList.find(r => score >= parseFloat(r.min_score) && score <= parseFloat(r.max_score));
    if(!match && score > 1.0) match = tukinRulesList.find(r => r.max_score >= 1.0);
    if(!match && score < 0) match = tukinRulesList.find(r => r.min_score <= 0.0);
    
    if(match) return match;
    // Fallback if DB empty
    if (score >= 0.91) return { kategori: 'Sangat Baik', persentase: 1.0 };
    if (score >= 0.81) return { kategori: 'Baik', persentase: 0.9 };
    if (score >= 0.71) return { kategori: 'Cukup', persentase: 0.7 };
    if (score >= 0.40) return { kategori: 'Kurang', persentase: 0.4 };
    if (score >= 0.10) return { kategori: 'Buruk', persentase: 0.1 };
    return { kategori: 'Sangat Buruk', persentase: 0.0 };
}

async function loadTukinAdminData() {
    const tahun = parseInt(document.getElementById("tukin-admin-tahun").value);
    const bulan = parseInt(document.getElementById("tukin-admin-bulan").value);
    
    const btnProses = document.getElementById("btn-proses-kalkulasi");
    const btnExport = document.getElementById("btn-export-kalkulasi");
    if(btnProses) btnProses.disabled = true;
    if(btnExport) btnExport.disabled = true;
    
    const tbody = document.getElementById("tukin-table-body");
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;">⏳ Mengkalkulasi Kinerja & Presensi...</td></tr>';
    
    try {
        // 1. Ambil Log Presensi bulan tersebut
        const paddedBulan = bulan.toString().padStart(2, '0');
        const prefix = `${tahun}-${paddedBulan}-`;
        
        const { data: attLogs } = await supabaseClient
            .from('attendance_logs')
            .select('*')
            .like('date', `${prefix}%`);
            
        // 2. Tentukan Total Hari Kerja dinamis
        const uniqueDates = new Set();
        (attLogs || []).forEach(l => uniqueDates.add(l.date));
        const totalHariKerja = uniqueDates.size > 0 ? uniqueDates.size : 21; // fallback 21 if no logs
        
        // 3. Ambil Realisasi & Target Kinerja
        const { data: realisasiAll } = await supabaseClient
            .from('matrik_realisasi')
            .select('*')
            .eq('periode_bulan', bulan)
            .eq('periode_tahun', tahun);
            
        const { data: targetAll } = await supabaseClient.from('matrik_target').select('*');
        
        tukinDataMaster = [];
        let grandTotalTukin = 0;
        let sumKinerja = 0;
        let sumPresensi = 0;
        let activeEmployeesCount = 0;

        employees.forEach(emp => {
            if (emp.role === 'admin') return; // Skip admin account for tukin
            activeEmployeesCount++;
            
            // --- HITUNG PRESENSI ---
            const myAtt = (attLogs || []).filter(l => l.employee_id === emp.id && l.status === 'Hadir');
            const jumlahHadir = myAtt.length;
            const presensiPersen = Math.min(1.0, (jumlahHadir / totalHariKerja));
            
            // --- HITUNG KINERJA ---
            let mappedJabatan = emp.department;
            if(mappedJabatan.toLowerCase() === 'kemasyarakatan') mappedJabatan = 'Kamituwa';
            
            const myTargets = (targetAll || []).filter(t => t.jabatan.toLowerCase().includes(mappedJabatan.toLowerCase()));
            const myRealisasi = (realisasiAll || []).filter(r => r.employee_id === emp.id);
            
            let tTotal = 0;
            let rTotal = 0;
            
            myTargets.forEach(t => {
                let targetBulan = 0;
                if(bulan === 1) targetBulan = t.target_jan;
                else if(bulan === 2) targetBulan = t.target_feb;
                else if(bulan === 3) targetBulan = t.target_mar;
                else if(bulan === 4) targetBulan = t.target_apr;
                else if(bulan === 5) targetBulan = t.target_mei;
                else if(bulan === 6) targetBulan = t.target_jun;
                else if(bulan === 7) targetBulan = t.target_jul;
                else if(bulan === 8) targetBulan = t.target_ags;
                else if(bulan === 9) targetBulan = t.target_sep;
                else if(bulan === 10) targetBulan = t.target_okt;
                else if(bulan === 11) targetBulan = t.target_nov;
                else if(bulan === 12) targetBulan = t.target_des;
                
                targetBulan = targetBulan || 0;
                const realRow = myRealisasi.find(r => r.matrik_target_id === t.id);
                const realBulan = realRow ? parseFloat(realRow.realisasi) : 0;
                
                tTotal += targetBulan;
                rTotal += (realBulan > targetBulan ? targetBulan : realBulan);
            });
            
            const kinerjaPersen = tTotal > 0 ? (rTotal / tTotal) : 0;
            
            // --- HITUNG NILAI AKHIR (Bobot 60:40) ---
            const BOBOT_KINERJA = 0.60;
            const BOBOT_PRESENSI = 0.40;
            
            const nilaiKinerjaBerbobot = kinerjaPersen * BOBOT_KINERJA;
            const nilaiPresensiBerbobot = presensiPersen * BOBOT_PRESENSI;
            const nilaiAkhir = nilaiKinerjaBerbobot + nilaiPresensiBerbobot;
            
            // --- KONVERSI RUPIAH ---
            const pagu = getPaguForJabatan(emp.department);
            const kriteria = getKategoriByScore(nilaiAkhir);
            
            const tukinBruto = pagu * kriteria.persentase;
            const sanksi = 0; // Default sanksi 0 untuk MVP
            const tukinDiterima = tukinBruto - sanksi;
            
            sumKinerja += kinerjaPersen;
            sumPresensi += presensiPersen;
            grandTotalTukin += tukinDiterima;
            
            tukinDataMaster.push({
                emp, 
                tTotal, rTotal, kinerjaPersen, jumlahHadir, totalHariKerja, presensiPersen,
                nilaiKinerjaBerbobot, nilaiPresensiBerbobot, nilaiAkhir,
                kategori: kriteria.kategori,
                persentaseDiterima: kriteria.persentase,
                pagu, tukinBruto, sanksi, tukinDiterima
            });
        });
        
        // Update Stats
        document.getElementById("tukin-stat-pamong").textContent = activeEmployeesCount;
        document.getElementById("tukin-stat-kinerja").textContent = activeEmployeesCount > 0 ? (Math.round((sumKinerja/activeEmployeesCount)*100)) + '%' : '0%';
        document.getElementById("tukin-stat-presensi").textContent = activeEmployeesCount > 0 ? (Math.round((sumPresensi/activeEmployeesCount)*100)) + '%' : '0%';
        document.getElementById("tukin-stat-total").textContent = 'Rp ' + grandTotalTukin.toLocaleString('id-ID');
        
        // Render Table
        let html = '';
        tukinDataMaster.sort((a,b) => b.nilaiAkhir - a.nilaiAkhir).forEach((row, i) => {
            html += `
                <tr>
                    <td><strong>${row.emp.name}</strong></td>
                    <td>${row.emp.department}</td>
                    <td><span class="badge badge-primary">${Math.round(row.kinerjaPersen*100)}%</span></td>
                    <td><span class="badge badge-success">${Math.round(row.presensiPersen*100)}%</span></td>
                    <td><strong>${(row.nilaiAkhir*100).toFixed(1)}%</strong></td>
                    <td>${row.kategori}</td>
                    <td>Rp ${row.pagu.toLocaleString('id-ID')}</td>
                    <td>${Math.round(row.persentaseDiterima*100)}%</td>
                    <td>Rp ${row.sanksi.toLocaleString('id-ID')}</td>
                    <td style="color:var(--success); font-weight:bold;">Rp ${row.tukinDiterima.toLocaleString('id-ID')}</td>
                    <td>
                        <button class="btn btn-secondary" onclick="showTukinDetail(${i})" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">Detail</button>
                    </td>
                </tr>
            `;
        });
        
        if (tukinDataMaster.length === 0) html = '<tr><td colspan="11" style="text-align:center;">Tidak ada data pamong.</td></tr>';
        tbody.innerHTML = html;
        
        if(btnProses) btnProses.disabled = false;
        if(btnExport) btnExport.disabled = false;
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; color:var(--danger);">Gagal mengkalkulasi Tukin. Periksa koneksi atau console.</td></tr>';
        if(btnProses) btnProses.disabled = false;
        if(btnExport) btnExport.disabled = false;
    }
}

function showTukinDetail(index) {
    const d = tukinDataMaster[index];
    if(!d) return;
    
    const content = `
        <div style="display:flex; justify-content:space-between; margin-bottom: 1rem;">
            <div>
                <h4 style="color:white; margin:0;">${d.emp.name}</h4>
                <div style="font-size:0.8rem;">${d.emp.department}</div>
            </div>
            <div style="text-align:right;">
                <h4 style="color:var(--primary); margin:0;">NILAI AKHIR: ${(d.nilaiAkhir*100).toFixed(2)}%</h4>
                <div style="font-size:0.8rem; color:var(--success);">Kategori: ${d.kategori}</div>
            </div>
        </div>
        
        <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px; margin-bottom: 1rem;">
            <div style="margin-bottom:0.5rem; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:0.5rem;">
                <strong style="color:white;">A. CAPAIAN KINERJA (BOBOT 60%)</strong><br>
                Realisasi / Target: ${d.rTotal} / ${d.tTotal}<br>
                Capaian Kotor: ${(d.kinerjaPersen*100).toFixed(2)}%<br>
                <strong>Kinerja Berbobot: ${(d.kinerjaPersen*100).toFixed(2)}% × 60% = <span style="color:var(--primary)">${(d.nilaiKinerjaBerbobot*100).toFixed(2)}%</span></strong>
            </div>
            
            <div style="margin-bottom:0.5rem; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:0.5rem;">
                <strong style="color:white;">B. PRESENSI (BOBOT 40%)</strong><br>
                Hadir / Hari Kerja: ${d.jumlahHadir} / ${d.totalHariKerja} hari<br>
                Persentase Kehadiran: ${(d.presensiPersen*100).toFixed(2)}%<br>
                <strong>Presensi Berbobot: ${(d.presensiPersen*100).toFixed(2)}% × 40% = <span style="color:var(--success)">${(d.nilaiPresensiBerbobot*100).toFixed(2)}%</span></strong>
            </div>
            
            <div style="margin-bottom:0.5rem; padding-bottom:0.5rem;">
                <strong style="color:white;">C. TUNJANGAN KINERJA (TUKIN)</strong><br>
                Pagu Jabatan: Rp ${d.pagu.toLocaleString('id-ID')}<br>
                Hak Diterima (${d.kategori}): ${Math.round(d.persentaseDiterima*100)}%<br>
                Tukin Bruto: Rp ${d.tukinBruto.toLocaleString('id-ID')}<br>
                Sanksi/Potongan: Rp ${d.sanksi.toLocaleString('id-ID')}<br>
                <div style="margin-top:0.5rem; font-size:1.1rem;">
                    <strong>Tukin Bersih: <span style="color:var(--success)">Rp ${d.tukinDiterima.toLocaleString('id-ID')}</span></strong>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById("tukin-detail-content").innerHTML = content;
    document.getElementById("modal-tukin-detail").style.display = "flex";
}

function exportTukinExcel() {
    if (tukinDataMaster.length === 0) {
        showToast("Hitung data terlebih dahulu sebelum export!", "warning");
        return;
    }
    
    const tahun = document.getElementById("tukin-admin-tahun").value;
    const bulan = document.getElementById("tukin-admin-bulan").value;
    const namaBulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][bulan-1];
    
    const dataToExport = tukinDataMaster.map(r => ({
        "Nama Pegawai": r.emp.name,
        "Jabatan": r.emp.department,
        "Target Kegiatan": r.tTotal,
        "Realisasi Kegiatan": r.rTotal,
        "Capaian Kinerja (%)": (r.kinerjaPersen * 100).toFixed(2) + "%",
        "Hari Kerja": r.totalHariKerja,
        "Hadir": r.jumlahHadir,
        "Capaian Presensi (%)": (r.presensiPersen * 100).toFixed(2) + "%",
        "Kinerja Berbobot (60%)": (r.nilaiKinerjaBerbobot * 100).toFixed(2) + "%",
        "Presensi Berbobot (40%)": (r.nilaiPresensiBerbobot * 100).toFixed(2) + "%",
        "Nilai Akhir": (r.nilaiAkhir * 100).toFixed(2) + "%",
        "Kriteria": r.kategori,
        "Pagu Tukin": r.pagu,
        "Persentase Hak": (r.persentaseDiterima * 100) + "%",
        "Sanksi": r.sanksi,
        "TUKIN DITERIMA": r.tukinDiterima
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    
    const ws2 = XLSX.utils.aoa_to_sheet([
        ["PEMERINTAH KABUPATEN KULON PROGO"],
        ["KAPANEWON TEMON"],
        ["PEMERINTAH KALURAHAN KALIDENGEN"],
        ["Kalidengen I, Kalidengen, Temon, Kulon Progo, Kode Pos 55654, Telp. 08112642340"],
        ["Email: desakalidengen@gmail.com, Website: kalidengen-kulonprogo.desa.id"],
        [],
        ["REKAPITULASI TUNJANGAN KINERJA APARATUR"],
        [`PERIODE: ${namaBulan.toUpperCase()} ${tahun}`],
        []
    ]);
    XLSX.utils.sheet_add_json(ws2, dataToExport, { origin: "A10" });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws2, "Rekap Tukin");

    XLSX.writeFile(wb, `Rekap_Tukin_${namaBulan}_${tahun}.xlsx`);
}
