const registerForm = document.getElementById('register-form');
const playerForm = document.getElementById('player-form');
const adminForm = document.getElementById('admin-form');
const adminPanel = document.getElementById('admin-panel');
const authArea = document.getElementById('auth-area');
const output = document.getElementById('output');
const homeScreen = document.getElementById('homepage');
const homeMessage = document.getElementById('home-message');
const coinDisplay = document.getElementById('coin-display');
const logoutButton = document.getElementById('logout-button');
const tabButtons = document.querySelectorAll('.tab-button');
const registerCard = document.getElementById('register-card');
const playerCard = document.getElementById('player-card');
const adminToggleButton = document.getElementById('admin-toggle-button');
const adminTransferSection = document.getElementById('admin-transfer');
const adminTransferForm = document.getElementById('admin-transfer-form');
const adminRequestsSection = document.getElementById('admin-requests-section');
const adminRequestsList = document.getElementById('admin-requests-list');
const buyCoinsButton = document.getElementById('buy-coins-button');
const buyCoinsPanel = document.getElementById('buy-coins-panel');
const sellCoinsButton = document.getElementById('sell-coins-button');
const sellCoinsPanel = document.getElementById('sell-coins-panel');
const sellCoinsForm = document.getElementById('sell-coins-form');
const transferCoinsButton = document.getElementById('transfer-coins-button');
const transferCoinsSection = document.getElementById('transfer-coins-section');
const transferCoinsForm = document.getElementById('transfer-coins-form');

// VARIABEL DOM UNTUK FITUR QUEST (PENAMBAHAN)
const adminQuestSection = document.getElementById('admin-quest-section');
const adminQuestForm = document.getElementById('admin-quest-form');
const adminQuestApproval = document.getElementById('admin-quest-approval');
const adminQuestApprovalList = document.getElementById('admin-quest-approval-list');
const playerQuestSection = document.getElementById('player-quest-section');
const playerQuestList = document.getElementById('player-quest-list');
const playerCreateQuestSection = document.getElementById('player-create-quest-section');
const playerQuestForm = document.getElementById('player-quest-form');
const playerQuestApprovalSection = document.getElementById('player-quest-approval-section');
const playerQuestApprovalList = document.getElementById('player-quest-approval-list');
const questRefreshButton = document.getElementById('quest-refresh-button');
const playerProfileBox = document.getElementById('player-profile-box');
const profilePhotoButton = document.getElementById('profile-photo-button');
const profilePhotoInput = document.getElementById('profile-photo-input');
const profilePhotoPreview = document.getElementById('profile-photo-preview');

let currentUser = null;
let currentRole = null;
let currentProfilePhoto = '';
let questRefreshTimer = null;

const secretSequence = 'danishkeren123';
let typedSequence = '';
const adminCredentials = { username: 'admin', password: 'admin123' };

async function registerAccount(username, password) {
    try {
        const response = await fetch('/accounts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Gagal mendaftar (HTTP ${response.status})`);
        }

        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) {
            throw new Error('Tidak dapat terhubung ke server. Pastikan server berjalan di http://localhost:3000');
        }
        throw error;
    }
}

async function loginPlayer(username, password) {
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Login gagal');
        }

        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) {
            throw new Error('Tidak dapat terhubung ke server. Pastikan server berjalan di http://localhost:3000');
        }
        throw error;
    }
}

async function saveProfilePhoto(username, profilePhoto) {
    try {
        const response = await fetch('/profile-photo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, profilePhoto })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Gagal menyimpan foto profil');
        }

        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) {
            throw new Error('Tidak dapat terhubung ke server. Pastikan server berjalan di http://localhost:3000');
        }
        throw error;
    }
}

function getInitials(name) {
    return String(name || 'P')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || 'P';
}

function renderProfilePhoto(profilePhoto = '', username = currentUser) {
    if (!profilePhotoPreview) {
        return;
    }

    profilePhotoPreview.textContent = getInitials(username);
    profilePhotoPreview.style.backgroundImage = profilePhoto ? `url("${profilePhoto}")` : '';
    profilePhotoPreview.classList.toggle('has-photo', Boolean(profilePhoto));
}

function updateCoinDisplay(coins) {
    if (coinDisplay && Number.isFinite(Number(coins))) {
        coinDisplay.textContent = `Koin: ${Number(coins)}`;
    }
}

async function giveCoinsToPlayer(username, amount) {
    try {
        const response = await fetch('/admin/coins', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, amount })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Gagal mengirim koin');
        }

        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) {
            throw new Error('Tidak dapat terhubung ke server. Pastikan server berjalan di http://localhost:3000');
        }
        throw error;
    }
}

async function submitSellRequest(username, amount, provider, accountNumber) {
    try {
        const response = await fetch('/sell-requests', {
            method: 'POST',
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, amount, provider, accountNumber })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Gagal membuat permintaan jual koin');
        }

        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) {
            throw new Error('Tidak dapat terhubung ke server. Pastikan server berjalan di http://localhost:3000');
        }
        throw error;
    }
}

async function fetchAdminSellRequests() {
    try {
        const response = await fetch('/admin/sell-requests', { cache: 'no-store' });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Gagal mengambil permintaan jual koin');
        }
        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) {
            throw new Error('Tidak dapat terhubung ke server. Pastikan server berjalan di http://localhost:3000');
        }
        throw error;
    }
}

async function updateSellRequest(action, requestId) {
    try {
        const response = await fetch(`/admin/sell-requests/${action}`, {
            method: 'POST',
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id: requestId })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Gagal ${action} permintaan`);
        }

        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) {
            throw new Error('Tidak dapat terhubung ke server. Pastikan server berjalan di http://localhost:3000');
        }
        throw error;
    }
}

async function transferCoins(fromUsername, toUsername, amount) {
    try {
        const response = await fetch('/transfer-coins', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fromUsername, toUsername, amount })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Gagal melakukan transfer koin');
        }

        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) {
            throw new Error('Tidak dapat terhubung ke server. Pastikan server berjalan di http://localhost:3000');
        }
        throw error;
    }
}

async function createPlayerQuest(payload) {
    try {
        const response = await fetch('/quests/player', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Gagal membuat quest player');
        }

        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) {
            throw new Error('Tidak dapat terhubung ke server. Pastikan server berjalan di http://localhost:3000');
        }
        throw error;
    }
}

async function fetchPlayerQuestApprovals(username) {
    try {
        const response = await fetch('/player/quest-approvals', {
            method: 'POST',
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Gagal mengambil approval quest player');
        }

        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) {
            throw new Error('Tidak dapat terhubung ke server. Pastikan server berjalan di http://localhost:3000');
        }
        throw error;
    }
}

async function approvePlayerQuest(id) {
    try {
        const response = await fetch('/quests/player/approve', {
            method: 'POST',
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id, approverUsername: currentUser })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Gagal approve quest player');
        }

        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) {
            throw new Error('Tidak dapat terhubung ke server. Pastikan server berjalan di http://localhost:3000');
        }
        throw error;
    }
}

function renderAdminSellRequests(requests) {
    if (!adminRequestsList) {
        return;
    }

    adminRequestsList.innerHTML = '';

    if (!requests.length) {
        adminRequestsList.textContent = 'Tidak ada permintaan jual koin saat ini.';
        return;
    }

    requests.forEach((request) => {
        const item = document.createElement('div');
        item.className = 'request-item';

        const meta = document.createElement('div');
        meta.className = 'request-meta';
        meta.innerHTML = `
            <strong>${request.playerUsername}</strong> - ${request.amount} koin
            <div class="request-status ${request.status}">${request.status}</div>
        `;

        const details = document.createElement('div');
        details.className = 'request-details';
        details.innerHTML = `
            <span>Metode: ${request.provider}</span>
            <span>Akun: ${request.accountNumber}</span>
            <span>ID: ${request.id}</span>
        `;

        item.appendChild(meta);
        item.appendChild(details);

        const actions = document.createElement('div');
        actions.className = 'request-actions';

        if (request.status === 'pending') {
            const approveButton = document.createElement('button');
            approveButton.type = 'button';
            approveButton.textContent = 'Approve';
            approveButton.addEventListener('click', async () => {
                try {
                    await updateSellRequest('approve', request.id);
                    const response = await fetchAdminSellRequests();
                    renderAdminSellRequests(response);
                    showMessage(`Permintaan ${request.id} disetujui.`);
                } catch (error) {
                    showMessage(error.message, true);
                }
            });

            const declineButton = document.createElement('button');
            declineButton.type = 'button';
            declineButton.textContent = 'Decline';
            declineButton.addEventListener('click', async () => {
                try {
                    await updateSellRequest('decline', request.id);
                    const response = await fetchAdminSellRequests();
                    renderAdminSellRequests(response);
                    showMessage(`Permintaan ${request.id} ditolak.`);
                } catch (error) {
                    showMessage(error.message, true);
                }
            });

            actions.appendChild(approveButton);
            actions.appendChild(declineButton);
        } else {
            const clearButton = document.createElement('button');
            clearButton.type = 'button';
            clearButton.textContent = 'Clear';
            clearButton.addEventListener('click', async () => {
                try {
                    await updateSellRequest('clear', request.id);
                    const response = await fetchAdminSellRequests();
                    renderAdminSellRequests(response);
                    showMessage(`Permintaan ${request.id} telah dihapus dari kotak surat.`);
                } catch (error) {
                    showMessage(error.message, true);
                }
            });
            actions.appendChild(clearButton);
        }

        if (actions.childElementCount > 0) {
            item.appendChild(actions);
        }

        adminRequestsList.appendChild(item);
    });
}

function showMessage(text, isError = false) {
    output.classList.remove('hidden');
    output.textContent = text;
    output.style.color = isError ? '#b91c1c' : '#0f172a';
}

function stopQuestAutoRefresh() {
    if (questRefreshTimer) {
        clearInterval(questRefreshTimer);
        questRefreshTimer = null;
    }
}

function startQuestAutoRefresh(callback, delay = 7000) {
    stopQuestAutoRefresh();
    questRefreshTimer = setInterval(() => {
        if (currentUser) {
            callback();
        }
    }, delay);
}

function showHome(role, name, coins = 0, profilePhoto = '') {
    currentUser = name;
    currentRole = role;
    currentProfilePhoto = profilePhoto || '';
    stopQuestAutoRefresh();
    const coinAmount = coins ?? 0;
    authArea.classList.add('hidden');
    output.classList.add('hidden');
    renderProfilePhoto(currentProfilePhoto, name);

    if (role === 'Admin') {
        coinDisplay.style.display = 'none';
        playerProfileBox?.classList.add('hidden');
        buyCoinsButton?.classList.add('hidden');
        buyCoinsPanel?.classList.add('hidden');
        sellCoinsButton?.classList.add('hidden');
        sellCoinsPanel?.classList.add('hidden');
        transferCoinsButton?.classList.add('hidden');
        transferCoinsSection?.classList.add('hidden');
        playerCreateQuestSection?.classList.add('hidden');
        playerQuestSection?.classList.add('hidden');
        playerQuestApprovalSection?.classList.add('hidden');
        if (adminTransferSection) {
            adminTransferSection.classList.remove('hidden');
        }
        if (adminRequestsSection) {
            adminRequestsSection.classList.remove('hidden');
            fetchAdminSellRequests()
                .then((result) => renderAdminSellRequests(result))
                .catch((error) => showMessage(error.message, true));
        }
        // VISIBILITY QUEST ADMIN (PENAMBAHAN)
        if (adminQuestSection) adminQuestSection.classList.remove('hidden');
        if (adminQuestApproval) {
            adminQuestApproval.classList.remove('hidden');
            loadAdminApprovals();
            startQuestAutoRefresh(loadAdminApprovals, 8000);
        }
    } else {
        coinDisplay.style.display = 'block';
        updateCoinDisplay(coinAmount);
        playerProfileBox?.classList.remove('hidden');
        buyCoinsButton?.classList.remove('hidden');
        sellCoinsButton?.classList.remove('hidden');
        transferCoinsButton?.classList.remove('hidden');
        buyCoinsPanel?.classList.add('hidden');
        sellCoinsPanel?.classList.add('hidden');
        transferCoinsSection?.classList.add('hidden');
        if (adminTransferSection) {
            adminTransferSection.classList.add('hidden');
        }
        if (adminRequestsSection) {
            adminRequestsSection.classList.add('hidden');
        }
        if (adminQuestSection) adminQuestSection.classList.add('hidden');
        if (adminQuestApproval) adminQuestApproval.classList.add('hidden');
        if (playerCreateQuestSection) playerCreateQuestSection.classList.remove('hidden');
        if (playerQuestApprovalSection) playerQuestApprovalSection.classList.remove('hidden');
        // VISIBILITY QUEST PLAYER (PENAMBAHAN)
        if (playerQuestSection) {
            playerQuestSection.classList.remove('hidden');
            refreshPlayerQuestViews();
            startQuestAutoRefresh(refreshPlayerQuestViews, 6000);
        }
    }

    homeMessage.textContent = `Halo ${name}, Anda berhasil masuk sebagai ${role}. Selamat datang di beranda.`;
    homeScreen.classList.remove('hidden');
}

function showAuth() {
    currentUser = null;
    currentRole = null;
    currentProfilePhoto = '';
    stopQuestAutoRefresh();
    homeScreen.classList.add('hidden');
    authArea.classList.remove('hidden');
    output.classList.remove('hidden');
    buyCoinsButton?.classList.add('hidden');
    buyCoinsPanel?.classList.add('hidden');
    sellCoinsButton?.classList.add('hidden');
    sellCoinsPanel?.classList.add('hidden');
    transferCoinsButton?.classList.add('hidden');
    transferCoinsSection?.classList.add('hidden');
    if (adminTransferSection) {
        adminTransferSection.classList.add('hidden');
    }
    if (adminRequestsSection) {
        adminRequestsSection.classList.add('hidden');
    }
    // HIDE QUEST KETIKA LOGOUT (PENAMBAHAN)
    if (adminQuestSection) adminQuestSection.classList.add('hidden');
    if (adminQuestApproval) adminQuestApproval.classList.add('hidden');
    if (playerQuestSection) playerQuestSection.classList.add('hidden');
    if (playerCreateQuestSection) playerCreateQuestSection.classList.add('hidden');
    if (playerQuestApprovalSection) playerQuestApprovalSection.classList.add('hidden');
    playerProfileBox?.classList.add('hidden');

    showMessage('Silakan login atau daftar lagi.');
}

function activateTab(button) {
    const targetId = button.dataset.target;
    [registerCard, playerCard, adminPanel].forEach((section) => {
        if (section) {
            section.classList.add('hidden');
        }
    });

    const targetSection = document.getElementById(targetId);
    if (targetSection) {
        targetSection.classList.remove('hidden');
    }

    tabButtons.forEach((item) => item.classList.toggle('active', item === button));
}

function unlockAdminPanel() {
    if (adminToggleButton && adminToggleButton.classList.contains('hidden')) {
        adminToggleButton.classList.remove('hidden');
        showMessage('Admin dapat diakses. Klik tombol Login Admin untuk masuk.');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const activeButton = document.querySelector('.tab-button.active');
    if (activeButton) {
        activateTab(activeButton);
    }

    tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
            activateTab(button);
        });
    });

    showMessage('Pilih tombol untuk melanjutkan.');
});

document.addEventListener('keydown', (event) => {
    if (!event.key || event.key.length !== 1) {
        return;
    }

    typedSequence += event.key.toLowerCase();
    if (typedSequence.length > secretSequence.length) {
        typedSequence = typedSequence.slice(-secretSequence.length);
    }

    if (typedSequence === secretSequence) {
        unlockAdminPanel();
        typedSequence = '';
    }
});

registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('register-name').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;

    if (!name || !password) {
        showMessage('Nama dan password harus diisi.', true);
        return;
    }

    if (password !== confirm) {
        showMessage('Password dan konfirmasi tidak cocok. Coba lagi.', true);
        return;
    }

    try {
        await registerAccount(name, password);
        registerForm.reset();
        showMessage('Akun player berhasil didaftarkan. Silakan login.');
    } catch (error) {
        showMessage(error.message, true);
    }
});

playerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const playerName = document.getElementById('player-name').value.trim();
    const playerPassword = document.getElementById('player-password').value;

    try {
        const result = await loginPlayer(playerName, playerPassword);
        showHome('Player', result.username, result.coins, result.profilePhoto);
    } catch (error) {
        showMessage(error.message, true);
    }
});

adminForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const adminName = document.getElementById('admin-name').value.trim();
    const adminPassword = document.getElementById('admin-password').value;

    if (adminName === adminCredentials.username && adminPassword === adminCredentials.password) {
        showHome('Admin', adminName);
    } else {
        showMessage('Username atau password admin salah. Coba lagi.', true);
    }
});

if (adminTransferForm) {
    adminTransferForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const playerName = document.getElementById('transfer-player-name').value.trim();
        const amount = Number(document.getElementById('transfer-amount').value);

        if (!playerName || !amount || amount <= 0) {
            showMessage('Nama player dan jumlah koin harus diisi dengan benar.', true);
            return;
        }

        try {
            const result = await giveCoinsToPlayer(playerName, amount);
            adminTransferForm.reset();
            document.getElementById('transfer-amount').value = '1';
            showMessage(`Berhasil menambahkan ${result.amountAdded} koin ke ${result.username}.`);
        } catch (error) {
            showMessage(error.message, true);
        }
    });
}

function closeBuyCoinsModal() {
    buyCoinsPanel?.classList.add('hidden');
}

if (sellCoinsButton) {
    sellCoinsButton.addEventListener('click', () => {
        if (sellCoinsPanel) {
            sellCoinsPanel.classList.toggle('hidden');
        }
        closeBuyCoinsModal();
    });
}

if (buyCoinsButton) {
    buyCoinsButton.addEventListener('click', () => {
        if (buyCoinsPanel) {
            buyCoinsPanel.classList.toggle('hidden');
        }
        sellCoinsPanel?.classList.add('hidden');
    });
}

const buyCloseButton = document.getElementById('buy-close-button');

if (buyCoinsPanel) {
    buyCoinsPanel.addEventListener('click', (event) => {
        if (event.target === buyCoinsPanel) {
            closeBuyCoinsModal();
        }
    });
}

if (buyCloseButton) {
    buyCloseButton.addEventListener('click', (event) => {
        event.stopPropagation();
        closeBuyCoinsModal();
    });
}

if (profilePhotoButton && profilePhotoInput) {
    profilePhotoButton.addEventListener('click', () => {
        if (!currentUser || currentRole !== 'Player') {
            showMessage('Login sebagai player dulu untuk mengganti foto profil.', true);
            return;
        }

        profilePhotoInput.click();
    });
}

if (profilePhotoInput) {
    profilePhotoInput.addEventListener('change', () => {
        if (!currentUser || currentRole !== 'Player') {
            showMessage('Login sebagai player dulu untuk mengganti foto profil.', true);
            profilePhotoInput.value = '';
            return;
        }

        const file = profilePhotoInput.files?.[0];
        if (!file) {
            return;
        }

        if (!file.type.startsWith('image/')) {
            showMessage('File foto profil harus berupa gambar.', true);
            profilePhotoInput.value = '';
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            showMessage('Ukuran foto profil maksimal 2 MB agar akun tetap ringan.', true);
            profilePhotoInput.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const profilePhoto = String(reader.result || '');
                const result = await saveProfilePhoto(currentUser, profilePhoto);
                currentProfilePhoto = result.profilePhoto || profilePhoto;
                renderProfilePhoto(currentProfilePhoto, currentUser);
                showMessage('Foto profil berhasil diperbarui.');
            } catch (error) {
                showMessage(error.message, true);
            } finally {
                profilePhotoInput.value = '';
            }
        };
        reader.onerror = () => {
            showMessage('Gagal membaca file foto profil.', true);
            profilePhotoInput.value = '';
        };
        reader.readAsDataURL(file);
    });
}

if (sellCoinsForm) {
    sellCoinsForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!currentUser || currentRole !== 'Player') {
            showMessage('Anda harus login sebagai player terlebih dahulu.', true);
            return;
        }

        const amount = Number(document.getElementById('sell-amount').value);
        const provider = document.getElementById('sell-method').value;
        const accountNumber = document.getElementById('sell-account').value.trim();

        if (!accountNumber || !amount || amount <= 0) {
            showMessage('Isi semua data dengan benar sebelum mengirim permintaan.', true);
            return;
        }

        try {
            await submitSellRequest(currentUser, amount, provider, accountNumber);
            sellCoinsForm.reset();
            document.getElementById('sell-amount').value = '1';
            sellCoinsPanel?.classList.add('hidden');
            showMessage(`Permintaan penjualan ${amount} koin telah dikirim. Tunggu admin approve.`);
        } catch (error) {
            showMessage(error.message, true);
        }
    });
}

if (transferCoinsButton) {
    transferCoinsButton.addEventListener('click', () => {
        if (transferCoinsSection) {
            transferCoinsSection.classList.toggle('hidden');
        }
        sellCoinsPanel?.classList.add('hidden');
        buyCoinsPanel?.classList.add('hidden');
    });
}

if (transferCoinsForm) {
    transferCoinsForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!currentUser || currentRole !== 'Player') {
            showMessage('Anda harus login sebagai player terlebih dahulu.', true);
            return;
        }

        const targetPlayer = document.getElementById('transfer-target-player').value.trim();
        const amount = Number(document.getElementById('transfer-coins-amount').value);

        if (!targetPlayer || !amount || amount <= 0) {
            showMessage('Nama player tujuan dan jumlah koin harus diisi dengan benar.', true);
            return;
        }

        if (targetPlayer === currentUser) {
            showMessage('Anda tidak bisa transfer koin ke diri sendiri.', true);
            return;
        }

        // Verifikasi pertama
        const firstConfirm = confirm(`Transfer ${amount} koin ke ${targetPlayer}?`);
        if (!firstConfirm) {
            showMessage('Transfer dibatalkan.', false);
            return;
        }

        // Verifikasi kedua
        const secondConfirm = confirm(`Apakah nominal koin yang ingin di transfer sudah benar? (${amount} koin ke ${targetPlayer})`);
        if (!secondConfirm) {
            showMessage('Transfer dibatalkan.', false);
            return;
        }

        try {
            const transferResult = await transferCoins(currentUser, targetPlayer, amount);
            transferCoinsForm.reset();
            document.getElementById('transfer-coins-amount').value = '1';
            transferCoinsSection?.classList.add('hidden');
            coinDisplay.textContent = `Koin: ${transferResult.fromCoins}`;
            showMessage(`Transfer ${amount} koin ke ${targetPlayer} berhasil!`);
        } catch (error) {
            showMessage(error.message, true);
        }
    });
}

logoutButton.addEventListener('click', () => {
    showAuth();
});

// --- LOGIKA SISTEM QUEST (PENAMBAHAN) ---

// Buat Quest (Admin)
if (adminQuestForm) {
    adminQuestForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const title = document.getElementById('quest-title').value.trim();
        const reward = Number(document.getElementById('quest-reward').value);
        const duration = Number(document.getElementById('quest-duration').value);
        const penalty = Number(document.getElementById('quest-penalty').value);

        try {
            const response = await fetch('/admin/quests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, reward, duration, penalty })
            });
            if (!response.ok) throw new Error("Gagal membuat quest baru.");
            showMessage("Quest berhasil dibuat!");
            adminQuestForm.reset();
        } catch (error) {
            showMessage(error.message, true);
        }
    });
}

// Buat Quest (Player untuk sesama player)
if (playerQuestForm) {
    playerQuestForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!currentUser || currentRole !== 'Player') {
            showMessage('Anda harus login sebagai player terlebih dahulu.', true);
            return;
        }

        const title = document.getElementById('player-quest-title').value.trim();
        const targetUsername = document.getElementById('player-quest-target').value.trim();
        const reward = Number(document.getElementById('player-quest-reward').value);
        const duration = Number(document.getElementById('player-quest-duration').value);

        if (!title || !reward || !duration) {
            showMessage('Isi judul, hadiah, dan durasi quest dengan benar.', true);
            return;
        }

        try {
            const result = await createPlayerQuest({
                title,
                targetUsername,
                reward,
                duration,
                createdBy: currentUser
            });
            playerQuestForm.reset();
            document.getElementById('player-quest-reward').value = '1';
            document.getElementById('player-quest-duration').value = '30';
            updateCoinDisplay(result.creatorCoins);
            await refreshPlayerQuestViews();
            showMessage(targetUsername ? `Quest untuk ${targetUsername} berhasil dibuat. Reward ${reward} koin sudah ditahan sistem.` : `Quest player berhasil dibuat. Reward ${reward} koin sudah ditahan sistem.`);
        } catch (error) {
            showMessage(error.message, true);
        }
    });
}

if (questRefreshButton) {
    questRefreshButton.addEventListener('click', () => {
        refreshPlayerQuestViews();
        showMessage('Papan quest diperbarui.');
    });
}

function getQuestSourceLabel(quest) {
    return quest.source === 'admin' ? 'Quest Admin Prioritas' : 'Quest Player';
}

function getQuestTargetText(quest) {
    if (quest.source === 'admin') {
        return 'Untuk semua player';
    }

    if (quest.targetUsername) {
        return `Untuk ${quest.targetUsername}`;
    }

    return `Dari ${quest.createdBy || 'Player'} untuk semua player lain`;
}

function getQuestMetaText(quest) {
    const baseText = `Imbalan: ${quest.reward} Koin | Waktu: ${quest.duration} Menit`;

    if (quest.source === 'player') {
        return `${baseText} | Tanpa denda`;
    }

    return `${baseText} | Denda: ${quest.penalty} Koin`;
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
}

async function refreshPlayerQuestViews() {
    await Promise.all([
        loadPlayerQuests(),
        loadPlayerQuestApprovals()
    ]);
}

// Render Papan Quest untuk Player
async function loadPlayerQuests() {
    if (!playerQuestList) return;
    try {
        const resQuests = await fetch(`/quests?username=${encodeURIComponent(currentUser || '')}`, { cache: 'no-store' });
        const quests = await resQuests.json();

        const resMyQuests = await fetch('/my-quests', {
            method: 'POST',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser })
        });
        const myQuests = await resMyQuests.json();
        const completedQuestIds = new Set(myQuests.filter(mq => mq.status === 'completed').map(mq => mq.questId));
        const visibleQuests = quests.filter(q => !completedQuestIds.has(q.id));

        playerQuestList.innerHTML = '';

        if (visibleQuests.length === 0) {
            playerQuestList.innerHTML = 'Belum ada quest tersedia saat ini.';
            return;
        }

        visibleQuests.forEach(q => {
            const myActiveQuest = myQuests.find(mq => mq.questId === q.id && mq.status === 'pending');
            const item = document.createElement('div');
            item.className = `quest-item ${q.source === 'admin' ? 'quest-admin' : 'quest-player'}`;

            let actionHtml = '';
            if (myActiveQuest) {
                const timeLeft = Math.max(0, Math.ceil((myActiveQuest.deadline - Date.now()) / 60000));
                const approverText = q.source === 'player' ? `Tunggu ${q.createdBy || 'pembuat quest'} approve jika sudah selesai.` : 'Tunggu admin approve jika sudah selesai.';
                actionHtml = `<p class="quest-timer">Sedang dikerjakan. Sisa waktu: ${timeLeft} menit. ${escapeHtml(approverText)}</p>`;
            } else {
                actionHtml = `<button type="button" onclick="takeQuest('${q.id}')">Kerjakan Quest</button>`;
            }

            item.innerHTML = `
                <div class="quest-heading">
                    <span class="quest-badge">${escapeHtml(getQuestSourceLabel(q))}</span>
                    <span class="quest-target">${escapeHtml(getQuestTargetText(q))}</span>
                </div>
                <h4>${escapeHtml(q.title)}</h4>
                <div class="quest-meta">
                    ${escapeHtml(getQuestMetaText(q))}
                </div>
                ${actionHtml}
            `;
            playerQuestList.appendChild(item);
        });
    } catch (error) {
        playerQuestList.innerHTML = 'Papan quest belum bisa dimuat. Coba refresh sebentar lagi.';
    }
}

// Fungsi global untuk ambil Quest (Player)
window.takeQuest = async function (questId) {
    try {
        const res = await fetch('/quests/take', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ questId, username: currentUser })
        });
        if (!res.ok) throw new Error("Gagal mengambil quest.");
        showMessage("Quest berhasil diambil, segera selesaikan sebelum waktu habis!");
        refreshPlayerQuestViews();
    } catch (error) {
        showMessage(error.message, true);
    }
};

// Render approval quest yang dibuat oleh player login
async function loadPlayerQuestApprovals() {
    if (!playerQuestApprovalList || currentRole !== 'Player') return;

    try {
        const result = await fetchPlayerQuestApprovals(currentUser);
        const approvals = result.approvals || [];
        updateCoinDisplay(result.coins);
        playerQuestApprovalList.innerHTML = '';

        if (!approvals.length) {
            playerQuestApprovalList.innerHTML = 'Belum ada quest buatan Anda yang sedang menunggu approve.';
            return;
        }

        approvals.forEach((pq) => {
            const timeLeft = Math.max(0, Math.ceil((pq.deadline - Date.now()) / 60000));
            const item = document.createElement('div');
            item.className = 'quest-item quest-player';
            item.innerHTML = `
                <div class="quest-heading">
                    <span class="quest-badge">Butuh Approval Anda</span>
                    <span class="quest-target">${escapeHtml(pq.username)} sedang mengerjakan</span>
                </div>
                <h4>${escapeHtml(pq.title)}</h4>
                <div class="quest-meta">
                    Imbalan ditahan: ${pq.reward} Koin | Sisa waktu: ${timeLeft} menit | Tanpa denda
                </div>
                <button type="button" onclick="approveCreatedPlayerQuest('${pq.id}')" style="background:#0f9f6e;">Approve Selesai</button>
            `;
            playerQuestApprovalList.appendChild(item);
        });
    } catch (error) {
        playerQuestApprovalList.innerHTML = 'Approval quest player belum bisa dimuat.';
    }
}

window.approveCreatedPlayerQuest = async function (id) {
    try {
        const result = await approvePlayerQuest(id);
        updateCoinDisplay(result.approverCoins);
        await refreshPlayerQuestViews();
        showMessage(`Quest disetujui. Reward terkirim ke ${result.receiverUsername}.`);
    } catch (error) {
        showMessage(error.message, true);
    }
};

// Render daftar Approval untuk Admin
async function loadAdminApprovals() {
    if (!adminQuestApprovalList) return;
    try {
        const res = await fetch('/admin/player-quests', { cache: 'no-store' });
        const playerQuests = await res.json();
        const pendings = playerQuests
            .filter(pq => pq.status === 'pending' && pq.source !== 'player')
            .sort((a, b) => {
                const aPriority = a.source === 'admin' ? 0 : 1;
                const bPriority = b.source === 'admin' ? 0 : 1;
                return aPriority - bPriority;
            });

        adminQuestApprovalList.innerHTML = '';
        if (pendings.length === 0) {
            adminQuestApprovalList.innerHTML = 'Belum ada player yang sedang mengambil quest.';
            return;
        }

        pendings.forEach(pq => {
            const timeLeft = Math.max(0, Math.ceil((pq.deadline - Date.now()) / 60000));
            const item = document.createElement('div');
            item.className = `quest-item ${pq.source === 'admin' ? 'quest-admin' : 'quest-player'}`;
            item.innerHTML = `
                <div class="quest-heading">
                    <span class="quest-badge">${escapeHtml(getQuestSourceLabel(pq))}</span>
                    <span class="quest-target">${escapeHtml(pq.createdBy ? `Dibuat oleh ${pq.createdBy}` : 'Quest lama')}</span>
                </div>
                <h4>${escapeHtml(pq.title)}</h4>
                <div class="quest-meta">
                    <strong>Player:</strong> ${escapeHtml(pq.username)} | <strong>Sisa Waktu:</strong> ${timeLeft} menit <br>
                    <strong>Imbalan Jika Selesai:</strong> ${pq.reward} Koin
                </div>
                <button type="button" onclick="approveQuest('${pq.id}')" style="background:#10b981;">Approve Selesai</button>
            `;
            adminQuestApprovalList.appendChild(item);
        });
    } catch (error) { }
}

// Fungsi global Approve (Admin)
window.approveQuest = async function (id) {
    try {
        const res = await fetch('/admin/quests/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        if (!res.ok) throw new Error("Gagal di-approve (mungkin telat/waktu telah habis).");
        showMessage("Quest disetujui, koin imbalan telah dikirim ke player.");
        loadAdminApprovals();
    } catch (error) {
        showMessage(error.message, true);
    }
};
