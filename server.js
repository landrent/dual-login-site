const http = require('http');
const path = require('path');
const url = require('url');

const port = Number(process.env.PORT) || 3000;
const rootDir = process.cwd();

// ============================================================
// SUPABASE CLIENT SETUP
// Requires environment variables:
//   SUPABASE_URL  → https://xxxx.supabase.co
//   SUPABASE_KEY  → anon/public key (atau service_role key)
// ============================================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('[WARN] SUPABASE_URL atau SUPABASE_KEY belum diset. Server tetap jalan tapi database tidak akan berfungsi.');
}

// Helper: panggil Supabase REST API tanpa SDK tambahan
async function supabase(method, table, { filter, body, returning } = {}) {
    let endpoint = `${SUPABASE_URL}/rest/v1/${table}`;
    const params = new URLSearchParams();

    if (filter) {
        for (const [k, v] of Object.entries(filter)) {
            params.set(k, v);
        }
    }

    const qs = params.toString();
    if (qs) endpoint += '?' + qs;

    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': returning === false ? 'return=minimal' : 'return=representation'
    };

    const init = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);

    const res = await fetch(endpoint, init);
    const text = await res.text();

    if (!res.ok) {
        const detail = (() => { try { return JSON.parse(text); } catch { return text; } })();
        throw Object.assign(new Error(`Supabase ${method} ${table} gagal: ${res.status}`), { detail, status: res.status });
    }

    if (!text || text === 'null') return method === 'GET' ? [] : null;
    return JSON.parse(text);
}

// ---- Wrapper CRUD ----

async function dbGetAll(table, filterObj) {
    const filter = {};
    if (filterObj) {
        for (const [k, v] of Object.entries(filterObj)) {
            filter[k] = `eq.${v}`;
        }
    }
    return supabase('GET', table, { filter });
}

async function dbGetOne(table, filterObj) {
    const rows = await dbGetAll(table, filterObj);
    return rows[0] ?? null;
}

async function dbInsert(table, row) {
    const rows = await supabase('POST', table, { body: row });
    return Array.isArray(rows) ? rows[0] : rows;
}

async function dbUpdate(table, filterObj, patch) {
    const filter = {};
    for (const [k, v] of Object.entries(filterObj)) {
        filter[k] = `eq.${v}`;
    }
    const rows = await supabase('PATCH', table, { filter, body: patch });
    return Array.isArray(rows) ? rows[0] : rows;
}

async function dbDelete(table, filterObj) {
    const filter = {};
    for (const [k, v] of Object.entries(filterObj)) {
        filter[k] = `eq.${v}`;
    }
    return supabase('DELETE', table, { filter, returning: false });
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function createId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    const createdBy = String(quest.created_by || quest.createdBy || (source === 'admin' ? 'Admin' : '')).trim();
    const targetUsername = String(quest.target_username || quest.targetUsername || '').trim();
    return {
        ...quest,
        source,
        createdBy,
        targetUsername,
        priority: source === 'admin' ? 0 : 1,
        createdAt: quest.created_at || quest.createdAt || ''
    };
}

function sortQuests(quests) {
    return quests.map(normalizeQuest).sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return String(b.createdAt || b.id).localeCompare(String(a.createdAt || a.id));
    });
}

function isQuestVisibleForUser(quest, username) {
    const playerName = String(username || '').trim().toLowerCase();
    const creatorName = String(quest.createdBy || quest.created_by || '').trim().toLowerCase();
    const targetName = String(quest.targetUsername || quest.target_username || '').trim().toLowerCase();
    if (quest.source === 'player' && creatorName && creatorName === playerName) return false;
    if (targetName && targetName !== playerName) return false;
    return true;
}

function isQuestVisibleOnBoard(quest, username, playerQuests) {
    const nq = normalizeQuest(quest);
    if (!isQuestVisibleForUser(nq, username)) return false;
    if (nq.source !== 'player') return true;
    if (nq.status && nq.status !== 'open') return false;
    const escrowStatus = nq.escrow_status || nq.escrowStatus;
    if (escrowStatus && escrowStatus !== 'held') return false;

    const related = playerQuests.filter(pq => (pq.quest_id || pq.questId) === nq.id);
    const active = related.find(pq => pq.status === 'pending');
    if (active) return String(active.username || '').toLowerCase() === String(username || '').toLowerCase();
    return !related.some(pq => pq.status === 'completed' || pq.status === 'failed');
}

function isValidProfilePhoto(profilePhoto) {
    if (profilePhoto === '') return true;
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

const { promises: fs } = require('fs');

function sendFile(res, filePath) {
    return fs.readFile(filePath)
        .then(content => {
            const ext = path.extname(filePath).toLowerCase();
            const types = {
                '.html': 'text/html; charset=utf-8',
                '.css': 'text/css; charset=utf-8',
                '.js': 'application/javascript; charset=utf-8',
                '.json': 'application/json; charset=utf-8'
            };
            res.writeHead(200, {
                'Content-Type': types[ext] || 'application/octet-stream',
                'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=0, must-revalidate'
            });
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
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            if (!body) return resolve({});
            try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

// ============================================================
// BACKGROUND TASK: Auto-deduct penalty untuk quest telat
// ============================================================
async function processOverdueQuests() {
    try {
        const now = Date.now();
        const allPending = await dbGetAll('player_quests', { status: 'pending' });
        const overdue = allPending.filter(pq => pq.deadline && Number(pq.deadline) < now);

        for (const pq of overdue) {
            const failedAt = new Date().toISOString();
            const quest = await dbGetOne('quests', { id: pq.quest_id });
            const questSource = pq.source || quest?.source || 'admin';

            if (questSource === 'player') {
                const creatorName = pq.created_by || quest?.created_by;
                const refundAmount = Number(quest?.escrowed_reward ?? quest?.reward ?? pq.reward ?? 0);
                const creator = creatorName ? await dbGetOne('accounts', { username_lower: creatorName.toLowerCase() }) : null;

                if (quest && quest.escrow_status === 'held' && creator && refundAmount > 0) {
                    await dbUpdate('accounts', { username_lower: creator.username.toLowerCase() }, { coins: creator.coins + refundAmount });
                    await dbUpdate('quests', { id: quest.id }, { status: 'failed', escrow_status: 'refunded', failed_at: failedAt, refunded_at: failedAt });
                    await dbUpdate('player_quests', { id: pq.id }, { status: 'failed', failed_at: failedAt, refunded_at: failedAt });
                } else {
                    await dbUpdate('player_quests', { id: pq.id }, { status: 'failed', failed_at: failedAt });
                    if (quest) await dbUpdate('quests', { id: quest.id }, { status: 'failed', failed_at: failedAt });
                }
            } else {
                const account = await dbGetOne('accounts', { username_lower: pq.username.toLowerCase() });
                const penalty = Number(quest?.penalty ?? pq.penalty ?? 0);
                if (account && penalty > 0) {
                    await dbUpdate('accounts', { username_lower: account.username.toLowerCase() }, { coins: account.coins - penalty });
                }
                await dbUpdate('player_quests', { id: pq.id }, { status: 'failed', failed_at: failedAt });
            }
        }
    } catch (err) {
        console.error('[processOverdueQuests]', err.message);
    }
}

if (process.env.NODE_ENV !== 'production') {
    setInterval(processOverdueQuests, 5000);
}

// ============================================================
// HTTP SERVER
// ============================================================
const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    if (pathname === '/styles.css' && req.method === 'GET') {
        return sendFile(res, path.join(rootDir, 'styles.css'));
    }

    if (pathname === '/script.js' && req.method === 'GET') {
        return sendFile(res, path.join(rootDir, 'script.js'));
    }
    if ((pathname === '/' || pathname === '/index.html') && req.method === 'GET') {
        return sendFile(res, path.join(rootDir, 'index.html'));
    }

    if (
        pathname.startsWith('/quests') ||
        pathname.startsWith('/admin') ||
        pathname === '/my-quests' ||
        pathname.startsWith('/player/')
    ) {
        await processOverdueQuests();
    }

    // ── POST /accounts ── Register player baru
    if (pathname === '/accounts' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const username = String(body.username || '').trim();
            const password = String(body.password || '');

            if (!username || !password) {
                return sendJSON(res, 400, { error: 'Username dan password wajib diisi.' });
            }

            const existing = await dbGetOne('accounts', { username_lower: username.toLowerCase() });
            if (existing) return sendJSON(res, 409, { error: 'Akun sudah terdaftar.' });

            const newAccount = await dbInsert('accounts', {
                username,
                username_lower: username.toLowerCase(),
                password,
                coins: 0,
                profile_photo: ''
            });

            return sendJSON(res, 201, {
                username: newAccount.username,
                coins: newAccount.coins,
                profilePhoto: newAccount.profile_photo || ''
            });
        } catch (err) {
            console.error('POST /accounts', err);
            return sendJSON(res, 500, { error: 'Gagal menambahkan akun.' });
        }
    }

    // ── POST /login ── Login player
    if (pathname === '/login' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const username = String(body.username || '').trim();
            const password = String(body.password || '');

            if (!username || !password) {
                return sendJSON(res, 400, { error: 'Username dan password wajib diisi.' });
            }

            const account = await dbGetOne('accounts', { username_lower: username.toLowerCase() });
            if (!account || account.password !== password) {
                return sendJSON(res, 401, { error: 'Nama player atau password salah.' });
            }

            return sendJSON(res, 200, {
                username: account.username,
                coins: account.coins,
                profilePhoto: account.profile_photo || ''
            });
        } catch (err) {
            console.error('POST /login', err);
            return sendJSON(res, 500, { error: 'Gagal memproses login.' });
        }
    }

    // ── POST /profile-photo ── Simpan foto profil
    if (pathname === '/profile-photo' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const username = String(body.username || '').trim();
            const profilePhoto = String(body.profilePhoto || '');

            if (!username) return sendJSON(res, 400, { error: 'Username wajib diisi.' });
            if (!isValidProfilePhoto(profilePhoto)) {
                return sendJSON(res, 400, { error: 'Foto profil harus berupa gambar PNG, JPG, WEBP, atau GIF dan maksimal sekitar 2 MB.' });
            }

            const account = await dbGetOne('accounts', { username_lower: username.toLowerCase() });
            if (!account) return sendJSON(res, 404, { error: 'Player tidak ditemukan.' });

            await dbUpdate('accounts', { username_lower: username.toLowerCase() }, { profile_photo: profilePhoto });
            return sendJSON(res, 200, { username: account.username, profilePhoto });
        } catch (err) {
            console.error('POST /profile-photo', err);
            return sendJSON(res, 500, { error: 'Gagal menyimpan foto profil.' });
        }
    }

    // ── POST /sell-requests ── Buat permintaan jual koin
    if (pathname === '/sell-requests' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const username = String(body.username || '').trim();
            const amount = Number(body.amount);
            const provider = String(body.provider || '').trim();
            const accountNumber = String(body.accountNumber || '').trim();

            if (!username || !provider || !accountNumber || !Number.isInteger(amount) || amount <= 0) {
                return sendJSON(res, 400, { error: 'Data permintaan harus lengkap dan valid.' });
            }

            const account = await dbGetOne('accounts', { username_lower: username.toLowerCase() });
            if (!account) return sendJSON(res, 404, { error: 'Player tidak ditemukan.' });
            if (account.coins < amount) return sendJSON(res, 400, { error: 'Saldo koin tidak mencukupi untuk penjualan.' });

            const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
            const newRequest = await dbInsert('sell_requests', {
                id: requestId,
                player_username: account.username,
                amount,
                provider,
                account_number: accountNumber,
                status: 'pending',
                created_at: new Date().toISOString()
            });

            return sendJSON(res, 201, {
                id: newRequest.id,
                playerUsername: newRequest.player_username,
                amount: newRequest.amount,
                provider: newRequest.provider,
                accountNumber: newRequest.account_number,
                status: newRequest.status,
                createdAt: newRequest.created_at
            });
        } catch (err) {
            console.error('POST /sell-requests', err);
            return sendJSON(res, 500, { error: 'Gagal membuat permintaan jual koin.' });
        }
    }

    // ── GET /admin/sell-requests
    if (pathname === '/admin/sell-requests' && req.method === 'GET') {
        try {
            const rows = await dbGetAll('sell_requests');
            return sendJSON(res, 200, rows.map(r => ({
                id: r.id,
                playerUsername: r.player_username,
                amount: r.amount,
                provider: r.provider,
                accountNumber: r.account_number,
                status: r.status,
                createdAt: r.created_at,
                processedAt: r.processed_at
            })));
        } catch (err) {
            return sendJSON(res, 500, { error: 'Gagal mengambil permintaan jual koin.' });
        }
    }

    // ── POST /admin/sell-requests/approve
    if (pathname === '/admin/sell-requests/approve' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const requestId = String(body.id || '').trim();
            if (!requestId) return sendJSON(res, 400, { error: 'ID permintaan wajib diisi.' });

            const request = await dbGetOne('sell_requests', { id: requestId });
            if (!request || request.status !== 'pending') {
                return sendJSON(res, 404, { error: 'Permintaan tidak ditemukan atau sudah diproses.' });
            }

            const account = await dbGetOne('accounts', { username_lower: request.player_username.toLowerCase() });
            if (!account) return sendJSON(res, 404, { error: 'Player tidak ditemukan.' });
            if (account.coins < request.amount) return sendJSON(res, 400, { error: 'Saldo koin player tidak mencukupi.' });

            const processedAt = new Date().toISOString();
            await dbUpdate('accounts', { username_lower: account.username.toLowerCase() }, { coins: account.coins - request.amount });
            await dbUpdate('sell_requests', { id: requestId }, { status: 'approved', processed_at: processedAt });

            return sendJSON(res, 200, { coinsRemaining: account.coins - request.amount });
        } catch (err) {
            return sendJSON(res, 500, { error: 'Gagal approve permintaan jual koin.' });
        }
    }

    // ── POST /admin/sell-requests/decline
    if (pathname === '/admin/sell-requests/decline' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const requestId = String(body.id || '').trim();
            if (!requestId) return sendJSON(res, 400, { error: 'ID permintaan wajib diisi.' });

            const request = await dbGetOne('sell_requests', { id: requestId });
            if (!request || request.status !== 'pending') {
                return sendJSON(res, 404, { error: 'Permintaan tidak ditemukan atau sudah diproses.' });
            }

            await dbUpdate('sell_requests', { id: requestId }, { status: 'declined', processed_at: new Date().toISOString() });
            return sendJSON(res, 200, { message: 'Permintaan ditolak.' });
        } catch (err) {
            return sendJSON(res, 500, { error: 'Gagal menolak permintaan jual koin.' });
        }
    }

    // ── POST /admin/sell-requests/clear
    if (pathname === '/admin/sell-requests/clear' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const requestId = String(body.id || '').trim();
            if (!requestId) return sendJSON(res, 400, { error: 'ID permintaan wajib diisi.' });

            const request = await dbGetOne('sell_requests', { id: requestId });
            if (!request) return sendJSON(res, 404, { error: 'Permintaan tidak ditemukan.' });
            if (request.status === 'pending') return sendJSON(res, 400, { error: 'Permintaan yang belum diproses tidak bisa di-clear.' });

            await dbDelete('sell_requests', { id: requestId });
            return sendJSON(res, 200, { message: 'Permintaan berhasil di-clear.' });
        } catch (err) {
            return sendJSON(res, 500, { error: 'Gagal menghapus permintaan jual koin.' });
        }
    }

    // ── POST /admin/coins ── Kirim koin ke player
    if (pathname === '/admin/coins' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const username = String(body.username || '').trim();
            const amount = Number(body.amount);

            if (!username || !Number.isInteger(amount) || amount <= 0) {
                return sendJSON(res, 400, { error: 'Nama player dan jumlah koin harus diisi dengan benar.' });
            }

            const account = await dbGetOne('accounts', { username_lower: username.toLowerCase() });
            if (!account) return sendJSON(res, 404, { error: 'Player tidak ditemukan.' });

            const updated = await dbUpdate('accounts', { username_lower: username.toLowerCase() }, { coins: account.coins + amount });
            return sendJSON(res, 200, { username: account.username, coins: updated.coins, amountAdded: amount });
        } catch (err) {
            return sendJSON(res, 500, { error: 'Gagal mengirim koin ke player.' });
        }
    }

    // ── POST /transfer-coins ── Transfer koin antar player
    if (pathname === '/transfer-coins' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const fromUsername = String(body.fromUsername || '').trim();
            const toUsername = String(body.toUsername || '').trim();
            const amount = Number(body.amount);

            if (!fromUsername || !toUsername || !Number.isInteger(amount) || amount <= 0) {
                return sendJSON(res, 400, { error: 'Data transfer harus lengkap dan valid.' });
            }
            if (fromUsername.toLowerCase() === toUsername.toLowerCase()) {
                return sendJSON(res, 400, { error: 'Anda tidak bisa transfer koin ke diri sendiri.' });
            }

            const fromAccount = await dbGetOne('accounts', { username_lower: fromUsername.toLowerCase() });
            const toAccount = await dbGetOne('accounts', { username_lower: toUsername.toLowerCase() });

            if (!fromAccount) return sendJSON(res, 404, { error: 'Player pengirim tidak ditemukan.' });
            if (!toAccount) return sendJSON(res, 404, { error: 'Player penerima tidak ditemukan.' });
            if (fromAccount.coins < amount) return sendJSON(res, 400, { error: 'Saldo koin Anda tidak mencukupi untuk transfer.' });

            await dbUpdate('accounts', { username_lower: fromUsername.toLowerCase() }, { coins: fromAccount.coins - amount });
            await dbUpdate('accounts', { username_lower: toUsername.toLowerCase() }, { coins: toAccount.coins + amount });

            return sendJSON(res, 200, {
                message: 'Transfer koin berhasil',
                fromUsername: fromAccount.username,
                toUsername: toAccount.username,
                amount,
                fromCoins: fromAccount.coins - amount,
                toCoins: toAccount.coins + amount
            });
        } catch (err) {
            return sendJSON(res, 500, { error: 'Gagal melakukan transfer koin.' });
        }
    }

    // ── POST /admin/quests ── Admin buat quest baru
    if (pathname === '/admin/quests' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const questData = validateQuestPayload(body);
            if (questData.error) return sendJSON(res, 400, { error: questData.error });

            const newQuest = await dbInsert('quests', {
                id: createId('q'),
                title: questData.title,
                reward: questData.reward,
                duration: questData.duration,
                penalty: questData.penalty,
                source: 'admin',
                created_by: 'Admin',
                target_username: '',
                priority: 0,
                created_at: new Date().toISOString()
            });

            return sendJSON(res, 201, {
                ...newQuest,
                createdBy: newQuest.created_by,
                targetUsername: newQuest.target_username,
                createdAt: newQuest.created_at
            });
        } catch (err) {
            return sendJSON(res, 500, { error: 'Gagal membuat quest.' });
        }
    }

    // ── GET /quests ── Ambil semua quest
    if (pathname === '/quests' && req.method === 'GET') {
        try {
            const rawQuests = await dbGetAll('quests');
            const rawPlayerQuests = await dbGetAll('player_quests');
            const username = String(parsedUrl.query.username || '').trim();

            const quests = rawQuests.map(q => ({
                ...q,
                createdBy: q.created_by,
                targetUsername: q.target_username,
                createdAt: q.created_at,
                escrowStatus: q.escrow_status,
                escrowedReward: q.escrowed_reward
            }));

            const playerQuests = rawPlayerQuests.map(pq => ({
                ...pq,
                questId: pq.quest_id,
                createdBy: pq.created_by,
                targetUsername: pq.target_username
            }));

            let visible = sortQuests(quests);
            if (username) {
                visible = visible.filter(q => isQuestVisibleOnBoard(q, username, playerQuests));
            }

            return sendJSON(res, 200, visible);
        } catch (err) {
            return sendJSON(res, 500, { error: 'Gagal mengambil quest.' });
        }
    }

    // ── POST /quests/player ── Player buat quest untuk player lain
    if (pathname === '/quests/player' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const createdBy = String(body.createdBy || body.username || '').trim();
            const targetUsernameInput = String(body.targetUsername || '').trim();
            const questData = validateQuestPayload(body, { needsPenalty: false });

            if (questData.error) return sendJSON(res, 400, { error: questData.error });
            if (!createdBy) return sendJSON(res, 400, { error: 'Nama pembuat quest wajib diisi.' });

            const creator = await dbGetOne('accounts', { username_lower: createdBy.toLowerCase() });
            if (!creator) return sendJSON(res, 404, { error: 'Player pembuat quest tidak ditemukan.' });
            if (creator.coins < questData.reward) {
                return sendJSON(res, 400, { error: `Koin Anda tidak cukup. Saldo ${creator.coins} koin, reward ${questData.reward} koin.` });
            }

            let targetUsername = '';
            if (targetUsernameInput) {
                const targetAccount = await dbGetOne('accounts', { username_lower: targetUsernameInput.toLowerCase() });
                if (!targetAccount) return sendJSON(res, 404, { error: 'Player tujuan quest tidak ditemukan.' });
                if (targetAccount.username.toLowerCase() === creator.username.toLowerCase()) {
                    return sendJSON(res, 400, { error: 'Anda tidak bisa membuat quest khusus untuk diri sendiri.' });
                }
                targetUsername = targetAccount.username;
            }

            await dbUpdate('accounts', { username_lower: creator.username.toLowerCase() }, { coins: creator.coins - questData.reward });

            const newQuest = await dbInsert('quests', {
                id: createId('q'),
                title: questData.title,
                reward: questData.reward,
                duration: questData.duration,
                penalty: 0,
                source: 'player',
                created_by: creator.username,
                target_username: targetUsername,
                priority: 1,
                status: 'open',
                escrow_status: 'held',
                escrowed_reward: questData.reward,
                created_at: new Date().toISOString()
            });

            return sendJSON(res, 201, {
                ...newQuest,
                createdBy: newQuest.created_by,
                targetUsername: newQuest.target_username,
                createdAt: newQuest.created_at,
                escrowStatus: newQuest.escrow_status,
                escrowedReward: newQuest.escrowed_reward,
                creatorCoins: creator.coins - questData.reward
            });
        } catch (err) {
            console.error('POST /quests/player', err);
            return sendJSON(res, 500, { error: 'Gagal membuat quest player.' });
        }
    }

    // ── POST /quests/take ── Player ambil quest
    if (pathname === '/quests/take' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const username = String(body.username || '').trim();

            const account = await dbGetOne('accounts', { username_lower: username.toLowerCase() });
            if (!account) return sendJSON(res, 404, { error: 'Player tidak ditemukan.' });

            const quest = await dbGetOne('quests', { id: body.questId });
            if (!quest) return sendJSON(res, 404, { error: 'Quest tidak ditemukan.' });

            const nq = normalizeQuest({ ...quest, createdBy: quest.created_by, targetUsername: quest.target_username });
            if (!isQuestVisibleForUser(nq, account.username)) {
                return sendJSON(res, 403, { error: 'Quest ini tidak tersedia untuk player ini.' });
            }

            const allPQ = await dbGetAll('player_quests');

            if (quest.source === 'player') {
                if (quest.status && quest.status !== 'open') return sendJSON(res, 409, { error: 'Quest player ini sudah tidak tersedia.' });
                if (quest.escrow_status && quest.escrow_status !== 'held') return sendJSON(res, 409, { error: 'Reward quest player ini sudah tidak tersedia.' });
                const hasAny = allPQ.some(pq => pq.quest_id === quest.id && ['pending', 'completed', 'failed'].includes(pq.status));
                if (hasAny) return sendJSON(res, 409, { error: 'Quest player ini sudah diambil player lain.' });
            }

            const myPQ = allPQ.filter(pq => pq.quest_id === quest.id && String(pq.username || '').toLowerCase() === account.username.toLowerCase());
            if (myPQ.some(pq => pq.status === 'pending')) return sendJSON(res, 409, { error: 'Quest ini sedang Anda kerjakan.' });
            if (myPQ.some(pq => pq.status === 'completed')) return sendJSON(res, 409, { error: 'Quest ini sudah selesai.' });

            const newPQ = await dbInsert('player_quests', {
                id: createId('pq'),
                quest_id: quest.id,
                username: account.username,
                title: quest.title,
                reward: quest.reward,
                penalty: quest.source === 'player' ? 0 : quest.penalty,
                source: quest.source,
                created_by: quest.created_by,
                target_username: quest.target_username,
                deadline: Date.now() + (quest.duration * 60000),
                status: 'pending'
            });

            return sendJSON(res, 201, {
                ...newPQ,
                questId: newPQ.quest_id,
                createdBy: newPQ.created_by,
                targetUsername: newPQ.target_username
            });
        } catch (err) {
            return sendJSON(res, 500, { error: 'Gagal mengambil quest.' });
        }
    }

    // ── POST /my-quests ── Ambil quest milik player
    if (pathname === '/my-quests' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const username = String(body.username || '').trim();
            const rows = await dbGetAll('player_quests', { username });
            return sendJSON(res, 200, rows.map(pq => ({
                ...pq,
                questId: pq.quest_id,
                createdBy: pq.created_by,
                targetUsername: pq.target_username
            })));
        } catch (err) {
            return sendJSON(res, 500, { error: 'Gagal mengambil daftar quest.' });
        }
    }

    // ── GET /admin/player-quests ── Quest pending untuk admin
    if (pathname === '/admin/player-quests' && req.method === 'GET') {
        try {
            const allPQ = await dbGetAll('player_quests');
            const allQ = await dbGetAll('quests');
            const adminPQ = allPQ.filter(pq => {
                const quest = allQ.find(q => q.id === pq.quest_id);
                return (pq.source || quest?.source || 'admin') !== 'player';
            });
            return sendJSON(res, 200, adminPQ.map(pq => ({
                ...pq,
                questId: pq.quest_id,
                createdBy: pq.created_by,
                targetUsername: pq.target_username
            })));
        } catch (err) {
            return sendJSON(res, 500, { error: 'Gagal mengambil data quest admin.' });
        }
    }

    // ── POST /player/quest-approvals ── Daftar approval quest buatan player
    if (pathname === '/player/quest-approvals' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const username = String(body.username || '').trim();
            const account = await dbGetOne('accounts', { username_lower: username.toLowerCase() });
            if (!account) return sendJSON(res, 404, { error: 'Player tidak ditemukan.' });

            const allPQ = await dbGetAll('player_quests');
            const allQ = await dbGetAll('quests');

            const approvals = allPQ
                .filter(pq => {
                    const quest = allQ.find(q => q.id === pq.quest_id);
                    const source = pq.source || quest?.source;
                    const creator = String(pq.created_by || quest?.created_by || '').toLowerCase();
                    return pq.status === 'pending' && source === 'player' && creator === account.username.toLowerCase();
                })
                .sort((a, b) => Number(a.deadline || 0) - Number(b.deadline || 0))
                .map(pq => ({ ...pq, questId: pq.quest_id, createdBy: pq.created_by, targetUsername: pq.target_username }));

            return sendJSON(res, 200, { approvals, coins: account.coins });
        } catch (err) {
            return sendJSON(res, 500, { error: 'Gagal mengambil approval quest player.' });
        }
    }

    // ── POST /quests/player/approve ── Player approve quest selesai
    if (pathname === '/quests/player/approve' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const approverUsername = String(body.approverUsername || body.username || '').trim();
            const playerQuestId = String(body.id || '').trim();

            if (!approverUsername || !playerQuestId) return sendJSON(res, 400, { error: 'Data approval tidak lengkap.' });

            const approver = await dbGetOne('accounts', { username_lower: approverUsername.toLowerCase() });
            if (!approver) return sendJSON(res, 404, { error: 'Player pembuat quest tidak ditemukan.' });

            const pq = await dbGetOne('player_quests', { id: playerQuestId });
            if (!pq || pq.status !== 'pending') return sendJSON(res, 400, { error: 'Quest tidak valid, sudah selesai, atau sudah gagal.' });

            const quest = await dbGetOne('quests', { id: pq.quest_id });
            const creatorName = String(pq.created_by || quest?.created_by || '').toLowerCase();

            if ((pq.source || quest?.source) !== 'player') return sendJSON(res, 400, { error: 'Endpoint ini hanya untuk quest dari player.' });
            if (creatorName !== approver.username.toLowerCase()) return sendJSON(res, 403, { error: 'Hanya player yang membuat quest ini yang bisa approve.' });

            const receiver = await dbGetOne('accounts', { username_lower: pq.username.toLowerCase() });
            if (!receiver) return sendJSON(res, 404, { error: 'Player penerima quest tidak ditemukan.' });

            const rewardAmount = Number(pq.reward || quest?.reward || 0);
            if (rewardAmount <= 0) return sendJSON(res, 400, { error: 'Reward quest tidak valid.' });

            let approverCoins = approver.coins;
            if (quest && !quest.escrow_status) {
                if (approver.coins < rewardAmount) return sendJSON(res, 400, { error: 'Koin pembuat tidak cukup untuk membayar.' });
                approverCoins -= rewardAmount;
                await dbUpdate('accounts', { username_lower: approver.username.toLowerCase() }, { coins: approverCoins });
            }

            if (quest && quest.escrow_status !== 'held') return sendJSON(res, 409, { error: 'Saldo reward quest ini sudah tidak tersedia.' });

            const completedAt = new Date().toISOString();
            await dbUpdate('accounts', { username_lower: receiver.username.toLowerCase() }, { coins: receiver.coins + rewardAmount });
            await dbUpdate('player_quests', { id: pq.id }, { status: 'completed', completed_at: completedAt, approved_by: approver.username });
            if (quest) {
                await dbUpdate('quests', { id: quest.id }, { status: 'completed', escrow_status: 'paid', paid_at: completedAt, approved_by: approver.username });
            }

            return sendJSON(res, 200, {
                message: 'Quest player disetujui dan reward dibayar.',
                receiverUsername: receiver.username,
                receiverCoins: receiver.coins + rewardAmount,
                approverCoins
            });
        } catch (err) {
            console.error('POST /quests/player/approve', err);
            return sendJSON(res, 500, { error: 'Gagal approve quest player.' });
        }
    }

    // ── POST /admin/quests/approve ── Admin approve quest selesai
    if (pathname === '/admin/quests/approve' && req.method === 'POST') {
        try {
            const body = await parseRequestBody(req);
            const pq = await dbGetOne('player_quests', { id: body.id });
            if (!pq || pq.status !== 'pending') return sendJSON(res, 400, { error: 'Quest tidak valid, sudah selesai, atau gagal karena telat.' });

            const quest = await dbGetOne('quests', { id: pq.quest_id });
            if ((pq.source || quest?.source || 'admin') === 'player') {
                return sendJSON(res, 403, { error: 'Quest dari player hanya bisa di-approve oleh player yang membuat quest.' });
            }

            const completedAt = new Date().toISOString();
            await dbUpdate('player_quests', { id: pq.id }, { status: 'completed', completed_at: completedAt, approved_by: 'Admin' });

            const account = await dbGetOne('accounts', { username_lower: pq.username.toLowerCase() });
            if (account) await dbUpdate('accounts', { username_lower: pq.username.toLowerCase() }, { coins: account.coins + pq.reward });

            return sendJSON(res, 200, { message: 'Quest disetujui, imbalan diberikan.' });
        } catch (err) {
            return sendJSON(res, 500, { error: 'Gagal menyetujui quest.' });
        }
    }

    // ── Static files fallback
    const safePath = path
        .normalize(decodeURIComponent(pathname || '/'))
        .replace(/^(\.\.([\/\\]|$))+/, '')
        .replace(/^[\/\\]+/, '');
    const filePath = path.join(rootDir, safePath || 'index.html');
    const relativePath = path.relative(rootDir, filePath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        res.writeHead(400); res.end('Bad Request'); return;
    }

    return sendFile(res, filePath);
});

if (process.env.NODE_ENV !== 'production') {
    server.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

module.exports = server;
