const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const url = require('url');
const { exec } = require('child_process');

const port = Number(process.env.PORT) || 3000;
const rootDir = __dirname;
const accountsFile = path.join(rootDir, 'accounts.json');
const sellRequestsFile = path.join(rootDir, 'sell_requests.json');

// PENAMBAHAN FILE UNTUK QUEST
const questsFile = path.join(rootDir, 'quests.json');
const playerQuestsFile = path.join(rootDir, 'player_quests.json');

async function readAccounts() {
    try {
        const file = await fs.readFile(accountsFile, 'utf8');
        return JSON.parse(file);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(accountsFile, '[]', 'utf8');
            return [];
        }
        throw error;
    }
}

async function writeAccounts(accounts) {
    await fs.writeFile(accountsFile, JSON.stringify(accounts, null, 4), 'utf8');
}

async function readSellRequests() {
    try {
        const file = await fs.readFile(sellRequestsFile, 'utf8');
        return JSON.parse(file);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(sellRequestsFile, '[]', 'utf8');
            return [];
        }
        throw error;
    }
}

async function writeSellRequests(requests) {
    await fs.writeFile(sellRequestsFile, JSON.stringify(requests, null, 4), 'utf8');
}

// PENAMBAHAN FUNGSI BACA TULIS JSON UNTUK QUEST
async function readJsonFile(filePath) {
    try {
        const file = await fs.readFile(filePath, 'utf8');
        return JSON.parse(file);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(filePath, '[]', 'utf8');
            return [];
        }
        throw error;
    }
}

async function writeJsonFile(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 4), 'utf8');
}

function createId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function findAccountByUsername(accounts, username) {
    const target = String(username || '').trim().toLowerCase();
    return accounts.find((item) => item.username && item.username.toLowerCase() === target);
}

function validateQuestPayload(body, options = {}) {
    const title = String(body.title || '').trim();
    const reward = Number(body.reward);
    const duration = Number(body.duration);
    const needsPenalty = options.needsPenalty !== false;
    const penalty = needsPenalty ? Number(body.penalty) : 0;

    if (!title || !Number.isInteger(reward) || reward <= 0 || !Number.isInteger(duration) || duration <= 0) {
        return { error: 'Judul, imbalan, dan durasi quest harus diisi dengan benar.' };
    }

    if (needsPenalty && (!Number.isInteger(penalty) || penalty <= 0)) {
        return { error: 'Judul, imbalan, durasi, dan denda quest harus diisi dengan benar.' };
    }

    return { title, reward, duration, penalty };
}

function normalizeQuest(quest) {
    const source = quest.source === 'player' ? 'player' : 'admin';
    const createdBy = String(quest.createdBy || (source === 'admin' ? 'Admin' : '')).trim();
    const targetUsername = String(quest.targetUsername || '').trim();

    return {
        ...quest,
        source,
        createdBy,
        targetUsername,
        priority: source === 'admin' ? 0 : 1,
        createdAt: quest.createdAt || ''
    };
}

function sortQuests(quests) {
    return quests
        .map(normalizeQuest)
        .sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            return String(b.createdAt || b.id).localeCompare(String(a.createdAt || a.id));
        });
}

function isQuestVisibleForUser(quest, username) {
    const playerName = String(username || '').trim().toLowerCase();
    const creatorName = String(quest.createdBy || '').trim().toLowerCase();
    const targetName = String(quest.targetUsername || '').trim().toLowerCase();

    if (quest.source === 'player' && creatorName && creatorName === playerName) {
        return false;
    }

    if (targetName && targetName !== playerName) {
        return false;
    }

    return true;
}

function isQuestVisibleOnBoard(quest, username, playerQuests) {
    const normalizedQuest = normalizeQuest(quest);

    if (!isQuestVisibleForUser(normalizedQuest, username)) {
        return false;
    }

    if (normalizedQuest.source !== 'player') {
        return true;
    }

    if (normalizedQuest.status && normalizedQuest.status !== 'open') {
        return false;
    }

    if (normalizedQuest.escrowStatus && normalizedQuest.escrowStatus !== 'held') {
        return false;
    }

    const relatedQuests = playerQuests.filter((pq) => pq.questId === normalizedQuest.id);
    const activeQuest = relatedQuests.find((pq) => pq.status === 'pending');
    if (activeQuest) {
        return String(activeQuest.username || '').toLowerCase() === String(username || '').toLowerCase();
    }

    return !relatedQuests.some((pq) => pq.status === 'completed' || pq.status === 'failed');
}

function isValidProfilePhoto(profilePhoto) {
    if (profilePhoto === '') {
        return true;
    }

    return /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=]+$/i.test(profilePhoto) && profilePhoto.length <= 3000000;
}

function sendJSON(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body, 'utf8'),
        'Cache-Control': 'no-store'
    });
    res.end(body);
}

function sendFile(res, filePath) {
    return fs.readFile(filePath)
        .then((content) => {
            const ext = path.extname(filePath).toLowerCase();
            const types = {
                '.html': 'text/html',
                '.css': 'text/css',
                '.js': 'application/javascript',
                '.json': 'application/json'
            };
            const contentType = types[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        })
        .catch(() => {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
        });
}

function parseRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk.toString();
        });
        req.on('end', () => {
            if (!body) {
                return resolve({});
            }
            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

// Background Task: Auto-Deduct Penalty jika Quest Telat (PENAMBAHAN)
setInterval(async () => {
    try {
        const playerQuests = await readJsonFile(playerQuestsFile);
        const accounts = await readAccounts();
        const quests = await readJsonFile(questsFile);
        let playerQuestsChanged = false;
        let accountsChanged = false;
        let questsChanged = false;
        const now = Date.now();

        playerQuests.forEach(pq => {
            if (pq.status === 'pending' && now > pq.deadline) {
                pq.status = 'failed'; // Tandai quest gagal karena lewat waktu
                const quest = quests.find(q => q.id === pq.questId);
                const questSource = pq.source || quest?.source || 'admin';
                const failedAt = new Date().toISOString();
                pq.failedAt = failedAt;

                if (questSource === 'player') {
                    const creator = findAccountByUsername(accounts, pq.createdBy || quest?.createdBy);
                    const refundAmount = Number(quest?.escrowedReward ?? quest?.reward ?? pq.reward ?? 0);

                    if (quest) {
                        quest.status = 'failed';
                        quest.failedAt = failedAt;
                        questsChanged = true;
                    }

                    if (quest && quest.escrowStatus === 'held' && creator && refundAmount > 0) {
                        creator.coins += refundAmount;
                        quest.escrowStatus = 'refunded';
                        quest.refundedAt = failedAt;
                        pq.refundedAt = failedAt;
                        accountsChanged = true;
                    }
                } else {
                    const account = findAccountByUsername(accounts, pq.username);
                    const penalty = Number(quest?.penalty ?? pq.penalty ?? 0);

                    if (account && penalty > 0) {
                        account.coins -= penalty; // Potong denda koin
                        accountsChanged = true;
                    }
                }
                playerQuestsChanged = true;
            }
        });

        if (playerQuestsChanged) {
            await writeJsonFile(playerQuestsFile, playerQuests);
        }
        if (questsChanged) {
            await writeJsonFile(questsFile, quests);
        }
        if (accountsChanged) {
            await writeAccounts(accounts);
        }
    } catch (error) { }
}, 5000); // Mengecek keterlambatan setiap 5 detik

const server = http.createServer(async (req, res) => {
    // Tambah CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    if (pathname === '/accounts') {
        if (req.method === 'POST') {
            try {
                const body = await parseRequestBody(req);
                const username = String(body.username || '').trim();
                const password = String(body.password || '');

                if (!username || !password) {
                    sendJSON(res, 400, { error: 'Username dan password wajib diisi.' });
                    return;
                }

                const accounts = await readAccounts();
                const exists = accounts.some((item) => item.username && item.username.toLowerCase() === username.toLowerCase());
                if (exists) {
                    sendJSON(res, 409, { error: 'Akun sudah terdaftar.' });
                    return;
                }

                const newAccount = { username, password, coins: 0, profilePhoto: '' };
                accounts.push(newAccount);
                await writeAccounts(accounts);
                sendJSON(res, 201, newAccount);
            } catch (error) {
                console.error('POST /accounts error', error);
                sendJSON(res, 500, { error: 'Gagal menambahkan akun.' });
            }
            return;
        }

        sendJSON(res, 405, { error: 'Method not allowed' });
        return;
    }

    if (pathname === '/login' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const username = String(body.username || '').trim();
            const password = String(body.password || '');

            if (!username || !password) {
                sendJSON(res, 400, { error: 'Username dan password wajib diisi.' });
                return;
            }

            const accounts = await readAccounts();
            const account = accounts.find(
                (item) => item.username && item.username.toLowerCase() === username.toLowerCase() && item.password === password
            );

            if (!account) {
                sendJSON(res, 401, { error: 'Nama player atau password salah.' });
                return;
            }

            sendJSON(res, 200, { username: account.username, coins: account.coins, profilePhoto: account.profilePhoto || '' });
        } catch (error) {
            console.error('POST /login error', error);
            sendJSON(res, 500, { error: 'Gagal memproses login.' });
        }
        return;
    }

    if (pathname === '/profile-photo' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const username = String(body.username || '').trim();
            const profilePhoto = String(body.profilePhoto || '');

            if (!username) {
                sendJSON(res, 400, { error: 'Username wajib diisi.' });
                return;
            }

            if (!isValidProfilePhoto(profilePhoto)) {
                sendJSON(res, 400, { error: 'Foto profil harus berupa gambar PNG, JPG, WEBP, atau GIF dan maksimal sekitar 2 MB.' });
                return;
            }

            const accounts = await readAccounts();
            const account = findAccountByUsername(accounts, username);

            if (!account) {
                sendJSON(res, 404, { error: 'Player tidak ditemukan.' });
                return;
            }

            account.profilePhoto = profilePhoto;
            await writeAccounts(accounts);
            sendJSON(res, 200, { username: account.username, profilePhoto: account.profilePhoto || '' });
        } catch (error) {
            console.error('POST /profile-photo error', error);
            sendJSON(res, 500, { error: 'Gagal menyimpan foto profil.' });
        }
        return;
    }

    if (pathname === '/sell-requests' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const username = String(body.username || '').trim();
            const amount = Number(body.amount);
            const provider = String(body.provider || '').trim();
            const accountNumber = String(body.accountNumber || '').trim();

            if (!username || !provider || !accountNumber || !Number.isInteger(amount) || amount <= 0) {
                sendJSON(res, 400, { error: 'Data permintaan harus lengkap dan valid.' });
                return;
            }

            const accounts = await readAccounts();
            const account = accounts.find((item) => item.username && item.username.toLowerCase() === username.toLowerCase());

            if (!account) {
                sendJSON(res, 404, { error: 'Player tidak ditemukan.' });
                return;
            }

            if (account.coins < amount) {
                sendJSON(res, 400, { error: 'Saldo koin tidak mencukupi untuk penjualan.' });
                return;
            }

            const requests = await readSellRequests();
            const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            const newRequest = {
                id: requestId,
                playerUsername: account.username,
                amount,
                provider,
                accountNumber,
                status: 'pending',
                createdAt: new Date().toISOString()
            };

            requests.push(newRequest);
            await writeSellRequests(requests);
            sendJSON(res, 201, newRequest);
        } catch (error) {
            console.error('POST /sell-requests error', error);
            sendJSON(res, 500, { error: 'Gagal membuat permintaan jual koin.' });
        }
        return;
    }

    if (pathname === '/admin/sell-requests' && req.method === 'GET') {
        try {
            const requests = await readSellRequests();
            sendJSON(res, 200, requests);
        } catch (error) {
            console.error('GET /admin/sell-requests error', error);
            sendJSON(res, 500, { error: 'Gagal mengambil permintaan jual koin.' });
        }
        return;
    }

    if (pathname === '/admin/sell-requests/approve' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const requestId = String(body.id || '').trim();

            if (!requestId) {
                sendJSON(res, 400, { error: 'ID permintaan wajib diisi.' });
                return;
            }

            const requests = await readSellRequests();
            const request = requests.find((item) => item.id === requestId);

            if (!request || request.status !== 'pending') {
                sendJSON(res, 404, { error: 'Permintaan tidak ditemukan atau sudah diproses.' });
                return;
            }

            const accounts = await readAccounts();
            const account = accounts.find((item) => item.username.toLowerCase() === request.playerUsername.toLowerCase());

            if (!account) {
                sendJSON(res, 404, { error: 'Player tidak ditemukan.' });
                return;
            }

            if (account.coins < request.amount) {
                sendJSON(res, 400, { error: 'Saldo koin player tidak mencukupi.' });
                return;
            }

            account.coins -= request.amount;
            request.status = 'approved';
            request.processedAt = new Date().toISOString();

            await writeAccounts(accounts);
            await writeSellRequests(requests);
            sendJSON(res, 200, { request, coinsRemaining: account.coins });
        } catch (error) {
            console.error('POST /admin/sell-requests/approve error', error);
            sendJSON(res, 500, { error: 'Gagal approve permintaan jual koin.' });
        }
        return;
    }

    if (pathname === '/admin/sell-requests/decline' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const requestId = String(body.id || '').trim();

            if (!requestId) {
                sendJSON(res, 400, { error: 'ID permintaan wajib diisi.' });
                return;
            }

            const requests = await readSellRequests();
            const request = requests.find((item) => item.id === requestId);

            if (!request || request.status !== 'pending') {
                sendJSON(res, 404, { error: 'Permintaan tidak ditemukan atau sudah diproses.' });
                return;
            }

            request.status = 'declined';
            request.processedAt = new Date().toISOString();

            await writeSellRequests(requests);
            sendJSON(res, 200, { request });
        } catch (error) {
            console.error('POST /admin/sell-requests/decline error', error);
            sendJSON(res, 500, { error: 'Gagal menolak permintaan jual koin.' });
        }
        return;
    }

    if (pathname === '/admin/sell-requests/clear' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const requestId = String(body.id || '').trim();

            if (!requestId) {
                sendJSON(res, 400, { error: 'ID permintaan wajib diisi.' });
                return;
            }

            const requests = await readSellRequests();
            const requestIndex = requests.findIndex((item) => item.id === requestId);

            if (requestIndex === -1) {
                sendJSON(res, 404, { error: 'Permintaan tidak ditemukan.' });
                return;
            }

            const request = requests[requestIndex];
            if (request.status === 'pending') {
                sendJSON(res, 400, { error: 'Permintaan yang belum diproses tidak bisa di-clear.' });
                return;
            }

            requests.splice(requestIndex, 1);
            await writeSellRequests(requests);
            sendJSON(res, 200, { message: 'Permintaan berhasil di-clear.' });
        } catch (error) {
            console.error('POST /admin/sell-requests/clear error', error);
            sendJSON(res, 500, { error: 'Gagal menghapus permintaan jual koin.' });
        }
        return;
    }

    if (pathname === '/admin/coins' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const username = String(body.username || '').trim();
            const amount = Number(body.amount);

            if (!username || !Number.isInteger(amount) || amount <= 0) {
                sendJSON(res, 400, { error: 'Nama player dan jumlah koin harus diisi dengan benar.' });
                return;
            }

            const accounts = await readAccounts();
            const account = accounts.find((item) => item.username && item.username.toLowerCase() === username.toLowerCase());

            if (!account) {
                sendJSON(res, 404, { error: 'Player tidak ditemukan.' });
                return;
            }

            account.coins += amount;
            await writeAccounts(accounts);
            sendJSON(res, 200, { username: account.username, coins: account.coins, amountAdded: amount });
        } catch (error) {
            console.error('POST /admin/coins error', error);
            sendJSON(res, 500, { error: 'Gagal mengirim koin ke player.' });
        }
        return;
    }

    if (pathname === '/transfer-coins' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const fromUsername = String(body.fromUsername || '').trim();
            const toUsername = String(body.toUsername || '').trim();
            const amount = Number(body.amount);

            if (!fromUsername || !toUsername || !Number.isInteger(amount) || amount <= 0) {
                sendJSON(res, 400, { error: 'Data transfer harus lengkap dan valid.' });
                return;
            }

            if (fromUsername === toUsername) {
                sendJSON(res, 400, { error: 'Anda tidak bisa transfer koin ke diri sendiri.' });
                return;
            }

            const accounts = await readAccounts();
            const fromAccount = accounts.find((item) => item.username && item.username.toLowerCase() === fromUsername.toLowerCase());
            const toAccount = accounts.find((item) => item.username && item.username.toLowerCase() === toUsername.toLowerCase());

            if (!fromAccount) {
                sendJSON(res, 404, { error: 'Player pengirim tidak ditemukan.' });
                return;
            }

            if (!toAccount) {
                sendJSON(res, 404, { error: 'Player penerima tidak ditemukan.' });
                return;
            }

            if (fromAccount.coins < amount) {
                sendJSON(res, 400, { error: 'Saldo koin Anda tidak mencukupi untuk transfer.' });
                return;
            }

            fromAccount.coins -= amount;
            toAccount.coins += amount;
            await writeAccounts(accounts);

            sendJSON(res, 200, {
                message: 'Transfer koin berhasil',
                fromUsername: fromAccount.username,
                toUsername: toAccount.username,
                amount,
                fromCoins: fromAccount.coins,
                toCoins: toAccount.coins
            });
        } catch (error) {
            console.error('POST /transfer-coins error', error);
            sendJSON(res, 500, { error: 'Gagal melakukan transfer koin.' });
        }
        return;
    }

    // --- ENDPOINTS UNTUK FITUR QUEST (PENAMBAHAN) ---

    // Endpoint: Admin Tambah Quest
    if (pathname === '/admin/quests' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const questData = validateQuestPayload(body);
            if (questData.error) {
                return sendJSON(res, 400, { error: questData.error });
            }

            const quests = await readJsonFile(questsFile);
            const newQuest = {
                id: createId('q'),
                ...questData,
                source: 'admin',
                createdBy: 'Admin',
                targetUsername: '',
                priority: 0,
                createdAt: new Date().toISOString()
            };
            quests.push(newQuest);
            await writeJsonFile(questsFile, quests);
            return sendJSON(res, 201, newQuest);
        } catch (error) {
            return sendJSON(res, 500, { error: 'Gagal membuat quest.' });
        }
    }

    // Endpoint: Get Semua Quest
    if (pathname === '/quests' && req.method === 'GET') {
        try {
            let quests = sortQuests(await readJsonFile(questsFile));
            const playerQuests = await readJsonFile(playerQuestsFile);
            const username = String(parsedUrl.query.username || '').trim();

            if (username) {
                quests = quests.filter((quest) => isQuestVisibleOnBoard(quest, username, playerQuests));
            }

            return sendJSON(res, 200, quests);
        } catch (error) {
            return sendJSON(res, 500, { error: 'Gagal mengambil quest.' });
        }
    }

    // Endpoint: Player Tambah Quest untuk Player Lain
    if (pathname === '/quests/player' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const createdBy = String(body.createdBy || body.username || '').trim();
            const targetUsernameInput = String(body.targetUsername || '').trim();
            const questData = validateQuestPayload(body, { needsPenalty: false });

            if (questData.error) {
                return sendJSON(res, 400, { error: questData.error });
            }

            if (!createdBy) {
                return sendJSON(res, 400, { error: 'Nama pembuat quest wajib diisi.' });
            }

            const accounts = await readAccounts();
            const creator = findAccountByUsername(accounts, createdBy);
            if (!creator) {
                return sendJSON(res, 404, { error: 'Player pembuat quest tidak ditemukan.' });
            }

            if (creator.coins < questData.reward) {
                return sendJSON(res, 400, { error: `Koin Anda tidak cukup untuk membuat quest ini. Saldo Anda ${creator.coins} koin, reward quest ${questData.reward} koin.` });
            }

            let targetUsername = '';
            if (targetUsernameInput) {
                const targetAccount = findAccountByUsername(accounts, targetUsernameInput);
                if (!targetAccount) {
                    return sendJSON(res, 404, { error: 'Player tujuan quest tidak ditemukan.' });
                }
                if (targetAccount.username.toLowerCase() === creator.username.toLowerCase()) {
                    return sendJSON(res, 400, { error: 'Anda tidak bisa membuat quest khusus untuk diri sendiri.' });
                }
                targetUsername = targetAccount.username;
            }

            creator.coins -= questData.reward;

            const quests = await readJsonFile(questsFile);
            const newQuest = {
                id: createId('q'),
                ...questData,
                source: 'player',
                createdBy: creator.username,
                targetUsername,
                priority: 1,
                status: 'open',
                escrowStatus: 'held',
                escrowedReward: questData.reward,
                createdAt: new Date().toISOString()
            };

            quests.push(newQuest);
            await writeAccounts(accounts);
            await writeJsonFile(questsFile, quests);
            return sendJSON(res, 201, { ...newQuest, creatorCoins: creator.coins });
        } catch (error) {
            console.error('POST /quests/player error', error);
            return sendJSON(res, 500, { error: 'Gagal membuat quest player.' });
        }
    }

    // Endpoint: Player Ambil Quest
    if (pathname === '/quests/take' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const username = String(body.username || '').trim();
            const quests = sortQuests(await readJsonFile(questsFile));
            const playerQuests = await readJsonFile(playerQuestsFile);
            const accounts = await readAccounts();

            const account = findAccountByUsername(accounts, username);
            if (!account) return sendJSON(res, 404, { error: "Player tidak ditemukan" });

            const quest = quests.find(q => q.id === body.questId);
            if (!quest) return sendJSON(res, 404, { error: "Quest tidak ditemukan" });

            if (!isQuestVisibleForUser(quest, account.username)) {
                return sendJSON(res, 403, { error: "Quest ini tidak tersedia untuk player ini." });
            }

            if (quest.source === 'player') {
                if (quest.status && quest.status !== 'open') {
                    return sendJSON(res, 409, { error: "Quest player ini sudah tidak tersedia." });
                }

                if (quest.escrowStatus && quest.escrowStatus !== 'held') {
                    return sendJSON(res, 409, { error: "Reward quest player ini sudah tidak tersedia." });
                }

                const hasAnyAttempt = playerQuests.some(pq => pq.questId === quest.id && ['pending', 'completed', 'failed'].includes(pq.status));
                if (hasAnyAttempt) {
                    return sendJSON(res, 409, { error: "Quest player ini sudah diambil player lain." });
                }
            }

            const alreadyPending = playerQuests.some(pq => pq.questId === quest.id && String(pq.username || '').toLowerCase() === account.username.toLowerCase() && pq.status === 'pending');
            if (alreadyPending) {
                return sendJSON(res, 409, { error: "Quest ini sedang Anda kerjakan." });
            }

            const alreadyCompleted = playerQuests.some(pq => pq.questId === quest.id && String(pq.username || '').toLowerCase() === account.username.toLowerCase() && pq.status === 'completed');
            if (alreadyCompleted) {
                return sendJSON(res, 409, { error: "Quest ini sudah selesai dan sudah hilang dari papan quest Anda." });
            }

            const newPlayerQuest = {
                id: createId('pq'),
                questId: quest.id,
                username: account.username,
                title: quest.title,
                reward: quest.reward,
                penalty: quest.source === 'player' ? 0 : quest.penalty,
                source: quest.source,
                createdBy: quest.createdBy,
                targetUsername: quest.targetUsername,
                deadline: Date.now() + (quest.duration * 60000), // Menit ke Milidetik
                status: 'pending'
            };
            playerQuests.push(newPlayerQuest);
            await writeJsonFile(playerQuestsFile, playerQuests);
            return sendJSON(res, 201, newPlayerQuest);
        } catch (error) {
            return sendJSON(res, 500, { error: 'Gagal mengambil quest.' });
        }
    }

    // Endpoint: Get Quest Player (Untuk Player)
    if (pathname === '/my-quests' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const username = String(body.username || '').trim().toLowerCase();
            const playerQuests = await readJsonFile(playerQuestsFile);
            const myQuests = playerQuests.filter(pq => pq.username && pq.username.toLowerCase() === username);
            return sendJSON(res, 200, myQuests);
        } catch (error) {
            return sendJSON(res, 500, { error: 'Gagal mengambil daftar quest.' });
        }
    }

    // Endpoint: Get Semua Quest Pending (Untuk Admin)
    if (pathname === '/admin/player-quests' && req.method === 'GET') {
        try {
            const playerQuests = await readJsonFile(playerQuestsFile);
            const quests = await readJsonFile(questsFile);
            const adminPlayerQuests = playerQuests.filter((pq) => {
                const quest = quests.find((q) => q.id === pq.questId);
                return (pq.source || quest?.source || 'admin') !== 'player';
            });
            return sendJSON(res, 200, adminPlayerQuests);
        } catch (error) {
            return sendJSON(res, 500, { error: 'Gagal mengambil data quest admin.' });
        }
    }

    // Endpoint: Ambil daftar approval quest yang dibuat player
    if (pathname === '/player/quest-approvals' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const username = String(body.username || '').trim();
            const accounts = await readAccounts();
            const account = findAccountByUsername(accounts, username);

            if (!account) {
                return sendJSON(res, 404, { error: 'Player tidak ditemukan.' });
            }

            const playerQuests = await readJsonFile(playerQuestsFile);
            const quests = await readJsonFile(questsFile);
            const approvals = playerQuests
                .filter((pq) => {
                    const quest = quests.find((item) => item.id === pq.questId);
                    const source = pq.source || quest?.source;
                    const creatorName = String(pq.createdBy || quest?.createdBy || '').toLowerCase();
                    return pq.status === 'pending' && source === 'player' && creatorName === account.username.toLowerCase();
                })
                .sort((a, b) => Number(a.deadline || 0) - Number(b.deadline || 0));

            return sendJSON(res, 200, { approvals, coins: account.coins });
        } catch (error) {
            console.error('POST /player/quest-approvals error', error);
            return sendJSON(res, 500, { error: 'Gagal mengambil approval quest player.' });
        }
    }

    // Endpoint: Player pembuat quest approve quest selesai
    if (pathname === '/quests/player/approve' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const approverUsername = String(body.approverUsername || body.username || '').trim();
            const playerQuestId = String(body.id || '').trim();

            if (!approverUsername || !playerQuestId) {
                return sendJSON(res, 400, { error: 'Data approval quest player tidak lengkap.' });
            }

            const accounts = await readAccounts();
            const approver = findAccountByUsername(accounts, approverUsername);

            if (!approver) {
                return sendJSON(res, 404, { error: 'Player pembuat quest tidak ditemukan.' });
            }

            const playerQuests = await readJsonFile(playerQuestsFile);
            const quests = await readJsonFile(questsFile);
            const pq = playerQuests.find((item) => item.id === playerQuestId);

            if (!pq || pq.status !== 'pending') {
                return sendJSON(res, 400, { error: 'Quest tidak valid, sudah selesai, atau sudah gagal.' });
            }

            const quest = quests.find((item) => item.id === pq.questId);
            const creatorName = String(pq.createdBy || quest?.createdBy || '').toLowerCase();

            if ((pq.source || quest?.source) !== 'player') {
                return sendJSON(res, 400, { error: 'Endpoint ini hanya untuk quest dari player.' });
            }

            if (creatorName !== approver.username.toLowerCase()) {
                return sendJSON(res, 403, { error: 'Hanya player yang membuat quest ini yang bisa approve.' });
            }

            const receiver = findAccountByUsername(accounts, pq.username);
            if (!receiver) {
                return sendJSON(res, 404, { error: 'Player penerima quest tidak ditemukan.' });
            }

            const rewardAmount = Number(pq.reward || quest?.reward || 0);
            if (rewardAmount <= 0) {
                return sendJSON(res, 400, { error: 'Reward quest tidak valid.' });
            }

            if (quest && !quest.escrowStatus) {
                if (approver.coins < rewardAmount) {
                    return sendJSON(res, 400, { error: 'Quest lama ini belum punya saldo titipan, dan koin pembuat tidak cukup untuk membayar.' });
                }
                approver.coins -= rewardAmount;
                quest.escrowStatus = 'held';
                quest.escrowedReward = rewardAmount;
            }

            if (quest && quest.escrowStatus !== 'held') {
                return sendJSON(res, 409, { error: 'Saldo reward quest ini sudah tidak tersedia.' });
            }

            const completedAt = new Date().toISOString();
            receiver.coins += rewardAmount;
            pq.status = 'completed';
            pq.completedAt = completedAt;
            pq.approvedBy = approver.username;

            if (quest) {
                quest.status = 'completed';
                quest.escrowStatus = 'paid';
                quest.paidAt = completedAt;
                quest.approvedBy = approver.username;
            }

            await writeAccounts(accounts);
            await writeJsonFile(playerQuestsFile, playerQuests);
            await writeJsonFile(questsFile, quests);

            return sendJSON(res, 200, {
                message: 'Quest player disetujui dan reward dibayar.',
                receiverUsername: receiver.username,
                receiverCoins: receiver.coins,
                approverCoins: approver.coins
            });
        } catch (error) {
            console.error('POST /quests/player/approve error', error);
            return sendJSON(res, 500, { error: 'Gagal approve quest player.' });
        }
    }

    // Endpoint: Admin Approve Quest Selesai
    if (pathname === '/admin/quests/approve' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const playerQuests = await readJsonFile(playerQuestsFile);
            const quests = await readJsonFile(questsFile);
            const accounts = await readAccounts();

            const pq = playerQuests.find(p => p.id === body.id);
            if (!pq || pq.status !== 'pending') {
                return sendJSON(res, 400, { error: "Quest tidak valid, sudah selesai, atau gagal karena telat." });
            }

            const quest = quests.find((q) => q.id === pq.questId);
            if ((pq.source || quest?.source || 'admin') === 'player') {
                return sendJSON(res, 403, { error: "Quest dari player hanya bisa di-approve oleh player yang membuat quest." });
            }

            pq.status = 'completed';
            pq.completedAt = new Date().toISOString();
            pq.approvedBy = 'Admin';
            const account = findAccountByUsername(accounts, pq.username);
            if (account) {
                account.coins += pq.reward; // Berikan imbalan
                await writeAccounts(accounts);
            }
            await writeJsonFile(playerQuestsFile, playerQuests);
            return sendJSON(res, 200, { message: "Quest disetujui, imbalan diberikan." });
        } catch (error) {
            return sendJSON(res, 500, { error: 'Gagal menyetujui quest.' });
        }
    }
    // --- END ENDPOINTS QUEST ---

    let filePath = path.join(rootDir, pathname === '/' ? 'index.html' : pathname);
    if (!filePath.startsWith(rootDir)) {
        res.writeHead(400);
        res.end('Bad Request');
        return;
    }

    sendFile(res, filePath);
});

server.listen(port, () => {

    // Buka browser otomatis
    const url = `http://localhost:${port}`;
    if (process.env.NO_AUTO_OPEN !== '1') {
        const command = process.platform === 'win32'
            ? `start ${url}`
            : process.platform === 'darwin'
                ? `open ${url}`
                : `xdg-open ${url}`;

        exec(command, (error) => {
            if (error) {
                console.log(`Browser tidak bisa dibuka otomatis. Buka manual: ${url}`);
            }
        });
    } else {
        console.log(`Auto-open browser dimatikan. Buka manual: ${url}`);
    }
    console.log(`Server berjalan di http://localhost:${port}`);
});
