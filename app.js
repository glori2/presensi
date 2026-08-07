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
    { id: "emp-3", nik: "NIK202603", name: "Siti Aminah", role: "Staf Administrasi", department: "Sekretariat", email: "siti.a@apresi.local", avatar_url: "" },
    { id: "emp-1786005897894", nik: "3401010808880002", name: "Muh Masruri Mustofa", role: "Super Admin", department: "Admin", email: "masruri@kalidengen.go.id", avatar_url: "" }
];
let attendanceLogs = [];
let dailyJournals = [];
let currentEmployeeId = "emp-1";
let clockInterval = null;
let webcamStream = null;
let editingEmployeeId = null;

// Office coordinates & radius configuration (Yogyakarta / Central Java - Kalurahan Kalidengen)
let OFFICE_LAT = -7.891848418181234;
let OFFICE_LNG = 110.08084144673063;
let MAX_RADIUS_METERS = 100;
let latestDistance = null;

// Initialize on DOM load
window.addEventListener("DOMContentLoaded", async () => {
    startClock();
    loadOfficeConfigFromStorage();
    await loadInitialData();
    injectEmployeeSelector();
    updateUserProfileUI();
    syncUIState();
    switchView('public'); // Default view
});

// Load coordinates config from storage
function loadOfficeConfigFromStorage() {
    if (localStorage.getItem("apresi_config")) {
        const config = JSON.parse(localStorage.getItem("apresi_config"));
        OFFICE_LAT = parseFloat(config.lat);
        OFFICE_LNG = parseFloat(config.lng);
        MAX_RADIUS_METERS = parseInt(config.radius);
    }
    // Populate config fields
    const latField = document.getElementById("config-lat");
    const lngField = document.getElementById("config-lng");
    const radiusField = document.getElementById("config-radius");
    if (latField) latField.value = OFFICE_LAT;
    if (lngField) lngField.value = OFFICE_LNG;
    if (radiusField) radiusField.value = MAX_RADIUS_METERS;
}

// Save Office Config
function saveOfficeConfig() {
    const lat = parseFloat(document.getElementById("config-lat").value);
    const lng = parseFloat(document.getElementById("config-lng").value);
    const radius = parseInt(document.getElementById("config-radius").value);

    if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
        showToast("Koordinat dan radius tidak valid!", "error");
        return;
    }

    OFFICE_LAT = lat;
    OFFICE_LNG = lng;
    MAX_RADIUS_METERS = radius;

    localStorage.setItem("apresi_config", JSON.stringify({ lat, lng, radius }));
    showToast("Konfigurasi kantor berhasil disimpan!", "success");
    getCurrentGPS(); // Recalculate
}

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
                    await supabaseClient.from('employees').insert(employees);
                }
                supabaseSuccess = true;
            }

            // Load Logs
            const { data: dbLogs, error: logErr } = await supabaseClient.from('attendance_logs').select('*').order('created_at', { ascending: false });
            if (!logErr && dbLogs) {
                attendanceLogs = dbLogs;
                supabaseSuccess = true;
            }

            // Load Journals
            const { data: dbJournals, error: jnErr } = await supabaseClient.from('daily_journals').select('*').order('created_at', { ascending: false });
            if (!jnErr && dbJournals) {
                dailyJournals = dbJournals;
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

        if (localStorage.getItem("apresi_journals")) {
            dailyJournals = JSON.parse(localStorage.getItem("apresi_journals"));
        } else {
            localStorage.setItem("apresi_journals", JSON.stringify(dailyJournals));
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
        if (clockEl) clockEl.textContent = now.toLocaleTimeString('id-ID', { hour12: false });
        if (dateEl) dateEl.textContent = now.toLocaleDateString('id-ID', optionsDate);
    }
    update();
    clockInterval = setInterval(update, 1000);
}

// Check Admin role
function isCurrentUserAdmin() {
    const current = getCurrentEmployee();
    if (!current) return false;
    
    // Explicit Super Admin authorization for Muh Masruri Mustofa
    if (current.nik === "3401010808880002" || current.name.toLowerCase().includes("masruri")) {
        return true;
    }
    
    const role = (current.role || "").toLowerCase();
    const dept = (current.department || "").toLowerCase();
    return role.includes("admin") || role.includes("kepala") || dept.includes("admin");
}

// SPA Navigation
function switchView(viewName) {
    stopCameraStream();

    if (viewName === 'admin') {
        if (!isCurrentUserAdmin()) {
            showToast("Akses ditolak! Menu Admin hanya untuk Kepala Kantor / Admin.", "error");
            switchView('public');
            return;
        }
        
        // Check PIN protection
        if (sessionStorage.getItem("apresi_admin_unlocked") !== "true") {
            document.getElementById("admin-password-modal").style.display = "flex";
            document.getElementById("admin-pin-input").value = "";
            document.getElementById("admin-pin-input").focus();
            return;
        }
    }

    document.querySelectorAll(".view-panel").forEach(panel => panel.classList.remove("active"));
    document.querySelectorAll(".sidebar .nav-item").forEach(item => item.classList.remove("active"));

    const employee = getCurrentEmployee();

    if (viewName === "public") {
        document.getElementById("view-public").classList.add("active");
        document.getElementById("nav-public").classList.add("active");
        document.getElementById("welcome-message").textContent = "Dashboard Kinerja & Kehadiran Pamong";
        document.getElementById("welcome-subtext").textContent = "Monitor status kehadiran seluruh aparatur hari ini.";
        renderPublicDashboard();
    } else if (viewName === "employee") {
        document.getElementById("view-employee").classList.add("active");
        document.getElementById("nav-employee").classList.add("active");
        document.getElementById("welcome-message").textContent = `Selamat Datang, ${employee.name}!`;
        document.getElementById("welcome-subtext").textContent = "Kelola kehadiran dan laporkan aktivitas harian Anda.";
        switchEmployeeSubtab('presensi');
        // Reset subtab selectors
        document.querySelector('input[name="emp_subtab"][value="presensi"]').checked = true;
    } else if (viewName === "profile") {
        document.getElementById("view-profile").classList.add("active");
        document.getElementById("nav-profile").classList.add("active");
        document.getElementById("welcome-message").textContent = "Profil Saya";
        document.getElementById("welcome-subtext").textContent = "Lengkapi detail identitas diri Anda di sini.";
        loadProfileForm();
    } else if (viewName === "admin") {
        document.getElementById("view-admin").classList.add("active");
        document.getElementById("nav-admin").classList.add("active");
        document.getElementById("welcome-message").textContent = "Panel Admin Lurah / Carik";
        document.getElementById("welcome-subtext").textContent = "Persetujuan kinerja dan evaluasi TPP Pamong Kalidengen.";
        switchAdminSubtab('monitoring');
        // Reset subtab selectors
        document.querySelector('input[name="admin_subtab"][value="monitoring"]').checked = true;
    }
}

// Admin PIN Verification
function verifyAdminPIN() {
    const pin = document.getElementById("admin-pin-input").value;
    if (pin === "admin123") {
        sessionStorage.setItem("apresi_admin_unlocked", "true");
        document.getElementById("admin-password-modal").style.display = "none";
        showToast("PIN Berhasil Diverifikasi! Akses Panel Admin dibuka.", "success");
        switchView("admin");
    } else {
        showToast("PIN Admin salah!", "error");
        document.getElementById("admin-pin-input").value = "";
        document.getElementById("admin-pin-input").focus();
    }
}

function closeAdminPINModal() {
    document.getElementById("admin-password-modal").style.display = "none";
    switchView("public");
}

// Switch Employee sub-tabs
function switchEmployeeSubtab(tabName) {
    document.querySelectorAll(".employee-subtab-panel").forEach(panel => panel.style.display = "none");
    
    if (tabName === 'presensi') {
        document.getElementById("emp-subtab-presensi").style.display = "block";
        checkTodayAttendanceState();
        getCurrentGPS();
    } else if (tabName === 'jurnal') {
        document.getElementById("emp-subtab-jurnal").style.display = "block";
        // Set default date for journal input as today
        document.getElementById("journal-date").value = new Date().toISOString().split("T")[0];
        renderPersonalJournals();
    }
}

// Switch Admin sub-tabs
function switchAdminSubtab(tabName) {
    document.querySelectorAll(".admin-subtab-panel").forEach(panel => panel.style.display = "none");

    if (tabName === 'monitoring') {
        document.getElementById("admin-subtab-monitoring").style.display = "block";
        updateAdminStats();
        renderAdminLogs();
        renderAdminEmployeeManageList();
    } else if (tabName === 'persetujuan') {
        document.getElementById("admin-subtab-persetujuan").style.display = "block";
        renderAdminApprovalList();
    } else if (tabName === 'tukin') {
        document.getElementById("admin-subtab-tukin").style.display = "block";
        renderTukinCalculation();
    } else if (tabName === 'konfigurasi') {
        document.getElementById("admin-subtab-konfigurasi").style.display = "block";
        loadOfficeConfigFromStorage();
    }
}

// User Profile management
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

    const adminNav = document.getElementById("nav-admin");
    if (isCurrentUserAdmin()) {
        adminNav.style.display = "block";
    } else {
        adminNav.style.display = "none";
        if (document.getElementById("view-admin").classList.contains("active")) {
            switchView('public');
        }
    }
}

function injectEmployeeSelector() {
    const consoleCard = document.querySelector("#emp-subtab-presensi .attendance-console");
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
    sessionStorage.removeItem("apresi_admin_unlocked");
    updateUserProfileUI();
    syncUIState();
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

    if (!coordsInput) return;

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
            coordsInput.value = `${OFFICE_LAT.toFixed(6)}, ${OFFICE_LNG.toFixed(6)} (Lokasi Kantor - GPS Mati)`;
            distanceHint.textContent = "Gagal memindai lokasi. Memakai koordinat kantor.";
            distanceHint.style.color = 'var(--warning)';
            latestDistance = 0; // Bypass warning for local demo if GPS fails
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// Work Schedule Constraints (Luar Ramadan)
function getPresenceTimeConfig() {
    const now = new Date();
    const day = now.getDay(); 
    
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

// Check Presence State & Lock
function checkTodayAttendanceState() {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const logToday = attendanceLogs.find(l => l.employee_id === currentEmployeeId && l.date === today);

    const btnCheckin = document.getElementById("btn-checkin");
    const btnCheckout = document.getElementById("btn-checkout");
    const timeConfig = getPresenceTimeConfig();

    if (!btnCheckin) return;

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
        const [inHStart, inMStart] = timeConfig.inStart.split(":").map(Number);
        const [inHEnd, inMEnd] = timeConfig.inEnd.split(":").map(Number);
        const curH = now.getHours();
        const curM = now.getMinutes();

        const isCheckinOpen = (curH > inHStart || (curH === inHStart && curM >= inMStart)) &&
                             (curH < inHEnd || (curH === inHEnd && curM <= inMEnd));

        btnCheckin.style.display = "block";
        btnCheckout.style.display = "none";
        togglePresenceTypeInputs();

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
    if (scannerLine) scannerLine.style.display = "block";
    if (faceOverlay) faceOverlay.style.display = "flex";

    setTimeout(async () => {
        if (scannerLine) scannerLine.style.display = "none";
        if (faceOverlay) faceOverlay.style.display = "none";

        const now = new Date();
        const checkInTimeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        
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
            const task = document.getElementById("wfh-notes").value || "Dinas Luar";
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

// Submit Daily Activity Journal
async function submitDailyJournal() {
    const date = document.getElementById("journal-date").value;
    const activity = document.getElementById("journal-activity").value.trim();
    const target = document.getElementById("journal-target").value.trim();
    const realization = document.getElementById("journal-realization").value.trim();
    const duration = parseFloat(document.getElementById("journal-duration").value);

    if (!date || !activity || !target || !realization || isNaN(duration)) {
        showToast("Harap isi semua kolom jurnal aktivitas!", "error");
        return;
    }

    const employee = getCurrentEmployee();
    const newJournal = {
        id: "jr-" + Date.now(),
        employee_id: employee.id,
        employee_name: employee.name,
        date: date,
        activity: activity,
        target: target,
        realization: realization,
        duration: duration,
        status: "Pending",
        approver_note: ""
    };

    let pushSuccess = false;
    if (supabaseClient) {
        try {
            const { error } = await supabaseClient.from('daily_journals').insert([newJournal]);
            if (!error) pushSuccess = true;
        } catch (e) {
            console.error("Gagal mengirim jurnal ke Supabase:", e);
        }
    }

    dailyJournals.unshift(newJournal);
    localStorage.setItem("apresi_journals", JSON.stringify(dailyJournals));

    // Reset inputs
    document.getElementById("journal-activity").value = "";
    document.getElementById("journal-target").value = "";
    document.getElementById("journal-realization").value = "";
    document.getElementById("journal-duration").value = "";

    showToast("Jurnal aktivitas berhasil dikirim! Menunggu persetujuan Carik/Lurah.", "success");
    syncUIState();
    renderPersonalJournals();
}

// Render Personal Journals List
function renderPersonalJournals() {
    const tbody = document.getElementById("personal-journal-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const userJournals = dailyJournals.filter(j => j.employee_id === currentEmployeeId);

    if (userJournals.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">Belum ada laporan jurnal aktivitas.</td></tr>`;
        return;
    }

    userJournals.forEach(j => {
        let statusBadge = `<span class="badge badge-checkout">Pending</span>`;
        if (j.status === "Disetujui") statusBadge = `<span class="badge badge-wfh">Disetujui</span>`;
        if (j.status === "Ditolak") statusBadge = `<span class="badge badge-absen" style="background:rgba(239,68,68,0.15); color:#f87171; border-color:#f87171;">Ditolak</span>`;

        const titleNote = j.approver_note ? `title="Catatan: ${j.approver_note}"` : '';

        tbody.innerHTML += `
            <tr ${titleNote}>
                <td>${formatDateIndo(j.date)}</td>
                <td>${j.activity}</td>
                <td>${j.realization} / ${j.target}</td>
                <td>${j.duration} Jam</td>
                <td>${statusBadge}</td>
            </tr>
        `;
    });
}

// Render Admin Journal Approvals Tab
function renderAdminApprovalList() {
    const tbody = document.getElementById("admin-approval-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const pendings = dailyJournals.filter(j => j.status === "Pending");

    if (pendings.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">Tidak ada pengajuan jurnal pending.</td></tr>`;
        return;
    }

    pendings.forEach(j => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${j.employee_name}</strong></td>
                <td>${formatDateIndo(j.date)}</td>
                <td>${j.activity}</td>
                <td>${j.target}</td>
                <td>${j.realization}</td>
                <td>${j.duration} Jam</td>
                <td>
                    <div style="display:flex; gap: 5px;">
                        <button class="btn btn-success" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;" onclick="approveJournal('${j.id}')">Setujui</button>
                        <button class="btn btn-danger" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;" onclick="rejectJournal('${j.id}')">Tolak</button>
                    </div>
                </td>
            </tr>
        `;
    });
}

async function approveJournal(id) {
    const index = dailyJournals.findIndex(j => j.id === id);
    if (index === -1) return;

    dailyJournals[index].status = "Disetujui";
    
    if (supabaseClient) {
        try {
            await supabaseClient.from('daily_journals').update({ status: "Disetujui" }).eq('id', id);
        } catch (e) { console.error(e); }
    }

    localStorage.setItem("apresi_journals", JSON.stringify(dailyJournals));
    showToast("Jurnal aktivitas disetujui!", "success");
    syncUIState();
    renderAdminApprovalList();
}

async function rejectJournal(id) {
    const note = prompt("Masukkan alasan penolakan:");
    const index = dailyJournals.findIndex(j => j.id === id);
    if (index === -1) return;

    dailyJournals[index].status = "Ditolak";
    dailyJournals[index].approver_note = note || "Ditolak atasan";

    if (supabaseClient) {
        try {
            await supabaseClient.from('daily_journals').update({ status: "Ditolak", approver_note: note || "Ditolak atasan" }).eq('id', id);
        } catch (e) { console.error(e); }
    }

    localStorage.setItem("apresi_journals", JSON.stringify(dailyJournals));
    showToast("Jurnal aktivitas ditolak.", "warning");
    syncUIState();
    renderAdminApprovalList();
}

// TPP/Tukin Calculator (Formula: Rp 1.500.000 max. Kehadiran 70%, Jurnal Kinerja 30%. Potongan keterlambatan Rp 25.000/hari)
function renderTukinCalculation() {
    const tbody = document.getElementById("admin-tukin-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const baseTukin = 1500000;

    employees.forEach(emp => {
        const empLogs = attendanceLogs.filter(l => l.employee_id === emp.id);
        const empJournals = dailyJournals.filter(j => j.employee_id === emp.id && j.status === "Disetujui");

        const presentDays = empLogs.filter(l => l.type === "WFO" || l.type === "WFH").length;
        const lateDays = empLogs.filter(l => l.status === "Terlambat").length;
        const totalDuration = empJournals.reduce((sum, j) => sum + (j.duration || 0), 0);

        // Attendance ratio (based on standard 22 work days/month)
        const attendanceRate = Math.min((presentDays / 22), 1);
        
        // Journal score (standard target 80 hours work/month)
        const journalRate = Math.min((totalDuration / 80), 1);

        // Calculations
        const attendanceComponent = baseTukin * 0.70 * attendanceRate;
        const journalComponent = baseTukin * 0.30 * journalRate;
        const lateDeduction = lateDays * 25000;

        const tukinClean = Math.max(Math.round(attendanceComponent + journalComponent - lateDeduction), 0);

        tbody.innerHTML += `
            <tr>
                <td><strong>${emp.name}</strong><br><small style="color:var(--text-secondary);">${emp.role}</small></td>
                <td>${presentDays} Hari</td>
                <td style="color: ${lateDays > 0 ? 'var(--danger)' : 'var(--text-secondary)'};">${lateDays} Hari</td>
                <td>${totalDuration} Jam</td>
                <td>${Math.round(attendanceRate * 100)}%</td>
                <td>${Math.round(journalRate * 100)}%</td>
                <td style="color: var(--success); font-weight:700;">Rp ${tukinClean.toLocaleString('id-ID')}</td>
            </tr>
        `;
    });
}

// Export Tukin to Excel
function exportTukinExcel() {
    if (employees.length === 0) {
        showToast("Tidak ada data pamong untuk diekspor!", "warning");
        return;
    }

    try {
        const baseTukin = 1500000;
        const excelData = employees.map((emp, index) => {
            const empLogs = attendanceLogs.filter(l => l.employee_id === emp.id);
            const empJournals = dailyJournals.filter(j => j.employee_id === emp.id && j.status === "Disetujui");

            const presentDays = empLogs.filter(l => l.type === "WFO" || l.type === "WFH").length;
            const lateDays = empLogs.filter(l => l.status === "Terlambat").length;
            const totalDuration = empJournals.reduce((sum, j) => sum + (j.duration || 0), 0);

            const attendanceRate = Math.min((presentDays / 22), 1);
            const journalRate = Math.min((totalDuration / 80), 1);

            const attendanceComponent = baseTukin * 0.70 * attendanceRate;
            const journalComponent = baseTukin * 0.30 * journalRate;
            const lateDeduction = lateDays * 25000;
            const tukinClean = Math.max(Math.round(attendanceComponent + journalComponent - lateDeduction), 0);

            return {
                "No": index + 1,
                "NIK": emp.nik,
                "Nama Pamong": emp.name,
                "Jabatan": emp.role,
                "Hari Hadir": presentDays,
                "Hari Terlambat": lateDays,
                "Total Jam Kerja Jurnal (Approved)": totalDuration,
                "Rasio Kehadiran (%)": Math.round(attendanceRate * 100),
                "Rasio Kinerja Jurnal (%)": Math.round(journalRate * 100),
                "Potongan Terlambat (Rp)": lateDeduction,
                "Rekomendasi Tukin Bersih (Rp)": tukinClean
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Perhitungan TPP Pamong");

        const widths = [5, 12, 25, 20, 12, 15, 30, 20, 20, 22, 25];
        worksheet["!cols"] = widths.map(w => ({ wch: w }));

        XLSX.writeFile(workbook, `Rekap_Tukin_Pamong_Kalidengen_${new Date().toISOString().split("T")[0]}.xlsx`);
        showToast("Laporan Excel Tukin berhasil diunduh!", "success");
    } catch (e) {
        console.error(e);
        showToast("Gagal mengekspor data TPP!", "error");
    }
}

// Sync UI States
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
    if (!tbody) return;
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
    
    const rateEl = document.getElementById("stat-attendance-rate");
    const hoursEl = document.getElementById("stat-hours");
    const ontimeEl = document.getElementById("stat-ontime");

    if (rateEl) rateEl.textContent = `${rate}%`;

    const totalHours = userLogs.reduce((acc, log) => acc + (log.working_hours || 0), 0);
    if (hoursEl) hoursEl.textContent = `${totalHours.toFixed(1)}h`;

    const onTimeCount = userLogs.filter(l => l.status === "Tepat Waktu").length;
    if (ontimeEl) ontimeEl.textContent = onTimeCount;
}

// Load Staff Profile Detail
function loadProfileForm() {
    const current = getCurrentEmployee();
    document.getElementById("profile-nik").value = current.nik || "BELUM DISKEMA";
    document.getElementById("profile-fullname").value = current.name;
    document.getElementById("profile-designation").value = current.role;
    document.getElementById("profile-department").value = current.department || "Sekretariat";
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
                const locMatch = log.detail.match(/Lokasi:\s*([^)]+)/);
                const locName = locMatch ? locMatch[1] : "Dinas Luar";
                detailHtml = `
                    <p style="font-size: 0.75rem; color: #818cf8; font-weight:600;">Masuk: ${log.check_in_time}</p>
                    <p style="font-size: 0.7rem; color: var(--text-secondary); white-space:nowrap; text-overflow:ellipsis; overflow:hidden;" title="${locName}">Tempat: ${locName}</p>
                `;
            } else if (log.type === "ABSEN") {
                const reasonMatch = log.detail.match(/Izin:\s*([^(]+)/);
                const reason = reasonMatch ? reasonMatch[1].trim() : "Izin";
                statusText = `Izin (${reason})`;
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

// Admin Panel logs
function renderAdminLogs() {
    const tbody = document.getElementById("admin-logs-body");
    if (!tbody) return;
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
    const totalEmpEl = document.getElementById("admin-total-emp");
    const totalWfoEl = document.getElementById("admin-total-wfo");
    const totalWfhEl = document.getElementById("admin-total-wfh");
    const totalAbsentEl = document.getElementById("admin-total-absent");

    if (totalEmpEl) totalEmpEl.textContent = employees.length;

    const today = new Date().toISOString().split("T")[0];
    const todayLogs = attendanceLogs.filter(l => l.date === today);

    const wfoCount = todayLogs.filter(l => l.type === "WFO").length;
    const wfhCount = todayLogs.filter(l => l.type === "WFH").length;
    const absentCount = todayLogs.filter(l => l.type === "ABSEN").length;

    if (totalWfoEl) totalWfoEl.textContent = wfoCount;
    if (totalWfhEl) totalWfhEl.textContent = wfhCount;
    if (totalAbsentEl) totalAbsentEl.textContent = absentCount;
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

    if (editingEmployeeId !== null) {
        // Edit Mode
        const empIndex = employees.findIndex(e => e.id === editingEmployeeId);
        if (empIndex === -1) return;

        const updatedEmp = {
            ...employees[empIndex],
            nik: nik,
            name: name,
            role: role,
            department: department,
            email: `${name.toLowerCase().replace(/\s+/g, '.')}@kalidengen.go.id`
        };

        if (supabaseClient) {
            try {
                await supabaseClient.from('employees').update({
                    nik: nik,
                    name: name,
                    role: role,
                    department: department,
                    email: updatedEmp.email
                }).eq('id', editingEmployeeId);
            } catch (e) {
                console.error("Gagal update pamong di Supabase:", e);
            }
        }

        employees[empIndex] = updatedEmp;
        localStorage.setItem("apresi_employees", JSON.stringify(employees));

        // Reset edit states
        editingEmployeeId = null;
        document.getElementById("new-employee-form-title").textContent = "Registrasi Pamong Baru";
        document.getElementById("new-employee-submit-btn").textContent = "Tambah Karyawan";
        showToast(`Data Pamong "${name}" berhasil diubah!`, "success");
    } else {
        // Insert Mode
        const newEmp = {
            id: "emp-" + Date.now(),
            nik: nik,
            name: name,
            role: role,
            department: department,
            email: `${name.toLowerCase().replace(/\s+/g, '.')}@kalidengen.go.id`,
            avatar_url: ""
        };

        if (supabaseClient) {
            try {
                await supabaseClient.from('employees').insert([newEmp]);
            } catch (e) {
                console.error("Gagal daftar pamong baru di Supabase:", e);
            }
        }

        employees.push(newEmp);
        localStorage.setItem("apresi_employees", JSON.stringify(employees));
        showToast(`Pamong ${name} berhasil didaftarkan!`, "success");
    }

    // Reset Form Fields
    nikInput.value = "";
    nameInput.value = "";
    roleInput.value = "";

    injectEmployeeSelector();
    updateAdminStats();
    renderPublicDashboard();
    renderAdminEmployeeManageList();
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
        const excelData = attendanceLogs.map((log, index) => {
            const emp = employees.find(e => e.id === log.employee_id);
            return {
                "No": index + 1,
                "NIK": emp ? emp.nik : "",
                "Nama Pamong": log.name,
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

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Kehadiran");

        const max_len = [5, 12, 25, 20, 15, 15, 12, 12, 12, 18, 35];
        worksheet["!cols"] = max_len.map(w => ({ wch: w }));

        XLSX.writeFile(workbook, `Laporan_Kehadiran_Pamong_${new Date().toISOString().split("T")[0]}.xlsx`);
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

// Render Employee Management List inside Panel Admin
function renderAdminEmployeeManageList() {
    const tbody = document.getElementById("admin-employee-manage-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (employees.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">Tidak ada data pamong.</td></tr>`;
        return;
    }

    employees.forEach(emp => {
        const isSelf = emp.id === currentEmployeeId;
        const deleteButton = isSelf 
            ? `<span style="font-size:0.75rem; color:var(--text-secondary); font-style:italic;">Sedang Aktif</span>`
            : `<button class="btn btn-danger" style="padding: 0.25rem 0.6rem; font-size: 0.75rem; background: var(--danger);" onclick="deleteEmployee('${emp.id}')">Hapus</button>`;
        const editButton = `<button class="btn btn-primary" style="padding: 0.25rem 0.6rem; font-size: 0.75rem; background: #3b82f6; margin-right: 5px;" onclick="editEmployeeInline('${emp.id}')">Ubah</button>`;

        tbody.innerHTML += `
            <tr>
                <td><strong>${emp.name}</strong></td>
                <td>${emp.nik}</td>
                <td>${emp.role}</td>
                <td>${emp.department}</td>
                <td>
                    ${editButton}
                    ${deleteButton}
                </td>
            </tr>
        `;
    });
}

// Delete Employee Action
async function deleteEmployee(empId) {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;

    if (empId === currentEmployeeId) {
        showToast("Anda tidak bisa menghapus akun yang sedang Anda gunakan!", "error");
        return;
    }

    const confirmDelete = confirm(`Apakah Anda yakin ingin menghapus pamong "${emp.name}"? Semua data presensi pamong ini juga akan terhapus dari sistem.`);
    if (!confirmDelete) return;

    // Delete from Supabase
    let deleteSuccess = false;
    if (supabaseClient) {
        try {
            // Delete logs first
            await supabaseClient.from('attendance_logs').delete().eq('employee_id', empId);
            // Delete journals
            await supabaseClient.from('daily_journals').delete().eq('employee_id', empId);
            // Delete employee record
            const { error } = await supabaseClient.from('employees').delete().eq('id', empId);
            if (!error) deleteSuccess = true;
        } catch (e) {
            console.error("Gagal menghapus pamong di Supabase:", e);
        }
    }

    // Filter local memory arrays
    employees = employees.filter(e => e.id !== empId);
    attendanceLogs = attendanceLogs.filter(l => l.employee_id !== empId);
    dailyJournals = dailyJournals.filter(j => j.employee_id !== empId);

    // Update LocalStorage
    localStorage.setItem("apresi_employees", JSON.stringify(employees));
    localStorage.setItem("apresi_logs", JSON.stringify(attendanceLogs));
    localStorage.setItem("apresi_journals", JSON.stringify(dailyJournals));

    showToast(`Pamong "${emp.name}" berhasil dihapus dari sistem!`, "success");
    
    // Reset editing if the deleted employee was being edited
    if (editingEmployeeId === empId) {
        editingEmployeeId = null;
        document.getElementById("new-employee-form-title").textContent = "Registrasi Pamong Baru";
        document.getElementById("new-employee-submit-btn").textContent = "Tambah Karyawan";
    }

    // Refresh Dropdowns and Lists
    injectEmployeeSelector();
    updateAdminStats();
    renderPublicDashboard();
    renderAdminEmployeeManageList();
}

// Prefill form for inline employee editing
function editEmployeeInline(empId) {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;

    editingEmployeeId = empId;

    // Fill form
    document.getElementById("new-emp-nik").value = emp.nik;
    document.getElementById("new-emp-name").value = emp.name;
    document.getElementById("new-emp-role").value = emp.role;
    document.getElementById("new-emp-dept").value = emp.department;

    // Change Form Visual Mode to Edit
    document.getElementById("new-employee-form-title").textContent = "Ubah Data Pamong: " + emp.name;
    document.getElementById("new-employee-submit-btn").textContent = "Simpan Perubahan";
    document.getElementById("new-emp-nik").focus();

    showToast(`Mode edit diaktifkan untuk: ${emp.name}`, "info");
}
