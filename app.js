// System State
let employees = [
    { id: "emp-1", name: "John Doe", role: "Software Engineer" }
];

let attendanceLogs = [];
let currentEmployeeId = "emp-1";
let clockInterval = null;

// Mock Photos for Face Scan Simulation
const mockFaces = [
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=600",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=600",
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=600",
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=600"
];

// Initialize application on load
window.addEventListener("DOMContentLoaded", () => {
    // Load from LocalStorage
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

    // Start clock
    startClock();

    // Inject User Selector for testing ease
    injectEmployeeSelector();

    // Set Active User Profile UI
    updateUserProfileUI();

    // Load logs
    renderPersonalLogs();
    renderAdminLogs();
    updatePersonalStats();
    updateAdminStats();
    
    // Toggle initial inputs
    togglePresenceTypeInputs();

    // Check if user already checked in today
    checkTodayAttendanceState();
});

// Digital Clock & Date
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

// Switching SPA Views
function switchView(viewName) {
    document.querySelectorAll(".view-panel").forEach(panel => {
        panel.classList.remove("active");
    });
    document.querySelectorAll(".sidebar .nav-item").forEach(item => {
        item.classList.remove("active");
    });

    if (viewName === "employee") {
        document.getElementById("view-employee").classList.add("active");
        document.getElementById("nav-employee").classList.add("active");
        document.getElementById("welcome-message").textContent = `Selamat Datang, ${getCurrentEmployee().name}!`;
        document.getElementById("welcome-subtext").textContent = "Sudah siap untuk produktif hari ini?";
        checkTodayAttendanceState();
    } else if (viewName === "admin") {
        document.getElementById("view-admin").classList.add("active");
        document.getElementById("nav-admin").classList.add("active");
        document.getElementById("welcome-message").textContent = `Panel Administrasi`;
        document.getElementById("welcome-subtext").textContent = "Pantau dan kelola data presensi seluruh karyawan.";
        updateAdminStats();
        renderAdminLogs();
    }
}

// User Profile Helpers
function getCurrentEmployee() {
    return employees.find(emp => emp.id === currentEmployeeId) || employees[0];
}

function updateUserProfileUI() {
    const current = getCurrentEmployee();
    document.getElementById("profile-name").textContent = current.name;
    document.getElementById("profile-role").textContent = current.role;

    // Get initials for avatar
    const initials = current.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
    document.getElementById("avatar-initial").textContent = initials;
    
    // Update welcome header
    if (document.getElementById("nav-employee").classList.contains("active")) {
        document.getElementById("welcome-message").textContent = `Selamat Datang, ${current.name}!`;
    }
}

// Inject User Selector for Demo Purposes
function injectEmployeeSelector() {
    const consoleCard = document.querySelector(".attendance-console");
    if (!consoleCard) return;

    // Remove existing selector if any
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

    // Prepend to console
    consoleCard.insertBefore(selectGroup, consoleCard.firstChild);
}

function changeActiveUser(id) {
    currentEmployeeId = id;
    updateUserProfileUI();
    checkTodayAttendanceState();
    renderPersonalLogs();
    updatePersonalStats();
    showToast(`Beralih ke karyawan: ${getCurrentEmployee().name}`, "success");
}

// Toggle presence inputs
function togglePresenceTypeInputs() {
    const type = document.querySelector('input[name="presence_type"]:checked').value;
    
    document.getElementById("fields-wfo").style.display = "none";
    document.getElementById("fields-wfh").style.display = "none";
    document.getElementById("fields-absen").style.display = "none";
    document.getElementById("camera-section").style.display = "block";
    document.getElementById("btn-checkin").textContent = "Check-In Presensi";

    if (type === "WFO") {
        document.getElementById("fields-wfo").style.display = "block";
    } else if (type === "WFH") {
        document.getElementById("fields-wfh").style.display = "block";
    } else if (type === "ABSEN") {
        document.getElementById("fields-absen").style.display = "block";
        document.getElementById("camera-section").style.display = "none"; // No camera needed for leave/sick
        document.getElementById("btn-checkin").textContent = "Kirim Permohonan Izin / Cuti";
    }
}

// GPS Simulation Mockup
function simulateGPS() {
    const coords = [
        "-6.2088, 106.8456 (Dalam Radius 15m)",
        "-6.2114, 106.8432 (Dalam Radius 12m)",
        "-6.2099, 106.8471 (Dalam Radius 20m)"
    ];
    const randomCoord = coords[Math.floor(Math.random() * coords.length)];
    document.getElementById("wfo-coords").value = randomCoord;
    showToast("GPS berhasil dipindai!", "success");
}

// Check if already checked in today
function checkTodayAttendanceState() {
    const today = new Date().toISOString().split("T")[0];
    const logToday = attendanceLogs.find(l => l.employeeId === currentEmployeeId && l.date === today);

    const btnCheckin = document.getElementById("btn-checkin");
    const btnCheckout = document.getElementById("btn-checkout");

    if (logToday) {
        if (logToday.type === "ABSEN") {
            btnCheckin.style.display = "block";
            btnCheckin.disabled = true;
            btnCheckin.textContent = `Sudah Mengajukan ${logToday.detail}`;
            btnCheckout.style.display = "none";
        } else if (logToday.checkOutTime) {
            btnCheckin.style.display = "block";
            btnCheckin.disabled = true;
            btnCheckin.textContent = "Sudah Selesai Kerja Hari Ini";
            btnCheckout.style.display = "none";
        } else {
            btnCheckin.style.display = "none";
            btnCheckout.style.display = "block";
        }
    } else {
        btnCheckin.style.display = "block";
        btnCheckin.disabled = false;
        btnCheckout.style.display = "none";
        togglePresenceTypeInputs();
    }
}

// Face Scan Animation & Simulation
function performCheckIn() {
    const type = document.querySelector('input[name="presence_type"]:checked').value;
    const today = new Date().toISOString().split("T")[0];
    
    // Check if duplicate entry
    if (attendanceLogs.some(l => l.employeeId === currentEmployeeId && l.date === today)) {
        showToast("Anda sudah mengajukan kehadiran hari ini!", "warning");
        return;
    }

    if (type === "ABSEN") {
        // Direct processing for Absent/Leave
        const reason = document.getElementById("absen-reason").value;
        const notes = document.getElementById("absen-notes").value || "Tanpa Keterangan";
        
        saveLog(type, "00:00", null, `Izin: ${reason} (${notes})`, "Izin");
        return;
    }

    // WFO or WFH - requires simulated Face Scan
    const scannerLine = document.getElementById("scanner-line");
    const faceOverlay = document.getElementById("face-overlay");
    const cameraFeed = document.getElementById("camera-feed");
    const btnCheckin = document.getElementById("btn-checkin");
    const cameraStatusLabel = document.getElementById("camera-status-label");

    btnCheckin.disabled = true;
    scannerLine.style.display = "block";
    faceOverlay.style.display = "flex";
    cameraFeed.classList.add("scanning");
    cameraStatusLabel.textContent = "Memindai Wajah...";

    // Randomize face image for mock simulation
    const randomFace = mockFaces[Math.floor(Math.random() * mockFaces.length)];
    cameraFeed.src = randomFace;

    setTimeout(() => {
        // Stop animation
        scannerLine.style.display = "none";
        faceOverlay.style.display = "none";
        cameraFeed.classList.remove("scanning");
        cameraStatusLabel.textContent = "Wajah Terverifikasi!";
        
        // Define check-in status
        const now = new Date();
        const checkInTimeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        
        // Let's decide if employee is late (e.g. checkin after 08:30)
        const hour = now.getHours();
        const minutes = now.getMinutes();
        let status = "Tepat Waktu";
        
        if (hour > 8 || (hour === 8 && minutes > 30)) {
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

        saveLog(type, checkInTimeStr, null, detail, status);
    }, 2500);
}

function performCheckOut() {
    const today = new Date().toISOString().split("T")[0];
    const logIndex = attendanceLogs.findIndex(l => l.employeeId === currentEmployeeId && l.date === today);

    if (logIndex === -1) {
        showToast("Data masuk tidak ditemukan!", "error");
        return;
    }

    const now = new Date();
    const checkOutTimeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    
    // Calculate simulated working hours
    const checkinTimeRaw = attendanceLogs[logIndex].checkInTime;
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

    attendanceLogs[logIndex].checkOutTime = checkOutTimeStr;
    attendanceLogs[logIndex].workingHours = workingHours;

    localStorage.setItem("apresi_logs", JSON.stringify(attendanceLogs));
    
    showToast("Berhasil Check-Out! Selamat beristirahat.", "success");
    
    checkTodayAttendanceState();
    renderPersonalLogs();
    updatePersonalStats();
    renderAdminLogs();
    updateAdminStats();
}

function saveLog(type, checkIn, checkOut, detail, status) {
    const employee = getCurrentEmployee();
    const today = new Date().toISOString().split("T")[0];

    const newLog = {
        id: "log-" + Date.now(),
        employeeId: employee.id,
        name: employee.name,
        type: type,
        date: today,
        checkInTime: checkIn,
        checkOutTime: checkOut,
        status: status,
        detail: detail,
        workingHours: 0
    };

    attendanceLogs.unshift(newLog);
    localStorage.setItem("apresi_logs", JSON.stringify(attendanceLogs));

    showToast("Presensi berhasil terkirim!", "success");

    checkTodayAttendanceState();
    renderPersonalLogs();
    updatePersonalStats();
    renderAdminLogs();
    updateAdminStats();
}

// Personal Logs Render
function renderPersonalLogs() {
    const tbody = document.getElementById("personal-history-body");
    tbody.innerHTML = "";

    const userLogs = attendanceLogs.filter(l => l.employeeId === currentEmployeeId);

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
                <td>${log.checkInTime || '-'}</td>
                <td>${log.checkOutTime || '<span class="badge badge-checkout">Belum</span>'}</td>
                <td><span class="${statusClass}">${log.status}</span></td>
            </tr>
        `;
    });
}

// Personal Stats Calculation
function updatePersonalStats() {
    const userLogs = attendanceLogs.filter(l => l.employeeId === currentEmployeeId);
    
    // Persentase Kehadiran
    const presentDays = userLogs.filter(l => l.type === "WFO" || l.type === "WFH").length;
    const absentDays = userLogs.filter(l => l.type === "ABSEN").length;
    const totalDays = presentDays + absentDays;
    const rate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 100;
    document.getElementById("stat-attendance-rate").textContent = `${rate}%`;

    // Total Jam Kerja
    const totalHours = userLogs.reduce((acc, log) => acc + (log.workingHours || 0), 0);
    document.getElementById("stat-hours").textContent = `${totalHours.toFixed(1)}h`;

    // Tepat Waktu
    const onTimeCount = userLogs.filter(l => l.status === "Tepat Waktu").length;
    document.getElementById("stat-ontime").textContent = onTimeCount;
}

// Admin Panel Functions
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
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">Tidak ada data presensi cocok.</td></tr>`;
        return;
    }

    filtered.forEach(log => {
        let typeBadge = `<span class="badge badge-wfo">WFO</span>`;
        if (log.type === "WFH") typeBadge = `<span class="badge badge-wfh">WFH</span>`;
        if (log.type === "ABSEN") typeBadge = `<span class="badge badge-absen">Izin</span>`;

        let statusClass = "stat-footer up";
        if (log.status === "Terlambat") statusClass = "stat-footer down";
        if (log.status === "Izin") statusClass = "stat-footer";

        tbody.innerHTML += `
            <tr>
                <td><strong>${log.name}</strong></td>
                <td>${formatDateIndo(log.date)}</td>
                <td>${typeBadge}</td>
                <td>${log.checkInTime || '-'}</td>
                <td>${log.checkOutTime || '-'}</td>
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

function registerNewEmployee() {
    const nameInput = document.getElementById("new-emp-name");
    const roleInput = document.getElementById("new-emp-role");

    const name = nameInput.value.trim();
    const role = roleInput.value.trim();

    if (!name || !role) {
        showToast("Harap isi semua kolom registrasi!", "error");
        return;
    }

    const newEmp = {
        id: "emp-" + Date.now(),
        name: name,
        role: role
    };

    employees.push(newEmp);
    localStorage.setItem("apresi_employees", JSON.stringify(employees));

    // Reset inputs
    nameInput.value = "";
    roleInput.value = "";

    // Update selectors and stats
    injectEmployeeSelector();
    updateAdminStats();
    
    showToast(`Karyawan ${name} berhasil diregistrasi!`, "success");
}

// CSV Export
function exportToCSV() {
    if (attendanceLogs.length === 0) {
        showToast("Belum ada log presensi untuk diekspor!", "warning");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID Karyawan,Nama Karyawan,Tanggal,Tipe Presensi,Check In,Check Out,Status,Durasi Kerja (Jam),Detail\n";

    attendanceLogs.forEach(log => {
        const row = [
            log.employeeId,
            `"${log.name}"`,
            log.date,
            log.type,
            log.checkInTime || "",
            log.checkOutTime || "",
            log.status,
            log.workingHours || 0,
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

// Toast Notifications Helper
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

    // Auto remove
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
