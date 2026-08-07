// Supabase Configuration
const SUPABASE_URL = "https://kpfekjokjpziabdecmoy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_MkU_B4uLFWBM-DbqVIz36A_ppd_Lenh";

let supabaseClient = null;
try {
    if (typeof supabase !== 'undefined') {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
} catch (e) {
    console.error("Gagal menginisiasi Supabase:", e);
}

// System State
let employees = [
    { id: "emp-1", nik: "NIK202601", name: "John Doe", role: "Software Engineer", department: "IT & Engineering", email: "john.doe@apresi.local", avatar_url: "" },
    { id: "emp-2", nik: "NIK202602", name: "Rian Hidayat", role: "Kepala Kantor", department: "Admin", email: "rian.h@apresi.local", avatar_url: "" },
    { id: "emp-3", nik: "NIK202603", name: "Siti Aminah", role: "Staf Administrasi", department: "Sekretariat", email: "siti.a@apresi.local", avatar_url: "" }
];
let attendanceLogs = [];
let currentEmployeeId = "emp-1";
let clockInterval = null;
let webcamStream = null;

// Office coordinates (Yogyakarta / Central Java - User configured)
const OFFICE_LAT = -7.891848418181234;
const OFFICE_LNG = 110.08084144673063;
const MAX_RADIUS_METERS = 100;
let latestDistance = null;

// Initialize on DOM load
window.addEventListener("DOMContentLoaded", async () => {
    startClock();
    await loadInitialData();
    injectEmployeeSelector();
    updateUserProfileUI();
    syncUIState();
    switchView('public'); // Default view
});

// Load data from Supabase (with LocalStorage fallback)
async function loadInitialData() {
    let supabaseSuccess = false;

    if (supabaseClient) {
        try {
            // Load Employees
            const { data: dbEmployees, error: empErr } = await supabaseClient.from('employees').select('*');
            if (!empErr && dbEmployees) {
                if (dbEmployees.length > 0) {
                    employees = dbEmployees;
                } else {
                    // Database kosong, masukkan karyawan default ke Supabase
                    await supabaseClient.from('employees').insert(employees);
                }
                supabaseSuccess = true;
            } else if (empErr) {
                console.warn("Menggunakan LocalStorage karena query employees error:", empErr.message);
            }

            // Load Logs
            const { data: dbLogs, error: logErr } = await supabaseClient.from('attendance_logs').select('*').order('created_at', { ascending: false });
            if (!logErr && dbLogs) {
                attendanceLogs = dbLogs;
                supabaseSuccess = true;
            }
        } catch (err) {
            console.error("Gagal terhubung ke database Supabase:", err);
        }
    }

    if (!supabaseSuccess) {
        console.log("Memuat data dari LocalStorage...");
        if (localStorage.getItem("apresi_employees")) {
            employees = JSON.parse(localStorage.getItem("apresi_employees"));
        } else {
            localStorage.setItem("apresi_employees", JSON.stringify(employees));
        }

        if (localStorage.getItem("apresi_logs")) {
            attendanceLogs = JSON.parse(localStorage.getItem("apresi_logs"));
        } else {
            localStorage.setItem("apresi_logs", JSON.stringify(attendanceLogs));
        }
    }

    // Set active user
    if (!employees.some(e => e.id === currentEmployeeId)) {
        currentEmployeeId = employees[0].id;
    }
}

// Digital Clock
function startClock() {
    const clockEl = document.getElementById("clock");
    const dateEl = document.getElementById("date");
    const optionsDate = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    
    function update() {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString('id-ID', { hour12: false });
        dateEl.textContent = now.toLocaleDateString('id-ID', optionsDate);
    }
    update();
    clockInterval = setInterval(update, 1000);
}

// Check if current user is admin
function isCurrentUserAdmin() {
    const current = getCurrentEmployee();
    if (!current) return false;
    const role = (current.role || "").toLowerCase();
    const dept = (current.department || "").toLowerCase();
    return role.includes("admin") || role.includes("kepala") || dept.includes("admin");
}

// SPA Routing
function switchView(viewName) {
    stopCameraStream();

    // Access control: if switching to admin but not admin, block
    if (viewName === 'admin' && !isCurrentUserAdmin()) {
        showToast("Akses ditolak! Menu Admin hanya untuk Kepala Kantor / Admin.", "error");
        switchView('public');
        return;
    }

    document.querySelectorAll(".view-panel").forEach(panel => panel.classList.remove("active"));
    document.querySelectorAll(".sidebar .nav-item").forEach(item => item.classList.remove("active"));

    const employee = getCurrentEmployee();

    if (viewName === "public") {
        document.getElementById("view-public").classList.add("active");
        document.getElementById("nav-public").classList.add("active");
        document.getElementById("welcome-message").textContent = "Dashboard Kehadiran Aparat";
        document.getElementById("welcome-subtext").textContent = "Monitor status kehadiran seluruh aparatur hari ini.";
        renderPublicDashboard();
    } else if (viewName === "employee") {
        document.getElementById("view-employee").classList.add("active");
        document.getElementById("nav-employee").classList.add("active");
        document.getElementById("welcome-message").textContent = `Selamat Datang, ${employee.name}!`;
        document.getElementById("welcome-subtext").textContent = "Sudah siap untuk produktif hari ini?";
        checkTodayAttendanceState();
        getCurrentGPS();
    } else if (viewName === "profile") {
        document.getElementById("view-profile").classList.add("active");
        document.getElementById("nav-profile").classList.add("active");
        document.getElementById("welcome-message").textContent = "Profil Saya";
        document.getElementById("welcome-subtext").textContent = "Lengkapi detail identitas diri Anda di sini.";
        loadProfileForm();
    } else if (viewName === "admin") {
        document.getElementById("view-admin").classList.add("active");
        document.getElementById("nav-admin").classList.add("active");
        document.getElementById("welcome-message").textContent = "Panel Administrasi";
        document.getElementById("welcome-subtext").textContent = "Pantau dan kelola data presensi seluruh karyawan.";
        updateAdminStats();
        renderAdminLogs();
    }
}

// User helper
function getCurrentEmployee() {
    return employees.find(emp => emp.id === currentEmployeeId) || employees[0];
}

function updateUserProfileUI() {
    const current = getCurrentEmployee();
    document.getElementById("profile-name").textContent = current.name;
    document.getElementById("profile-role").textContent = current.role;

    const initials = current.name.split(" ").map(n => n[0]).slice(0,2).join("").toUpperCase();
    const avatarEl = document.getElementById("avatar-initial");
    
    if (current.avatar_url) {
        avatarEl.innerHTML = `<img src="${current.avatar_url}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
    } else {
        avatarEl.textContent = initials;
    }

    // Sidebar Admin Access Control: Show/Hide based on role
    const adminNav = document.getElementById("nav-admin");
    if (isCurrentUserAdmin()) {
        adminNav.style.display = "block";
    } else {
        adminNav.style.display = "none";
        // If current view was admin, redirect back
        if (document.getElementById("view-admin").classList.contains("active")) {
            switchView('public');
        }
    }
}

function injectEmployeeSelector() {
    const consoleCard = document.querySelector(".attendance-console");
    if (!consoleCard) return;

    const oldSelector = document.getElementById("demo-user-selector-group");
    if (oldSelector) oldSelector.remove();

    const selectGroup = document.createElement("div");
    selectGroup.id = "demo-user-selector-group";
    selectGroup.className = "form-group";
    selectGroup.style.marginBottom = "1rem";
    
    let optionsHtml = "";
    employees.forEach(emp => {
        optionsHtml += `<option value="${emp.id}" ${emp.id === currentEmployeeId ? 'selected' : ''}>${emp.name} (${emp.role})</option>`;
    });

    selectGroup.innerHTML = `
        <label for="demo-user-select">Simulasi Login Karyawan (Pilih Karyawan)</label>
        <select class="form-input" id="demo-user-select" onchange="changeActiveUser(this.value)">
            ${optionsHtml}
        </select>
    `;

    consoleCard.insertBefore(selectGroup, consoleCard.firstChild);
}

async function changeActiveUser(id) {
    currentEmployeeId = id;
    updateUserProfileUI();
    checkTodayAttendanceState();
    getCurrentGPS();
    renderPersonalLogs();
    updatePersonalStats();
    renderPublicDashboard();
    showToast(`Beralih ke karyawan: ${getCurrentEmployee().name}`, "success");
}

// Toggle WFO/WFH Form
function togglePresenceTypeInputs() {
    const type = document.querySelector('input[name="presence_type"]:checked').value;
    
    document.getElementById("fields-wfo").style.display = "none";
    document.getElementById("fields-wfh").style.display = "none";
    document.getElementById("fields-absen").style.display = "none";
    document.getElementById("camera-section").style.display = "block";
    document.getElementById("btn-checkin").textContent = "Check-In Presensi";

    if (type === "WFO") {
        document.getElementById("fields-wfo").style.display = "block";
        getCurrentGPS();
    } else if (type === "WFH") {
        document.getElementById("fields-wfh").style.display = "block";
    } else if (type === "ABSEN") {
        document.getElementById("fields-absen").style.display = "block";
        document.getElementById("camera-section").style.display = "none";
        document.getElementById("btn-checkin").textContent = "Kirim Permohonan Izin / Cuti";
        stopCameraStream();
    }
}

// Real Geolocation
function getCurrentGPS() {
    const coordsInput = document.getElementById("wfo-coords");
    const distanceHint = document.getElementById("wfo-distance-hint");

    if (!navigator.geolocation) {
        coordsInput.value = "GPS tidak didukung oleh browser Anda";
        return;
    }

    coordsInput.value = "Mendapatkan koordinat...";
    distanceHint.textContent = "";

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            coordsInput.value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

            const distance = calculateDistance(lat, lng, OFFICE_LAT, OFFICE_LNG);
            latestDistance = distance;
            
            if (distance < 1000) {
                distanceHint.textContent = `Jarak ke kantor: ${Math.round(distance)} meter (${distance <= MAX_RADIUS_METERS ? 'Dalam Radius Kantor' : 'Di Luar Radius Kantor'})`;
                distanceHint.style.color = distance <= MAX_RADIUS_METERS ? 'var(--success)' : 'var(--warning)';
            } else {
                distanceHint.textContent = `Jarak ke kantor: ${(distance / 1000).toFixed(2)} km (Di Luar Radius Kantor)`;
                distanceHint.style.color = 'var(--danger)';
            }
        },
        (error) => {
            console.error("GPS Error:", error);
            coordsInput.value = "-7.891848, 110.080841 (Default Lokasi Kantor - Izin GPS Ditolak)";
            distanceHint.textContent = "Gagal memindai lokasi. Memakai koordinat default.";
            distanceHint.style.color = 'var(--warning)';
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

// Real Webcam Handling
async function initRealCamera() {
    const video = document.getElementById("webcam-video");
    const placeholderImg = document.getElementById("camera-feed-placeholder");
    const photoPreview = document.getElementById("photo-preview");
    const statusDot = document.getElementById("camera-dot");
    const statusLabel = document.getElementById("camera-status-label");
    const toggleBtn = document.getElementById("btn-toggle-camera");

    if (webcamStream) {
        stopCameraStream();
        return;
    }

    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false
        });

        video.srcObject = webcamStream;
        video.style.display = "block";
        placeholderImg.style.display = "none";
        photoPreview.style.display = "none";

        statusDot.className = "status-dot active";
        statusLabel.textContent = "Kamera Riil Aktif";
        toggleBtn.textContent = "Matikan Kamera";
        toggleBtn.className = "btn btn-danger";
        toggleBtn.style.width = "auto";
        toggleBtn.style.padding = "0.25rem 0.75rem";
        toggleBtn.style.fontSize = "0.75rem";
    } catch (err) {
        console.error("Webcam access error:", err);
        showToast("Gagal mengakses kamera perangkat!", "error");
    }
}

function stopCameraStream() {
    const video = document.getElementById("webcam-video");
    const placeholderImg = document.getElementById("camera-feed-placeholder");
    const photoPreview = document.getElementById("photo-preview");
    const statusDot = document.getElementById("camera-dot");
    const statusLabel = document.getElementById("camera-status-label");
    const toggleBtn = document.getElementById("btn-toggle-camera");

    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }

    if (video) {
        video.srcObject = null;
        video.style.display = "none";
    }
    if (placeholderImg) placeholderImg.style.display = "block";
    if (photoPreview) photoPreview.style.display = "none";

    if (statusDot) statusDot.className = "status-dot";
    if (statusLabel) statusLabel.textContent = "Kamera Tidak Aktif";
    if (toggleBtn) {
        toggleBtn.textContent = "Aktifkan Kamera";
        toggleBtn.className = "btn btn-primary";
        toggleBtn.style.width = "auto";
        toggleBtn.style.padding = "0.25rem 0.75rem";
        toggleBtn.style.fontSize = "0.75rem";
    }
}

// Work Schedule Constraints (Luar Ramadan)
// Senin - Kamis: 07:30 s.d 15:45 (Jendela masuk: 06:30 - 08:30) (Jendela pulang: 14:45 - 16:45)
// Jumat: 07:30 s.d 15:30 (Jendela masuk: 06:30 - 08:30) (Jendela pulang: 14:30 - 16:30)
function getPresenceTimeConfig() {
    const now = new Date();
    const day = now.getDay(); // 0: Minggu, 1: Senin, ..., 5: Jumat, 6: Sabtu
    
    // Default schedule setup
    let config = {
        isWorkday: true,
        startTime: "07:30",
        endTime: "15:45",
        inStart: "06:30",
        inEnd: "08:30",
        outStart: "14:45",
        outEnd: "16:45"
    };

    if (day === 0 || day === 6) {
        config.isWorkday = false;
    } else if (day === 5) { // Jumat
        config.endTime = "15:30";
        config.outStart = "14:30";
        config.outEnd = "16:30";
    }

    return config;
}

// Check Work Hours Windows
function checkTodayAttendanceState() {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const logToday = attendanceLogs.find(l => l.employee_id === currentEmployeeId && l.date === today);

    const btnCheckin = document.getElementById("btn-checkin");
    const btnCheckout = document.getElementById("btn-checkout");
    const timeConfig = getPresenceTimeConfig();

    if (!timeConfig.isWorkday) {
        btnCheckin.style.display = "block";
        btnCheckin.disabled = true;
        btnCheckin.textContent = "Hari Ini Libur Akhir Pekan";
        btnCheckout.style.display = "none";
        return;
    }

    if (logToday) {
        if (logToday.type === "ABSEN") {
            btnCheckin.style.display = "block";
            btnCheckin.disabled = true;
            btnCheckin.textContent = `Sudah Izin (${logToday.status})`;
            btnCheckout.style.display = "none";
        } else if (logToday.check_out_time) {
            btnCheckin.style.display = "block";
            btnCheckin.disabled = true;
            btnCheckin.textContent = "Selesai Kerja Hari Ini";
            btnCheckout.style.display = "none";
        } else {
            // Check-out button window validation
            const [outHStart, outMStart] = timeConfig.outStart.split(":").map(Number);
            const [outHEnd, outMEnd] = timeConfig.outEnd.split(":").map(Number);
            const curH = now.getHours();
            const curM = now.getMinutes();

            const isCheckoutOpen = (curH > outHStart || (curH === outHStart && curM >= outMStart)) &&
                                  (curH < outHEnd || (curH === outHEnd && curM <= outMEnd));

            btnCheckin.style.display = "none";
            btnCheckout.style.display = "block";

            if (!isCheckoutOpen) {
                btnCheckout.disabled = true;
                btnCheckout.textContent = `Check-Out Belum/Selesai Dibuka (${timeConfig.outStart} - ${timeConfig.outEnd})`;
            } else {
                btnCheckout.disabled = false;
                btnCheckout.textContent = "Check-Out Presensi";
            }
        }
    } else {
        // Check-in button window validation
        const [inHStart, inMStart] = timeConfig.inStart.split(":").map(Number);
        const [inHEnd, inMEnd] = timeConfig.inEnd.split(":").map(Number);
        const curH = now.getHours();
        const curM = now.getMinutes();

        const isCheckinOpen = (curH > inHStart || (curH === inHStart && curM >= inMStart)) &&
                             (curH < inHEnd || (curH === inHEnd && curM <= inMEnd));

        btnCheckin.style.display = "block";
        btnCheckout.style.display = "none";
        togglePresenceTypeInputs();

        // Absen / Izin is always allowed even outside working hours window
        const type = document.querySelector('input[name="presence_type"]:checked')?.value || "WFO";
        
        if (type !== "ABSEN" && !isCheckinOpen) {
            btnCheckin.disabled = true;
            btnCheckin.textContent = `Check-In Ditutup (${timeConfig.inStart} - ${timeConfig.inEnd})`;
        } else {
            btnCheckin.disabled = false;
            btnCheckin.textContent = type === "ABSEN" ? "Kirim Permohonan Izin / Cuti" : "Check-In Presensi";
        }
    }
}

// Capture Photo helper (Base64)
function capturePhotoBase64() {
    const video = document.getElementById("webcam-video");
    const canvas = document.getElementById("photo-canvas");
    
    if (!webcamStream) return "";

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    const ctx = canvas.getContext("2d");
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    return canvas.toDataURL("image/jpeg", 0.7);
}

// Check-In Action
async function performCheckIn() {
    const type = document.querySelector('input[name="presence_type"]:checked').value;
    const today = new Date().toISOString().split("T")[0];

    // Double check today
    if (attendanceLogs.some(l => l.employee_id === currentEmployeeId && l.date === today)) {
        showToast("Anda sudah check-in hari ini!", "warning");
        return;
    }

    if (type === "WFO") {
        if (latestDistance === null) {
            showToast("Harap pindai lokasi GPS Anda terlebih dahulu!", "warning");
            return;
        }
        if (latestDistance > MAX_RADIUS_METERS) {
            showToast(`Anda berada di luar radius kantor (${Math.round(latestDistance)}m)! Check-in WFO ditolak.`, "error");
            return;
        }
    }

    if (type === "ABSEN") {
        const reason = document.getElementById("absen-reason").value;
        const notes = document.getElementById("absen-notes").value || "Tanpa Keterangan";
        await savePresenceLog(type, "00:00", null, `Izin: ${reason} (${notes})`, "Izin", "");
        return;
    }

    // Camera & GPS Verification
    let photoData = "";
    if (webcamStream) {
        photoData = capturePhotoBase64();
        const photoPreview = document.getElementById("photo-preview");
        photoPreview.src = photoData;
        photoPreview.style.display = "block";
        document.getElementById("webcam-video").style.display = "none";
    }

    const scannerLine = document.getElementById("scanner-line");
    const faceOverlay = document.getElementById("face-overlay");
    const btnCheckin = document.getElementById("btn-checkin");

    btnCheckin.disabled = true;
    scannerLine.style.display = "block";
    faceOverlay.style.display = "flex";

    setTimeout(async () => {
        scannerLine.style.display = "none";
        faceOverlay.style.display = "none";

        const now = new Date();
        const checkInTimeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        
        // Late calculation (limit: 07:30)
        let status = "Tepat Waktu";
        const [targetH, targetM] = ["07", "30"].map(Number);
        if (now.getHours() > targetH || (now.getHours() === targetH && now.getMinutes() > targetM)) {
            status = "Terlambat";
        }

        let detail = "";
        if (type === "WFO") {
            detail = `WFO - ${document.getElementById("wfo-coords").value}`;
        } else {
            const loc = document.getElementById("wfh-location").value || "Luar Kantor";
            const task = document.getElementById("wfh-notes").value || "Kerja remote";
            detail = `WFH - Lokasi: ${loc} (Tugas: ${task})`;
        }

        await savePresenceLog(type, checkInTimeStr, null, detail, status, photoData);
        stopCameraStream();
    }, 2000);
}

// Check-Out Action
async function performCheckOut() {
    const today = new Date().toISOString().split("T")[0];
    const logIndex = attendanceLogs.findIndex(l => l.employee_id === currentEmployeeId && l.date === today);

    if (logIndex === -1) {
        showToast("Data log masuk tidak ditemukan!", "error");
        return;
    }

    const now = new Date();
    const checkOutTimeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    
    // Calculate working hours
    const checkinTimeRaw = attendanceLogs[logIndex].check_in_time;
    const [inH, inM] = checkinTimeRaw.split(":").map(Number);
    const outH = now.getHours();
    const outM = now.getMinutes();

    let diffHours = outH - inH;
    let diffMinutes = outM - inM;
    if (diffMinutes < 0) {
        diffHours -= 1;
        diffMinutes += 60;
    }
    const workingHours = parseFloat((diffHours + (diffMinutes / 60)).toFixed(1));

    const updatedLog = {
        ...attendanceLogs[logIndex],
        check_out_time: checkOutTimeStr,
        working_hours: workingHours
    };

    let pushSuccess = false;
    if (supabaseClient) {
        try {
            const { error } = await supabaseClient.from('attendance_logs').update({
                check_out_time: checkOutTimeStr,
                working_hours: workingHours
            }).eq('id', updatedLog.id);
            if (!error) pushSuccess = true;
        } catch (e) {
            console.error("Gagal update checkout ke Supabase:", e);
        }
    }

    attendanceLogs[logIndex] = updatedLog;
    localStorage.setItem("apresi_logs", JSON.stringify(attendanceLogs));

    showToast("Berhasil Check-Out! Selamat beristirahat.", "success");
    syncUIState();
}

// Log Saver
async function savePresenceLog(type, checkIn, checkOut, detail, status, photoData) {
    const employee = getCurrentEmployee();
    const today = new Date().toISOString().split("T")[0];

    const newLog = {
        id: "log-" + Date.now(),
        employee_id: employee.id,
        name: employee.name,
        type: type,
        date: today,
        check_in_time: checkIn,
        check_out_time: checkOut,
        status: status,
        detail: detail,
        working_hours: 0,
        photo_data: photoData
    };

    let pushSuccess = false;
    if (supabaseClient) {
        try {
            const { error } = await supabaseClient.from('attendance_logs').insert([newLog]);
            if (!error) {
                pushSuccess = true;
                console.log("Berhasil simpan ke Supabase");
            } else {
                console.error("Insert error Supabase:", error.message);
            }
        } catch (e) {
            console.error("Gagal menyimpan ke Supabase:", e);
        }
    }

    attendanceLogs.unshift(newLog);
    localStorage.setItem("apresi_logs", JSON.stringify(attendanceLogs));

    showToast("Presensi berhasil terkirim!", "success");
    syncUIState();
}

// Sync UI states
function syncUIState() {
    checkTodayAttendanceState();
    renderPersonalLogs();
    updatePersonalStats();
    renderAdminLogs();
    updateAdminStats();
    renderPublicDashboard();
}

// Personal Logs Render
function renderPersonalLogs() {
    const tbody = document.getElementById("personal-history-body");
    tbody.innerHTML = "";

    const userLogs = attendanceLogs.filter(l => l.employee_id === currentEmployeeId);

    if (userLogs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">Belum ada riwayat presensi.</td></tr>`;
        return;
    }

    userLogs.forEach(log => {
        let typeBadge = `<span class="badge badge-wfo">WFO</span>`;
        if (log.type === "WFH") typeBadge = `<span class="badge badge-wfh">WFH</span>`;
        if (log.type === "ABSEN") typeBadge = `<span class="badge badge-absen">Izin</span>`;

        let statusClass = "stat-footer up";
        if (log.status === "Terlambat") statusClass = "stat-footer down";
        if (log.status === "Izin") statusClass = "stat-footer";

        tbody.innerHTML += `
            <tr>
                <td>${formatDateIndo(log.date)}</td>
                <td>${typeBadge}</td>
                <td>${log.check_in_time || '-'}</td>
                <td>${log.check_out_time || '<span class="badge badge-checkout">Belum</span>'}</td>
                <td><span class="${statusClass}">${log.status}</span></td>
            </tr>
        `;
    });
}

function updatePersonalStats() {
    const userLogs = attendanceLogs.filter(l => l.employee_id === currentEmployeeId);
    
    const presentDays = userLogs.filter(l => l.type === "WFO" || l.type === "WFH").length;
    const absentDays = userLogs.filter(l => l.type === "ABSEN").length;
    const totalDays = presentDays + absentDays;
    const rate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 100;
    document.getElementById("stat-attendance-rate").textContent = `${rate}%`;

    const totalHours = userLogs.reduce((acc, log) => acc + (log.working_hours || 0), 0);
    document.getElementById("stat-hours").textContent = `${totalHours.toFixed(1)}h`;

    const onTimeCount = userLogs.filter(l => l.status === "Tepat Waktu").length;
    document.getElementById("stat-ontime").textContent = onTimeCount;
}

// Load Staff Profile Detail
function loadProfileForm() {
    const current = getCurrentEmployee();
    document.getElementById("profile-nik").value = current.nik || "BELUM DISKEMA";
    document.getElementById("profile-fullname").value = current.name;
    document.getElementById("profile-designation").value = current.role;
    document.getElementById("profile-department").value = current.department || "IT & Engineering";
    document.getElementById("profile-email").value = current.email || "";

    const preview = document.getElementById("profile-img-preview");
    preview.src = current.avatar_url || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200";
}

function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById("profile-img-preview").src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Save Staff Profile
async function saveStaffProfile() {
    const current = getCurrentEmployee();
    
    const updatedName = document.getElementById("profile-fullname").value.trim();
    const updatedRole = document.getElementById("profile-designation").value.trim();
    const updatedDept = document.getElementById("profile-department").value;
    const updatedEmail = document.getElementById("profile-email").value.trim();
    const updatedAvatar = document.getElementById("profile-img-preview").src;

    if (!updatedName || !updatedRole) {
        showToast("Nama dan Jabatan wajib diisi!", "error");
        return;
    }

    const updated = {
        ...current,
        name: updatedName,
        role: updatedRole,
        department: updatedDept,
        email: updatedEmail,
        avatar_url: updatedAvatar.startsWith("data:") ? updatedAvatar : current.avatar_url
    };

    let pushSuccess = false;
    if (supabaseClient) {
        try {
            const { error } = await supabaseClient.from('employees').upsert([updated]);
            if (!error) pushSuccess = true;
        } catch (e) {
            console.error("Gagal upsert karyawan ke Supabase:", e);
        }
    }

    const index = employees.findIndex(e => e.id === currentEmployeeId);
    employees[index] = updated;
    localStorage.setItem("apresi_employees", JSON.stringify(employees));

    showToast("Profil berhasil diperbarui!", "success");
    updateUserProfileUI();
    injectEmployeeSelector();
    renderPublicDashboard();
}

// Render Public Board Status Kehadiran Aparat
function renderPublicDashboard() {
    const grid = document.getElementById("public-aparat-grid");
    if (!grid) return;

    grid.innerHTML = "";

    const today = new Date().toISOString().split("T")[0];
    const todayLogs = attendanceLogs.filter(l => l.date === today);

    employees.forEach(emp => {
        const log = todayLogs.find(l => l.employee_id === emp.id);

        let statusText = "Belum Hadir";
        let statusClass = "badge-belum-glow";
        let detailHtml = `<p style="font-size: 0.75rem; color: var(--text-secondary);">Masuk: -</p>`;

        if (log) {
            if (log.type === "WFO") {
                statusText = "Di Kantor";
                statusClass = "badge-wfo-glow";
                detailHtml = `
                    <p style="font-size: 0.75rem; color: var(--success); font-weight:600;">Masuk: ${log.check_in_time}</p>
                    <p style="font-size: 0.7rem; color: var(--text-secondary); white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">Status: ${log.status}</p>
                `;
            } else if (log.type === "WFH") {
                statusText = "Dinas Luar";
                statusClass = "badge-wfh-glow";
                // extract location name
                const locMatch = log.detail.match(/Lokasi:\s*([^)]+)/);
                const locName = locMatch ? locMatch[1] : "Dinas Luar";
                detailHtml = `
                    <p style="font-size: 0.75rem; color: #818cf8; font-weight:600;">Masuk: ${log.check_in_time}</p>
                    <p style="font-size: 0.7rem; color: var(--text-secondary); white-space:nowrap; text-overflow:ellipsis; overflow:hidden;" title="${locName}">Tempat: ${locName}</p>
                `;
            } else if (log.type === "ABSEN") {
                // extract leave reason
                const reasonMatch = log.detail.match(/Izin:\s*([^(]+)/);
                const reason = reasonMatch ? reasonMatch[1].trim() : "Izin";
                statusText = `Tidak Hadir (${reason})`;
                statusClass = "badge-absen-glow";
                detailHtml = `
                    <p style="font-size: 0.75rem; color: var(--warning); font-weight:600;">Status: Izin Kerja</p>
                    <p style="font-size: 0.7rem; color: var(--text-secondary); white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">Detail: ${reason}</p>
                `;
            }
        }

        const avatarSrc = emp.avatar_url || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=60";
        
        grid.innerHTML += `
            <div class="aparat-card">
                <img src="${avatarSrc}" class="aparat-avatar" alt="${emp.name}">
                <div class="aparat-info">
                    <h3 class="aparat-name" title="${emp.name}">${emp.name}</h3>
                    <p class="aparat-role-text" title="${emp.role}">${emp.role} (${emp.department})</p>
                    <div style="margin-bottom: 5px;">
                        <span class="badge ${statusClass}" style="font-size:0.7rem; padding:0.15rem 0.5rem;">${statusText}</span>
                    </div>
                    ${detailHtml}
                </div>
            </div>
        `;
    });
}

// Admin Panel Code
function renderAdminLogs() {
    const tbody = document.getElementById("admin-logs-body");
    tbody.innerHTML = "";

    const query = document.getElementById("search-employee").value.toLowerCase();
    const typeFilter = document.getElementById("filter-presence-type").value;

    const filtered = attendanceLogs.filter(log => {
        const matchName = log.name.toLowerCase().includes(query);
        const matchType = typeFilter === "ALL" || log.type === typeFilter;
        return matchName && matchType;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-secondary);">Tidak ada data presensi cocok.</td></tr>`;
        return;
    }

    filtered.forEach(log => {
        let typeBadge = `<span class="badge badge-wfo">WFO</span>`;
        if (log.type === "WFH") typeBadge = `<span class="badge badge-wfh">WFH</span>`;
        if (log.type === "ABSEN") typeBadge = `<span class="badge badge-absen">Izin</span>`;

        let statusClass = "stat-footer up";
        if (log.status === "Terlambat") statusClass = "stat-footer down";
        if (log.status === "Izin") statusClass = "stat-footer";

        const emp = employees.find(e => e.id === log.employee_id);
        const avatarSrc = log.photo_data || (emp ? emp.avatar_url : "") || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=50";

        tbody.innerHTML += `
            <tr>
                <td><img src="${avatarSrc}" style="width: 35px; height: 35px; border-radius: 50%; object-fit: cover; border: 1px solid var(--card-border);"></td>
                <td><strong>${log.name}</strong></td>
                <td>${formatDateIndo(log.date)}</td>
                <td>${typeBadge}</td>
                <td>${log.check_in_time || '-'}</td>
                <td>${log.check_out_time || '-'}</td>
                <td style="font-size: 0.8rem; max-width: 250px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" title="${log.detail}">${log.detail}</td>
                <td><span class="${statusClass}">${log.status}</span></td>
            </tr>
        `;
    });
}

function filterAdminLogs() {
    renderAdminLogs();
}

function updateAdminStats() {
    document.getElementById("admin-total-emp").textContent = employees.length;

    const today = new Date().toISOString().split("T")[0];
    const todayLogs = attendanceLogs.filter(l => l.date === today);

    const wfoCount = todayLogs.filter(l => l.type === "WFO").length;
    const wfhCount = todayLogs.filter(l => l.type === "WFH").length;
    const absentCount = todayLogs.filter(l => l.type === "ABSEN").length;

    document.getElementById("admin-total-wfo").textContent = wfoCount;
    document.getElementById("admin-total-wfh").textContent = wfhCount;
    document.getElementById("admin-total-absent").textContent = absentCount;
}

// Register New Employee
async function registerNewEmployee() {
    const nikInput = document.getElementById("new-emp-nik");
    const nameInput = document.getElementById("new-emp-name");
    const roleInput = document.getElementById("new-emp-role");
    const deptInput = document.getElementById("new-emp-dept");

    const nik = nikInput.value.trim();
    const name = nameInput.value.trim();
    const role = roleInput.value.trim();
    const department = deptInput.value;

    if (!nik || !name || !role) {
        showToast("Harap lengkapi semua kolom!", "error");
        return;
    }

    const newEmp = {
        id: "emp-" + Date.now(),
        nik: nik,
        name: name,
        role: role,
        department: department,
        email: `${name.toLowerCase().replace(/\s+/g, '.')}@apresi.local`,
        avatar_url: ""
    };

    let pushSuccess = false;
    if (supabaseClient) {
        try {
            const { error } = await supabaseClient.from('employees').insert([newEmp]);
            if (!error) pushSuccess = true;
        } catch (e) {
            console.error("Gagal daftar karyawan baru di Supabase:", e);
        }
    }

    employees.push(newEmp);
    localStorage.setItem("apresi_employees", JSON.stringify(employees));

    nikInput.value = "";
    nameInput.value = "";
    roleInput.value = "";

    injectEmployeeSelector();
    updateAdminStats();
    renderPublicDashboard();
    showToast(`Staf ${name} berhasil didaftarkan!`, "success");
}

// SheetJS Excel Export
function exportToExcel() {
    if (!isCurrentUserAdmin()) {
        showToast("Akses ditolak! Fitur hanya untuk Admin.", "error");
        return;
    }

    if (attendanceLogs.length === 0) {
        showToast("Belum ada log presensi untuk diekspor!", "warning");
        return;
    }

    try {
        // Format log data for worksheet
        const excelData = attendanceLogs.map((log, index) => {
            const emp = employees.find(e => e.id === log.employee_id);
            return {
                "No": index + 1,
                "NIK": emp ? emp.nik : "",
                "Nama Aparatur": log.name,
                "Departemen/Bidang": emp ? emp.department : "",
                "Tanggal": formatDateIndo(log.date),
                "Tipe Presensi": log.type,
                "Jam Masuk": log.check_in_time || "",
                "Jam Keluar": log.check_out_time || "",
                "Status": log.status,
                "Durasi Kerja (Jam)": log.working_hours || 0,
                "Keterangan/Detail": log.detail
            };
        });

        // Create sheet & workbook
        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Kehadiran");

        // Format column widths nicely
        const max_len = [5, 12, 25, 20, 15, 15, 12, 12, 12, 18, 35];
        worksheet["!cols"] = max_len.map(w => ({ wch: w }));

        // Download Excel
        XLSX.writeFile(workbook, `Laporan_Presensi_Aparat_${new Date().toISOString().split("T")[0]}.xlsx`);
        showToast("Laporan Excel berhasil diunduh!", "success");
    } catch (e) {
        console.error("Gagal mengekspor Excel:", e);
        showToast("Gagal mengekspor file Excel!", "error");
    }
}

// CSV Export
function exportToCSV() {
    if (!isCurrentUserAdmin()) {
        showToast("Akses ditolak! Fitur hanya untuk Admin.", "error");
        return;
    }

    if (attendanceLogs.length === 0) {
        showToast("Belum ada log presensi untuk diekspor!", "warning");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID Karyawan,Nama Karyawan,Tanggal,Tipe Presensi,Check In,Check Out,Status,Durasi Kerja (Jam),Detail\n";

    attendanceLogs.forEach(log => {
        const row = [
            log.employee_id,
            `"${log.name}"`,
            log.date,
            log.type,
            log.check_in_time || "",
            log.check_out_time || "",
            log.status,
            log.working_hours || 0,
            `"${log.detail.replace(/"/g, '""')}"`
        ];
        csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `rekap_presensi_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);

    link.click();
    document.body.removeChild(link);
    showToast("File CSV berhasil diekspor!", "success");
}

// Notifications
function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    let icon = ``;
    if (type === "success") icon = `✔️`;
    if (type === "error") icon = `❌`;
    if (type === "warning") icon = `⚠️`;

    toast.innerHTML = `<span>${icon} ${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = "toastIn 0.3s reverse forwards";
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Helpers
function formatDateIndo(dateStr) {
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', options);
}
