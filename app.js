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
    { id: "emp-2", nik: "3401010101590001", name: "Sunardi", role: "Lurah || Laki-laki || - || - || user", department: "Pimpinan", email: "sunardi@kalidengen.go.id", password: "password123", avatar_url: "" },
    { id: "emp-1", nik: "3401010808880002", name: "Muh. Masruri Mustofa", role: "Carik || Laki-laki || - || - || admin", department: "Sekretariat", email: "masruri@kalidengen.go.id", password: "muhmasru0808", avatar_url: "" },
    { id: "emp-1786507237509", nik: "3401010212960001", name: "Viki Wulandari", role: "Danarta || Perempuan || - || - || user", department: "Keuangan", email: "viki.wulandari@kalidengen.go.id", password: "password123", avatar_url: "" },
    { id: "emp-4", nik: "3401012211780001", name: "Agus Endarto", role: "Panata Laksana Sarta Pangripta || Laki-laki || - || - || user", department: "Sekretariat", email: "agus.endarto@kalidengen.go.id", password: "password123", avatar_url: "" },
    { id: "emp-5", nik: "3401012403650001", name: "Subarno", role: "Jagabaya || Laki-laki || - || - || user", department: "Keamanan", email: "subarno@kalidengen.go.id", password: "password123", avatar_url: "" },
    { id: "emp-6", nik: "3401010807630001", name: "Saridi", role: "Ulu-Ulu || Laki-laki || - || - || user", department: "Kemakmuran", email: "saridi@kalidengen.go.id", password: "password123", avatar_url: "" },
    { id: "emp-7", nik: "3401013112640001", name: "Sumardi", role: "Kamituwa || Laki-laki || - || - || user", department: "Kemasyarakatan", email: "sumardi@kalidengen.go.id", password: "password123", avatar_url: "" },
    { id: "emp-8", nik: "3401011209740001", name: "Widi Hartono", role: "Dukuh Kalidengen I || Laki-laki || - || - || user", department: "Kewilayahan (Dukuh)", email: "widi.hartono@kalidengen.go.id", password: "password123", avatar_url: "" },
    { id: "emp-9", nik: "3401012204930001", name: "Rendi Ardiyanto", role: "Dukuh Kalidengen II || Laki-laki || - || - || user", department: "Kewilayahan (Dukuh)", email: "rendi.ardiyanto@kalidengen.go.id", password: "password123", avatar_url: "" },
    { id: "emp-10", nik: "3401011709810001", name: "Edi Supriyanto", role: "Dukuh Sidatan || Laki-laki || - || - || user", department: "Kewilayahan (Dukuh)", email: "edi.supriyanto@kalidengen.go.id", password: "password123", avatar_url: "" }
];
let attendanceLogs = [];
let dailyJournals = [];
let currentEmployeeId = null;
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

    // Removed auto-select so user stays "unauthenticated" until they pick an account
    if (currentEmployeeId && !employees.some(e => e.id === currentEmployeeId)) {
        currentEmployeeId = null;
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
    
    const extra = parseEmployeeExtra(current);
    if (extra.privilege === "admin") return true;
    
    const role = (extra.role || "").toLowerCase();
    const dept = (current.department || "").toLowerCase();
    return role.includes("admin") || role.includes("kepala") || dept.includes("admin");
}

// SPA Navigation
function switchView(viewName) {
    stopCameraStream();

    if (viewName === 'admin') {
        if (!currentEmployeeId) {
            showToast("Silakan pilih akun pamong terlebih dahulu!", "warning");
            switchView('public');
            return;
        }
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
        if (!currentEmployeeId) {
            showToast("Silakan pilih akun pamong dari menu dropdown di atas!", "warning");
            return;
        }
        document.getElementById("view-employee").classList.add("active");
        document.getElementById("nav-employee").classList.add("active");
        document.getElementById("welcome-message").textContent = `Selamat Datang, ${employee.name}!`;
        document.getElementById("welcome-subtext").textContent = "Kelola kehadiran dan laporkan aktivitas harian Anda.";
        switchEmployeeSubtab('presensi');
        // Reset subtab selectors
        document.querySelector('input[name="emp_subtab"][value="presensi"]').checked = true;
    } else if (viewName === "profile") {
        if (!currentEmployeeId) {
            showToast("Silakan pilih akun pamong dari menu dropdown di atas!", "warning");
            return;
        }
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
    } else if (tabName === 'analitik') {
        document.getElementById("admin-subtab-analitik").style.display = "block";
        initAnalyticsDashboard();
    }
}

// User Profile management
function getCurrentEmployee() {
    return employees.find(emp => emp.id === currentEmployeeId) || null;
}

function updateUserProfileUI() {
    const current = getCurrentEmployee();
    const adminNav = document.getElementById("nav-admin");
    const avatarEl = document.getElementById("avatar-initial");

    if (!current) {
        document.getElementById("profile-name").textContent = "Belum Login";
        document.getElementById("profile-role").textContent = "-";
        avatarEl.textContent = "?";
        adminNav.style.display = "none";
        return;
    }

    const extra = parseEmployeeExtra(current);
    document.getElementById("profile-name").textContent = current.name;
    document.getElementById("profile-role").textContent = extra.role;

    const initials = current.name.split(" ").map(n => n[0]).slice(0,2).join("").toUpperCase();
    
    if (current.avatar_url) {
        avatarEl.innerHTML = `<img src="${current.avatar_url}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
    } else {
        avatarEl.textContent = initials;
    }

    if (isCurrentUserAdmin()) {
        adminNav.style.display = "block";
    } else {
        adminNav.style.display = "none";
        if (document.getElementById("view-admin").classList.contains("active")) {
            switchView('public');
        }
    }
}

// User Extra Info Pack/Unpack Helpers
function parseEmployeeExtra(emp) {
    const data = {
        role: emp.role || "",
        gender: "Laki-laki",
        phone: "-",
        address: "-",
        privilege: "user"
    };
    if (emp.role && emp.role.includes(" || ")) {
        const parts = emp.role.split(" || ");
        data.role = parts[0].trim();
        data.gender = parts[1] ? parts[1].trim() : "Laki-laki";
        data.phone = parts[2] ? parts[2].trim() : "-";
        data.address = parts[3] ? parts[3].trim() : "-";
        data.privilege = parts[4] ? parts[4].trim() : "user";
    }
    
    // Safety Rule: Muh Masruri Mustofa is always an administrator
    if (emp.nik === "3401010808880002" || (emp.name && emp.name.toLowerCase().includes("masruri"))) {
        data.privilege = "admin";
    }
    return data;
}

function packEmployeeExtra(role, gender, phone, address, privilege = "user") {
    // Safety Rule: Muh Masruri Mustofa cannot be demoted
    let finalPrivilege = privilege;
    if (role.toLowerCase().includes("masruri")) {
        finalPrivilege = "admin";
    }
    return `${role} || ${gender} || ${phone} || ${address} || ${finalPrivilege}`;
}

// Attachment File Upload Helper
let currentAttachmentData = null;
// Image Compression Helper
function compressImage(base64Str, maxWidth, maxHeight, quality, callback) {
    const img = new Image();
    img.onload = function() {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
            if (width > maxWidth) {
                height = Math.round(height *= maxWidth / width);
                width = maxWidth;
            }
        } else {
            if (height > maxHeight) {
                width = Math.round(width *= maxHeight / height);
                height = maxHeight;
            }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        callback(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = function() { callback(base64Str); };
    img.src = base64Str;
}

function handleAttachmentUpload(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    // Check if it's an image
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            compressImage(e.target.result, 800, 800, 0.6, function(compressedStr) {
                currentAttachmentData = compressedStr;
                document.getElementById(`${type}-attachment-data`).value = compressedStr;
                showToast("Foto berhasil dikompres dan diunggah!", "success");
            });
        };
        reader.readAsDataURL(file);
    } else {
        // If PDF or other file, just read as base64 (might still be large, but we accept it for now)
        const reader = new FileReader();
        reader.onload = function(e) {
            currentAttachmentData = e.target.result;
            document.getElementById(`${type}-attachment-data`).value = e.target.result;
            showToast("File lampiran berhasil diunggah!", "success");
        };
        reader.readAsDataURL(file);
    }
}

function injectEmployeeSelector() {
    const selector = document.getElementById("demo-user-select");
    if (!selector) return;

    let optionsHtml = `<option value="" disabled ${!currentEmployeeId ? 'selected' : ''}>-- Pilih Akun Pamong --</option>`;
    employees.forEach(emp => {
        const extra = parseEmployeeExtra(emp);
        optionsHtml += `<option value="${emp.id}" ${emp.id === currentEmployeeId ? 'selected' : ''}>${emp.name} (${extra.role})</option>`;
    });

    selector.innerHTML = optionsHtml;
}

let pendingActiveUserId = null;
let pendingRedirectView = null;

async function changeActiveUser(id) {
    if (id === currentEmployeeId) return;

    const emp = employees.find(e => e.id === id);
    if (!emp) return;

    pendingActiveUserId = id;
    pendingRedirectView = null;

    document.getElementById("pamong-password-title").textContent = `Konfirmasi Sandi: ${emp.name}`;
    document.getElementById("pamong-password-input").value = "";
    document.getElementById("pamong-password-modal").style.display = "flex";
    document.getElementById("pamong-password-input").focus();
}

function closePamongPasswordModal() {
    document.getElementById("pamong-password-modal").style.display = "none";
    pendingActiveUserId = null;
    pendingRedirectView = null;
    
    // Revert dropdown select back to currentEmployeeId
    const selector = document.getElementById("demo-user-select");
    if (selector) {
        selector.value = currentEmployeeId;
    }
}

async function verifyPamongPassword() {
    const inputPass = document.getElementById("pamong-password-input").value;
    if (!pendingActiveUserId) return;

    const emp = employees.find(e => e.id === pendingActiveUserId);
    if (!emp) return;

    const btnSubmit = document.querySelector("#pamong-password-modal .btn-primary");
    const inputEl = document.getElementById("pamong-password-input");
    
    inputEl.disabled = true;
    if (btnSubmit) btnSubmit.textContent = "Memverifikasi...";

    try {
        let authSuccess = false;

        // 1. Try to Login via Supabase Auth
        if (supabaseClient) {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: emp.email,
                password: inputPass
            });

            if (error) {
                // 2. Auto-Migrate (Signup) if not registered
                if (error.message.includes("Invalid login credentials") || error.status === 400) {
                    const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
                        email: emp.email,
                        password: inputPass
                    });
                    
                    if (signUpError) {
                        showToast("Sandi salah atau gagal autentikasi!", "error");
                    } else {
                        authSuccess = true; // First time claim success
                    }
                } else {
                    showToast("Gagal login: " + error.message, "error");
                }
            } else {
                authSuccess = true;
            }
        } else {
            // Fallback for local testing if no supabase
            authSuccess = (inputPass === (emp.password || "password123"));
        }

        if (authSuccess) {
            currentEmployeeId = pendingActiveUserId;
            sessionStorage.removeItem("apresi_admin_unlocked");
            updateUserProfileUI();
            syncUIState();
            showToast(`Selamat datang, ${emp.name}!`, "success");
            document.getElementById("pamong-password-modal").style.display = "none";

            if (pendingRedirectView) {
                switchView(pendingRedirectView);
            }

            pendingActiveUserId = null;
            pendingRedirectView = null;
        } else {
            inputEl.value = "";
            inputEl.focus();
        }
    } catch (e) {
        showToast("Terjadi kesalahan sistem.", "error");
        console.error(e);
    } finally {
        inputEl.disabled = false;
        if (btnSubmit) btnSubmit.textContent = "Login Akun";
    }
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

// Work Schedule – Kalurahan Kalidengen (Peraturan Resmi)
// Senin-Kamis : masuk 07.30, pulang 15.45, istirahat 12.00-12.30
// Jumat       : masuk 07.30, pulang 15.30, istirahat 11.30-12.30
// Toleransi presensi : 30 menit sebelum & sesudah jadwal
function getPresenceTimeConfig() {
    const now = new Date();
    const day = now.getDay(); // 0=Minggu, 1=Senin ... 5=Jumat, 6=Sabtu

    if (day === 0 || day === 6) {
        return { isWorkday: false };
    }

    if (day === 5) { // Jumat
        return {
            isWorkday: true,
            dayLabel: "Jum'at",
            startTime: "07:30",      // jam masuk resmi
            endTime:   "15:30",      // jam pulang resmi
            breakStart: "11:30",
            breakEnd:   "12:30",
            // Check-in window: 07:00 – 08:00 (toleransi 30 menit)
            inStart:   "07:00",
            inEnd:     "08:00",
            // Batas "Terlambat": setelah 07:30
            lateAfter: "07:30",
            // Check-out window: 15:00 – 16:00 (toleransi 30 menit)
            outStart:  "15:00",
            outEnd:    "16:00",
            // Pulang resmi: 15:30 – checkout sebelum ini = Pulang Cepat
            earlyBefore: "15:30"
        };
    } else { // Senin – Kamis
        return {
            isWorkday: true,
            dayLabel: "Senin–Kamis",
            startTime: "07:30",
            endTime:   "15:45",
            breakStart: "12:00",
            breakEnd:   "12:30",
            // Check-in window: 07:00 – 08:00
            inStart:   "07:00",
            inEnd:     "08:00",
            lateAfter: "07:30",
            // Check-out window: 15:15 – 16:15
            outStart:  "15:15",
            outEnd:    "16:15",
            earlyBefore: "15:45"
        };
    }
}

// Helper: parse "HH:MM" to total minutes since midnight
function timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    return h * 60 + m;
}

// Check Presence State & Lock
function checkTodayAttendanceState() {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const logToday = attendanceLogs.find(l => l.employee_id === currentEmployeeId && l.date === today);

    const btnCheckin  = document.getElementById("btn-checkin");
    const btnCheckout = document.getElementById("btn-checkout");
    const scheduleInfo = document.getElementById("schedule-info");
    const timeConfig  = getPresenceTimeConfig();

    if (!btnCheckin) return;

    if (scheduleInfo) {
        if (!timeConfig.isWorkday) {
            scheduleInfo.textContent = "🏖️ Hari ini Libur Akhir Pekan";
        } else {
            scheduleInfo.textContent = `📅 Jadwal ${timeConfig.dayLabel}: Masuk ${timeConfig.startTime} – Pulang ${timeConfig.endTime}`;
        }
    }

    if (!timeConfig.isWorkday) {
        btnCheckin.style.display = "block";
        btnCheckin.disabled = true;
        btnCheckin.textContent = "🏖️ Hari Ini Libur Akhir Pekan";
        btnCheckout.style.display = "none";
        return;
    }

    const nowMins = now.getHours() * 60 + now.getMinutes();

    if (logToday) {
        if (logToday.type === "ABSEN") {
            btnCheckin.style.display  = "block";
            btnCheckin.disabled = true;
            btnCheckin.textContent = `✅ Sudah Izin (${logToday.status})`;
            btnCheckout.style.display = "none";
        } else if (logToday.check_out_time) {
            btnCheckin.style.display  = "block";
            btnCheckin.disabled = true;
            btnCheckin.textContent = "✅ Selesai Kerja Hari Ini";
            btnCheckout.style.display = "none";
        } else {
            const outStartMins  = timeToMinutes(timeConfig.outStart);

            btnCheckin.style.display  = "none";
            btnCheckout.style.display = "block";

            // Allow check-out anytime after check-in, just label it if it's early
            btnCheckout.disabled = false;
            btnCheckout.textContent = (nowMins < outStartMins) ? "⏳ Pulang Cepat (Lebih Awal)" : "Check-Out Presensi";
        }
    } else {
        const inStartMins = timeToMinutes(timeConfig.inStart);
        const inEndMins   = timeToMinutes(timeConfig.inEnd);
        const isCheckinOpen = nowMins >= inStartMins && nowMins <= inEndMins;

        btnCheckin.style.display  = "block";
        btnCheckout.style.display = "none";
        togglePresenceTypeInputs();

        const type = document.querySelector('input[name="presence_type"]:checked')?.value || "WFO";
        
        const isEarly = nowMins < inStartMins;
        if (type === "WFO" && isEarly) {
            btnCheckin.disabled = true;
            const remain = inStartMins - nowMins;
            btnCheckin.textContent = `⏳ Check-In Dibuka Pukul ${timeConfig.inStart} (${remain} menit lagi)`;
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

function capturePhotoBase64() {
    const video = document.getElementById("webcam-video");
    if (!video || !webcamStream) return "";
    
    const canvas = document.createElement("canvas");
    const targetWidth = 480;
    const targetHeight = (video.videoHeight / video.videoWidth) * targetWidth || 360;
    
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    return canvas.toDataURL("image/jpeg", 0.6); 
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

    if (type === "WFH") {
        const loc = document.getElementById("wfh-location").value.trim();
        const task = document.getElementById("wfh-notes").value.trim();
        const attachment = document.getElementById("wfh-attachment-data").value;
        
        if (!loc || !task || !attachment) {
            showToast("Harap isi Lokasi, Tugas, dan Unggah Surat Tugas/Lampiran!", "error");
            return;
        }
    }

    if (type === "ABSEN") {
        const reason = document.getElementById("absen-reason").value;
        const notes = document.getElementById("absen-notes").value || "Tanpa Keterangan";
        const attachment = document.getElementById("absen-attachment-data").value || "";
        
        if (!attachment) {
            showToast("Harap unggah surat keterangan dokter atau surat izin terlebih dahulu!", "error");
            return;
        }

        await savePresenceLog(type, "00:00", null, `Izin: ${reason} (${notes})`, "Izin", attachment);
        
        // Reset Attachment inputs
        document.getElementById("absen-attachment-data").value = "";
        document.getElementById("absen-file").value = "";
        currentAttachmentData = null;
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
        if (type === "WFO") {
            const timeConfig = getPresenceTimeConfig();
            const lateAfterMins = timeToMinutes(timeConfig.lateAfter || "07:30");
            const nowMins = now.getHours() * 60 + now.getMinutes();
            if (nowMins > lateAfterMins) {
                status = "Terlambat";
            }
        }

        let detail = "";
        let attachment = "";
        if (type === "WFO") {
            detail = `WFO - ${document.getElementById("wfo-coords").value}`;
        } else {
            const loc = document.getElementById("wfh-location").value;
            const task = document.getElementById("wfh-notes").value;
            attachment = document.getElementById("wfh-attachment-data").value || "";
            detail = `WFH - Lokasi: ${loc} (Tugas: ${task})`;
        }

        const finalPhoto = photoData || attachment || "";
        await savePresenceLog(type, checkInTimeStr, null, detail, status, finalPhoto);
        
        // Reset WFH attachments
        if (type === "WFH") {
            document.getElementById("wfh-attachment-data").value = "";
            document.getElementById("wfh-file").value = "";
            currentAttachmentData = null;
        }
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
    const nowMins = now.getHours() * 60 + now.getMinutes();

    // Determine checkout status
    const timeConfig = getPresenceTimeConfig();
    let checkoutStatus = "Normal";
    if (timeConfig.isWorkday && timeConfig.earlyBefore) {
        const earlyMins  = timeToMinutes(timeConfig.earlyBefore);
        if (nowMins < earlyMins) {
            checkoutStatus = "Pulang Cepat";
        }
    }

    // Calculate working hours (subtract break time)
    const checkinTimeRaw = attendanceLogs[logIndex].check_in_time;
    const [inH, inM] = checkinTimeRaw.split(":").map(Number);
    const outH = now.getHours();
    const outM = now.getMinutes();

    let diffHours   = outH - inH;
    let diffMinutes = outM - inM;
    if (diffMinutes < 0) { diffHours -= 1; diffMinutes += 60; }

    // Deduct break time
    let breakMinutes = 0; 
    if (timeConfig.breakStart && timeConfig.breakEnd) {
        const breakStartMins = timeToMinutes(timeConfig.breakStart);
        if (nowMins >= breakStartMins) {
            breakMinutes = timeToMinutes(timeConfig.breakEnd) - breakStartMins;
        }
    }
    const totalMins   = diffHours * 60 + diffMinutes - breakMinutes;
    const workingHours = parseFloat(Math.max(0, totalMins / 60).toFixed(1));

    const detail = checkoutStatus === "Pulang Cepat"
        ? `Pulang pukul ${checkOutTimeStr} (Lebih awal dari ${timeConfig.earlyBefore})`
        : `Pulang pukul ${checkOutTimeStr}`;

    const updatedLog = {
        ...attendanceLogs[logIndex],
        check_out_time: checkOutTimeStr,
        working_hours:  workingHours,
        checkout_status: checkoutStatus
    };

    let pushSuccess = false;
    if (supabaseClient) {
        try {
            const { error } = await supabaseClient.from('attendance_logs').update({
                check_out_time:   checkOutTimeStr,
                working_hours:    workingHours,
                checkout_status:  checkoutStatus
            }).eq('id', updatedLog.id);
            if (!error) pushSuccess = true;
        } catch (e) {
            console.error("Gagal update checkout ke Supabase:", e);
        }
    }

    attendanceLogs[logIndex] = updatedLog;
    localStorage.setItem("apresi_logs", JSON.stringify(attendanceLogs));

    if (checkoutStatus === "Pulang Cepat") {
        showToast(`⚠️ Check-Out berhasil — Pulang sebelum ${timeConfig.earlyBefore} (Pulang Cepat).`, "warning");
    } else {
        showToast("✅ Berhasil Check-Out! Selamat beristirahat.", "success");
    }
    syncUIState();
}

// Log Saver
async function savePresenceLog(type, checkIn, checkOut, detail, status, photoData) {
    const employee = getCurrentEmployee();
    const today = new Date().toISOString().split("T")[0];

    let finalCheckOut = checkOut;
    let finalWorkingHours = 0;
    if (type === "WFH" || type === "ABSEN") {
        finalCheckOut = "15:45"; // Auto-complete for offsite
        finalWorkingHours = 8;
    }

    const newLog = {
        id: "log-" + Date.now(),
        employee_id: employee.id,
        name: employee.name,
        type: type,
        date: today,
        check_in_time: checkIn,
        check_out_time: finalCheckOut,
        status: status,
        detail: detail,
        working_hours: finalWorkingHours,
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

                // Calculate elapsed days
        const uniqueDates = new Set(attendanceLogs.filter(l => l.date).map(l => l.date));
        const totalWorkingDays = uniqueDates.size > 0 ? uniqueDates.size : 1;
        const attendanceRate = Math.min((presentDays / totalWorkingDays), 1);
        
        // Journal score (standard target 80 hours work/month)
        const journalRate = Math.min((totalDuration / 80), 1);

        // Calculations
        const attendanceComponent = baseTukin * 0.70 * attendanceRate;
        const journalComponent = baseTukin * 0.30 * journalRate;
        const lateDeduction = lateDays * 25000;

        const tukinClean = Math.max(Math.round(attendanceComponent + journalComponent - lateDeduction), 0);

        const extra = parseEmployeeExtra(emp);
        tbody.innerHTML += `
            <tr>
                <td><strong>${emp.name}</strong><br><small style="color:var(--text-secondary);">${extra.role}</small></td>
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

                    
        const uniqueDates = new Set(attendanceLogs.filter(l => l.date).map(l => l.date));
        const totalWorkingDays = uniqueDates.size > 0 ? uniqueDates.size : 1;
        const attendanceRate = Math.min((presentDays / totalWorkingDays), 1);
            const journalRate = Math.min((totalDuration / 80), 1);

            const attendanceComponent = baseTukin * 0.70 * attendanceRate;
            const journalComponent = baseTukin * 0.30 * journalRate;
            const lateDeduction = lateDays * 25000;
            const tukinClean = Math.max(Math.round(attendanceComponent + journalComponent - lateDeduction), 0);

            const extra = parseEmployeeExtra(emp);
            return {
                "No": index + 1,
                "NIK": emp.nik,
                "Nama Pamong": emp.name,
                "Jabatan": extra.role,
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
    const extra = parseEmployeeExtra(current);
    document.getElementById("profile-nik").value = current.nik || "BELUM DISKEMA";
    document.getElementById("profile-fullname").value = current.name;
    document.getElementById("profile-designation").value = extra.role;
    document.getElementById("profile-department").value = current.department || "Sekretariat";
    document.getElementById("profile-gender").value = extra.gender;
    document.getElementById("profile-phone").value = extra.phone;
    document.getElementById("profile-address").value = extra.address;
    document.getElementById("profile-privilege").value = extra.privilege;
    document.getElementById("profile-password").value = "";
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
    const updatedGender = document.getElementById("profile-gender").value;
    const updatedPhone = document.getElementById("profile-phone").value.trim() || "-";
    const updatedAddress = document.getElementById("profile-address").value.trim() || "-";
    const updatedPrivilege = document.getElementById("profile-privilege").value || "user";
    const updatedPasswordInput = document.getElementById("profile-password").value;
    const updatedPassword = updatedPasswordInput.trim() !== "" ? updatedPasswordInput.trim() : (current.password || "password123");
    const updatedEmail = document.getElementById("profile-email").value.trim();
    const updatedAvatar = document.getElementById("profile-img-preview").src;

    if (!updatedName || !updatedRole) {
        showToast("Nama dan Jabatan wajib diisi!", "error");
        return;
    }

    const packedRole = packEmployeeExtra(updatedRole, updatedGender, updatedPhone, updatedAddress, updatedPrivilege);

    const updated = {
        ...current,
        name: updatedName,
        role: packedRole,
        department: updatedDept,
        email: updatedEmail,
        password: updatedPassword,
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

    document.getElementById("profile-password").value = "";
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
        const extra = parseEmployeeExtra(emp);
        
        grid.innerHTML += `
            <div class="aparat-card" onclick="selectActiveUserAndRedirect('${emp.id}')">
                <img src="${avatarSrc}" class="aparat-avatar" alt="${emp.name}">
                <div class="aparat-info">
                    <h3 class="aparat-name" title="${emp.name}">${emp.name}</h3>
                    <p class="aparat-role-text" title="${extra.role}">${extra.role} (${emp.department})</p>
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
        
        let photoHtml = "";
        if (log.photo_data && log.photo_data.startsWith("data:application/pdf")) {
            photoHtml = `<a href="${log.photo_data}" target="_blank" style="display:inline-flex; align-items:center; justify-content:center; width:35px; height:35px; border-radius:50%; background:var(--primary); color:#fff; text-decoration:none; font-size:0.9rem;" title="Lihat Lampiran PDF">📄</a>`;
        } else {
            const avatarSrc = log.photo_data || (emp ? emp.avatar_url : "") || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=50";
            photoHtml = `<img src="${avatarSrc}" style="width: 35px; height: 35px; border-radius: 50%; object-fit: cover; border: 1px solid var(--card-border);">`;
        }

        tbody.innerHTML += `
            <tr>
                <td>${photoHtml}</td>
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
    const genderInput = document.getElementById("new-emp-gender");
    const phoneInput = document.getElementById("new-emp-phone");
    const addressInput = document.getElementById("new-emp-address");
    const privilegeInput = document.getElementById("new-emp-privilege");
    const passwordInput = document.getElementById("new-emp-password");

    const nik = nikInput.value.trim();
    const name = nameInput.value.trim();
    const role = roleInput.value.trim();
    const department = deptInput.value;
    const gender = genderInput.value;
    const phone = phoneInput.value.trim() || "-";
    const address = addressInput.value.trim() || "-";
    let privilege = privilegeInput.value;
    const password = passwordInput.value.trim() || "password123";

    // Strict Rule: Muh Masruri Mustofa must always be admin
    if (nik === "3401010808880002" || name.toLowerCase().includes("masruri")) {
        privilege = "admin";
    }

    if (!nik || !name || !role) {
        showToast("Harap lengkapi semua kolom!", "error");
        return;
    }

    const packedRole = packEmployeeExtra(role, gender, phone, address, privilege);

    if (editingEmployeeId !== null) {
        // Edit Mode
        const empIndex = employees.findIndex(e => e.id === editingEmployeeId);
        if (empIndex === -1) return;

        const updatedEmp = {
            ...employees[empIndex],
            nik: nik,
            name: name,
            role: packedRole,
            department: department,
            password: password,
            email: `${name.toLowerCase().replace(/\s+/g, '.')}@kalidengen.go.id`
        };

        if (supabaseClient) {
            try {
                await supabaseClient.from('employees').update({
                    nik: nik,
                    name: name,
                    role: packedRole,
                    department: department,
                    password: password,
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
            role: packedRole,
            department: department,
            password: password,
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
    phoneInput.value = "";
    addressInput.value = "";
    passwordInput.value = "";
    genderInput.selectedIndex = 0;
    privilegeInput.value = "user";
    privilegeInput.disabled = false;

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
        const extra = parseEmployeeExtra(emp);
        const isSelf = emp.id === currentEmployeeId;
        const deleteButton = isSelf 
            ? `<span style="font-size:0.75rem; color:var(--text-secondary); font-style:italic;">Sedang Aktif</span>`
            : `<button class="btn btn-danger" style="padding: 0.25rem 0.6rem; font-size: 0.75rem; background: var(--danger);" onclick="deleteEmployee('${emp.id}')">Hapus</button>`;
        const editButton = `<button class="btn btn-primary" style="padding: 0.25rem 0.6rem; font-size: 0.75rem; background: #3b82f6; margin-right: 5px;" onclick="editEmployeeInline('${emp.id}')">Ubah</button>`;

        tbody.innerHTML += `
            <tr>
                <td><strong>${emp.name}</strong></td>
                <td>${emp.nik}</td>
                <td>${extra.role}</td>
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
    const extra = parseEmployeeExtra(emp);

    // Fill form
    document.getElementById("new-emp-nik").value = emp.nik;
    document.getElementById("new-emp-name").value = emp.name;
    document.getElementById("new-emp-role").value = extra.role;
    document.getElementById("new-emp-dept").value = emp.department;
    document.getElementById("new-emp-gender").value = extra.gender;
    document.getElementById("new-emp-phone").value = extra.phone;
    document.getElementById("new-emp-address").value = extra.address;
    document.getElementById("new-emp-password").value = emp.password || "password123";
    
    const privilegeInput = document.getElementById("new-emp-privilege");
    privilegeInput.value = extra.privilege;
    
    // Strict Safety Rule: Do not allow demoting Muh Masruri Mustofa to ensure there is always 1 Admin.
    if (emp.nik === "3401010808880002" || emp.name.toLowerCase().includes("masruri")) {
        privilegeInput.disabled = true;
    } else {
        privilegeInput.disabled = false;
    }

    // Change Form Visual Mode to Edit
    document.getElementById("new-employee-form-title").textContent = "Ubah Data Pamong: " + emp.name;
    document.getElementById("new-employee-submit-btn").textContent = "Simpan Perubahan";
    document.getElementById("new-emp-nik").focus();

    showToast(`Mode edit diaktifkan untuk: ${emp.name}`, "info");
}

// Click on Public Board employee card to select user and redirect to employee area
async function selectActiveUserAndRedirect(empId) {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;

    if (empId === currentEmployeeId) {
        switchView('employee');
        return;
    }

    pendingActiveUserId = empId;
    pendingRedirectView = 'employee';

    document.getElementById("pamong-password-title").textContent = `Konfirmasi Sandi: ${emp.name}`;
    document.getElementById("pamong-password-input").value = "";
    document.getElementById("pamong-password-modal").style.display = "flex";
    document.getElementById("pamong-password-input").focus();
}

// ============================================================
// ANALITIK & AI DASHBOARD
// ============================================================

let attendanceChartInstance = null;
let typeChartInstance = null;

function initAnalyticsDashboard() {
    populateChartEmpFilter();
    populateRankingMonthFilter();
    renderAttendanceChart();
    renderTypeChart();
    renderDisciplineRanking();
    generateAIInsight();
}

function populateChartEmpFilter() {
    const sel = document.getElementById("chart-emp-filter");
    if (!sel) return;
    const existing = sel.querySelectorAll("option:not([value='all'])");
    existing.forEach(o => o.remove());
    employees.forEach(emp => {
        const o = document.createElement("option");
        o.value = emp.id;
        o.textContent = emp.name;
        sel.appendChild(o);
    });
}

function populateRankingMonthFilter() {
    const sel = document.getElementById("ranking-month-filter");
    if (!sel) return;
    const existing = sel.querySelectorAll("option:not([value='all'])");
    existing.forEach(o => o.remove());

    const months = new Set(attendanceLogs.map(l => l.date ? l.date.substring(0, 7) : null).filter(Boolean));
    const sorted = [...months].sort().reverse();
    sorted.forEach(m => {
        const d = new Date(m + "-01");
        const label = d.toLocaleDateString('id-ID', { year: 'numeric', month: 'long' });
        const o = document.createElement("option");
        o.value = m;
        o.textContent = label;
        sel.appendChild(o);
    });
}

function renderAttendanceChart() {
    const sel = document.getElementById("chart-emp-filter");
    const empFilter = sel ? sel.value : "all";

    // Get last 6 months
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        months.push(d.toISOString().substring(0, 7));
    }

    const labels = months.map(m => {
        const d = new Date(m + "-01");
        return d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
    });

    let datasets = [];
    const colors = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#14b8a6','#84cc16'];

    if (empFilter === "all") {
        // Aggregate all employees
        const dataCounts = months.map(m => attendanceLogs.filter(l =>
            l.date && l.date.startsWith(m) && l.type !== "ABSEN"
        ).length);
        datasets = [{
            label: "Total Kehadiran",
            data: dataCounts,
            backgroundColor: 'rgba(99,102,241,0.25)',
            borderColor: '#6366f1',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointBackgroundColor: '#6366f1',
            pointRadius: 4
        }];
    } else {
        const emp = employees.find(e => e.id === empFilter);
        if (emp) {
            const dataCounts = months.map(m => attendanceLogs.filter(l =>
                l.employee_id === empFilter && l.date && l.date.startsWith(m) && l.type !== "ABSEN"
            ).length);
            datasets = [{
                label: emp.name,
                data: dataCounts,
                backgroundColor: 'rgba(99,102,241,0.25)',
                borderColor: '#6366f1',
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#6366f1',
                pointRadius: 4
            }];
        }
    }

    const ctx = document.getElementById("attendance-chart");
    if (!ctx) return;

    if (attendanceChartInstance) {
        attendanceChartInstance.destroy();
        attendanceChartInstance = null;
    }

    attendanceChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#cbd5e1', font: { size: 11 } } }
            },
            scales: {
                x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: {
                    beginAtZero: true,
                    ticks: { color: '#94a3b8', font: { size: 10 }, stepSize: 1 },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

function renderTypeChart() {
    const wfo = attendanceLogs.filter(l => l.type === "WFO").length;
    const wfh = attendanceLogs.filter(l => l.type === "WFH").length;
    const izin = attendanceLogs.filter(l => l.type === "ABSEN").length;

    const ctx = document.getElementById("type-chart");
    if (!ctx) return;

    if (typeChartInstance) {
        typeChartInstance.destroy();
        typeChartInstance = null;
    }

    typeChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['WFO (Kantor)', 'Dinas Luar (WFH)', 'Izin / Absen'],
            datasets: [{
                data: [wfo, wfh, izin],
                backgroundColor: ['#6366f1', '#10b981', '#f59e0b'],
                borderColor: 'rgba(255,255,255,0.05)',
                borderWidth: 2,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#cbd5e1', font: { size: 10 }, padding: 12, boxWidth: 12 }
                }
            }
        }
    });
}

function renderDisciplineRanking() {
    const sel = document.getElementById("ranking-month-filter");
    const monthFilter = sel ? sel.value : "all";
    const tbody = document.getElementById("ranking-table-body");
    if (!tbody) return;

    // Calculate total working days in the selected period (approx)
    const filteredLogs = monthFilter === "all"
        ? attendanceLogs
        : attendanceLogs.filter(l => l.date && l.date.startsWith(monthFilter));

    const uniqueDates = new Set(filteredLogs.map(l => l.date));
    const totalWorkingDays = uniqueDates.size > 0 ? uniqueDates.size : 1;

    const rankData = employees.map(emp => {
        const empLogs = filteredLogs.filter(l => l.employee_id === emp.id);
        const extra = parseEmployeeExtra(emp);

        const hadir = empLogs.filter(l => l.type !== "ABSEN").length;
        const terlambat = empLogs.filter(l => l.status === "Terlambat").length;
        const izin = empLogs.filter(l => l.type === "ABSEN").length;
        const alpha = Math.max(0, totalWorkingDays - hadir - izin);
        const pctHadir = totalWorkingDays > 0 ? Math.min(100, Math.round((hadir / totalWorkingDays) * 100)) : 0;

        // Discipline score: attendance% x 0.7 + bonus for zero tardiness
        const terlambatPenalty = Math.min(terlambat * 2, 20);
        const score = Math.max(0, Math.round(pctHadir * 0.7 - terlambatPenalty + (terlambat === 0 && hadir > 0 ? 10 : 0)));

        return { emp, extra, hadir, terlambat, izin, alpha, pctHadir, score };
    }).sort((a, b) => b.score - a.score);

    const rankBadge = (rank) => {
        if (rank === 1) return `<span style="font-size:1.3rem;">🥇</span>`;
        if (rank === 2) return `<span style="font-size:1.3rem;">🥈</span>`;
        if (rank === 3) return `<span style="font-size:1.3rem;">🥉</span>`;
        return `<span style="color:var(--text-secondary); font-weight:600;">${rank}</span>`;
    };

    const statusBadge = (score, alpha) => {
        if (alpha > 3) return `<span class="badge badge-absen">Perlu Perhatian</span>`;
        if (score >= 60) return `<span class="badge badge-hadir">Sangat Disiplin</span>`;
        if (score >= 40) return `<span class="badge" style="background:rgba(245,158,11,0.15);color:#fbbf24;border-color:#fbbf24;">Cukup</span>`;
        return `<span class="badge badge-absen">Kurang Disiplin</span>`;
    };

    tbody.innerHTML = rankData.map((r, idx) => `
        <tr>
            <td style="text-align:center;">${rankBadge(idx + 1)}</td>
            <td><strong>${r.emp.name}</strong></td>
            <td style="color:var(--text-secondary); font-size:0.82rem;">${r.extra.role || '-'}</td>
            <td><span class="badge badge-hadir">${r.hadir}</span></td>
            <td><span class="badge" style="background:rgba(245,158,11,0.15);color:#fbbf24;border-color:#fbbf24;">${r.terlambat}</span></td>
            <td><span class="badge" style="background:rgba(99,102,241,0.15);color:#818cf8;border-color:#818cf8;">${r.izin}</span></td>
            <td><span class="badge badge-absen">${r.alpha}</span></td>
            <td>
                <div style="display:flex;align-items:center;gap:0.5rem;">
                    <div style="flex:1;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;">
                        <div style="width:${r.pctHadir}%;height:100%;background:${r.pctHadir>=80?'#10b981':r.pctHadir>=60?'#f59e0b':'#ef4444'};border-radius:3px;transition:width 0.5s;"></div>
                    </div>
                    <span style="font-size:0.8rem;font-weight:600;">${r.pctHadir}%</span>
                </div>
            </td>
            <td><strong style="color:${r.score>=60?'#10b981':r.score>=40?'#f59e0b':'#ef4444'};">${r.score}</strong></td>
            <td>${statusBadge(r.score, r.alpha)}</td>
        </tr>
    `).join('');
}

function generateAIInsight() {
    const now = new Date();
    const thisMonth = now.toISOString().substring(0, 7);
    const monthName = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

    const monthLogs = attendanceLogs.filter(l => l.date && l.date.startsWith(thisMonth));
    const totalLogs = monthLogs.length;
    const hadirLogs = monthLogs.filter(l => l.type !== "ABSEN");
    const terlambatLogs = monthLogs.filter(l => l.status === "Terlambat");
    const izinLogs = monthLogs.filter(l => l.type === "ABSEN");

    // Find most late employee
    const lateCounts = {};
    terlambatLogs.forEach(l => {
        const emp = employees.find(e => e.id === l.employee_id);
        if (emp) lateCounts[emp.name] = (lateCounts[emp.name] || 0) + 1;
    });
    const mostLate = Object.entries(lateCounts).sort((a, b) => b[1] - a[1])[0];

    // Find most punctual employee (hadir, no late)
    const punctualData = employees.map(emp => {
        const empM = monthLogs.filter(l => l.employee_id === emp.id);
        const hadir = empM.filter(l => l.type !== "ABSEN").length;
        const late = empM.filter(l => l.status === "Terlambat").length;
        return { name: emp.name, hadir, late };
    }).filter(d => d.hadir > 0).sort((a, b) => a.late - b.late || b.hadir - a.hadir);

    // Day of week most absences
    const dayCount = {};
    monthLogs.forEach(l => {
        if (l.date) {
            const day = new Date(l.date).toLocaleDateString('id-ID', { weekday: 'long' });
            dayCount[day] = (dayCount[day] || 0) + 1;
        }
    });
    const mostActiveDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0];

    // Rate
    const uniqueDates = new Set(monthLogs.map(l => l.date));
    const daysCount = uniqueDates.size > 0 ? uniqueDates.size : 1;
    const totalPossible = employees.length * daysCount;
    const attendanceRate = totalPossible > 0 ? Math.round((hadirLogs.length / totalPossible) * 100) : 0;
    const lateRate = hadirLogs.length > 0 ? Math.round((terlambatLogs.length / hadirLogs.length) * 100) : 0;

    // Update panels
    const summaryEl = document.getElementById("ai-summary");
    const warningEl = document.getElementById("ai-warning");
    const praiseEl = document.getElementById("ai-praise");
    const recEl = document.getElementById("ai-recommendation");

    if (!summaryEl) return;

    if (totalLogs === 0) {
        const msg = `<em style="color:var(--text-secondary);">Belum ada data presensi ${monthName}. Mulai lakukan presensi untuk melihat analisis.</em>`;
        summaryEl.innerHTML = msg;
        warningEl.innerHTML = msg;
        praiseEl.innerHTML = msg;
        recEl.innerHTML = msg;
        return;
    }

    summaryEl.innerHTML = `
        Bulan <strong>${monthName}</strong>: tercatat <strong>${hadirLogs.length}</strong> kehadiran dari ${employees.length} aparatur.
        Tingkat kehadiran rata-rata <strong>${attendanceRate}%</strong>.
        Terdapat <strong>${terlambatLogs.length}</strong> keterlambatan dan <strong>${izinLogs.length}</strong> izin.
        ${mostActiveDay ? `Hari paling banyak kehadiran: <strong>${mostActiveDay[0]}</strong>.` : ''}
    `;

    warningEl.innerHTML = mostLate
        ? `<strong>${mostLate[0]}</strong> mencatat keterlambatan terbanyak bulan ini sebanyak <strong>${mostLate[1]}x</strong>.
           ${lateRate > 20 ? `Tingkat keterlambatan cukup tinggi (${lateRate}%). Perlu evaluasi.` : ''}`
        : `<span style="color:#34d399;">✅ Tidak ada aparatur dengan keterlambatan berulang bulan ini. Sangat baik!</span>`;

    praiseEl.innerHTML = punctualData.length > 0
        ? `<strong>${punctualData[0].name}</strong> menjadi aparatur paling disiplin bulan ini dengan 
           <strong>${punctualData[0].hadir} hari</strong> kehadiran dan <strong>${punctualData[0].late} keterlambatan</strong>.
           🎉 Pertahankan kedisiplinan ini!`
        : `<em>Belum cukup data untuk menentukan aparatur paling disiplin.</em>`;

    const recs = [];
    if (lateRate > 15) recs.push("⏰ Lakukan briefing pagi untuk meningkatkan kedisiplinan jam masuk.");
    if (izinLogs.length > employees.length * 2) recs.push("📋 Tingkatnya izin perlu dievaluasi. Pastikan surat keterangan lengkap.");
    if (attendanceRate < 80) recs.push("📊 Tingkat kehadiran di bawah 80%. Pertimbangkan evaluasi kebijakan kehadiran.");
    if (recs.length === 0) recs.push("✅ Kondisi kehadiran aparatur bulan ini sangat baik. Pertahankan disiplin kerja!");

    recEl.innerHTML = recs.join("<br>");
}

// Cleanup Old Photos
async function cleanupOldPhotos() {
    if (!isCurrentUserAdmin()) return;

    if (!confirm("Yakin ingin menghapus semua data foto yang usianya lebih dari 30 hari? Proses ini tidak bisa dibatalkan.")) {
        return;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];

    // Find logs in memory
    const targetLogs = attendanceLogs.filter(l => l.date < cutoffStr && l.photo_data && l.photo_data.length > 50);

    if (targetLogs.length === 0) {
        showToast("Tidak ada foto lama (> 30 hari) yang perlu dibersihkan.", "success");
        return;
    }

    showToast(`Memproses penghapusan ${targetLogs.length} foto lama...`, "warning");

    let successCount = 0;
    if (supabaseClient) {
        for (const log of targetLogs) {
            try {
                const { error } = await supabaseClient.from('attendance_logs').update({ photo_data: "" }).eq('id', log.id);
                if (!error) {
                    log.photo_data = ""; // Update locally
                    successCount++;
                }
            } catch(e) {
                console.error("Gagal hapus foto:", e);
            }
        }
    }

    localStorage.setItem("apresi_logs", JSON.stringify(attendanceLogs));
    
    if (successCount > 0) {
        showToast(`✅ Berhasil menghapus ${successCount} data foto lama! Database lebih lega.`, "success");
    } else {
        showToast("Gagal menghapus foto, pastikan koneksi internet stabil.", "error");
    }
}

