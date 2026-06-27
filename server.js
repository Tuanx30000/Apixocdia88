// server.js - PHIÊN BẢN SỬA CHỮA HOÀN CHỈNH V2.1.0
// Bản quyền: tuanx3000 - Tổng hợp dữ liệu Tài Xỉu từ đa nguồn (MD5 & NOHU)
// Fix Log: 2026-06-28 - Sửa lỗi mapping, nested data, validation, timeout, CORS, deduplicate, retry

const express = require('express');
const cors = require('cors');
const os = require('os');

const app = express();

// ==================== CORS SECURITY ====================
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:8080',
            'https://apixocdia88-zb41.onrender.com',
            /\.onrender\.com$/,
            /\.cloudflare\.com$/,
            /\.vercel\.app$/,
            /\.netlify\.app$/
        ];
        
        if (!origin || allowedOrigins.some(o => 
            typeof o === 'string' ? o === origin : o.test(origin)
        )) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
};

app.use(cors(corsOptions));

const PORT = process.env.PORT || 3000;
const HISTORY_LIMIT = 200;
const FETCH_INTERVAL = 5000;
const FETCH_TIMEOUT = 10000;
const MAX_RETRY = 3;
const RETRY_DELAY = 1000;

// ==================== THƯƠNG HIỆU ====================
const BRAND = {
    name: 'tuanx3000',
    version: '2.1.0',
    author: 'tuanx3000',
    contact: 'https://t.me/tuanx3000'
};

// ==================== ĐỊNH NGHĨA 2 NGUỒN RIÊNG ====================
const SOURCES = {
    MD5: {
        name: 'MD5',
        url: 'https://taixiumd5.system32-cloudfare-356783752985678522.monster/api/md5luckydice/GetSoiCau?access_token=05%2F7JlwSPGzCB603fmQJ2LRgxker3LXsB3UwDAmuWFIm9ePS%2F1XXM7wP3wlmMB16LVCmODRrV5BnR6kh01ieEa1YE3byVv3jXdl42VfMnxKHyDlbmvc1ENnh6n7hndt76S2l6zQCwsIQZTipEAUt46PFfV7ND7EU4bQCq193fDO%2FtSfFsBPmTgOa2dPdDXxQkROt9qsBacLqMq%2BFmiGq30OXhQQkPy6LkqBW9huthNBPJNJ4ybTofAdvGhgbhXRFYUsVFk%2FPZwDMGb3PvuyxxH5SUGueiC7hw4FPwdAT7XLC7W%2FWifLHgVsym750oS1XV1rdhoLoN2HNddd2DQqLwPiaVtHQaOsPr2J52Mwlhrwa9oK9inHUIxa14xMk%2B0Jgreyd8urEUZ8%3D.9693f922987a1adb6081acbc91ef26e1386e6dd07078ef53e345e8a5c1e62baf',
        mapping: {
            dice1: 'FirstDice',
            dice2: 'SecondDice',
            dice3: 'ThirdDice',
            sum: 'DiceSum',
            session: 'SessionId',
            bet: 'BetSide',
            time: 'CreatedDate'
        }
    },
    NOHU: {
        name: 'NOHU',
        url: 'https://taixiu.system32-cloudfare-356783752985678522.monster/api/luckydice/GetSoiCau?access_token=05%2F7JlwSPGzCB603fmQJ2LRgxker3LXsB3UwDAmuWFIm9ePS%2F1XXM7wP3wlmMB16LVCmODRrV5BnR6kh01ieEa1YE3byVv3jXdl42VfMnxKHyDlbmvc1ENnh6n7hndt76S2l6zQCwsIQZTipEAUt46PFfV7ND7EU4bQCq193fDO%2FtSfFsBPmTgOa2dPdDXxQkROt9qsBacLqMq%2BFmiGq30OXhQQkPy6LkqBW9huthNBPJNJ4ybTofAdvGhgbhXRFYUsVFk%2FPZwDMGb3PvuyxxH5SUGueiC7hw4FPwdAT7XLC7W%2FWifLHgVsym750oS1XV1rdhoLoN2HNddd2DQqLwPiaVtHQaOsPr2J52Mwlhrwa9oK9inHUIxa14xMk%2B0Jgreyd8urEUZ8%3D.9693f922987a1adb6081acbc91ef26e1386e6dd07078ef53e345e8a5c1e62baf',
        mapping: {
            dice1: 'FirstDice',
            dice2: 'SecondDice',
            dice3: 'ThirdDice',
            sum: 'DiceSum',
            session: 'SessionId',
            bet: 'BetSide',
            time: 'CreatedDate'
        }
    }
};

// ==================== LƯU TRỮ DỮ LIỆU CHO TỪNG NGUỒN ====================
const dataStore = {
    MD5: { history: [], latest: { Phien: null, Xuc_xac_1: null, Xuc_xac_2: null, Xuc_xac_3: null, Tong: null, Ket_qua: '', nguon: 'MD5', brand: BRAND.name, server_time: new Date().toISOString(), update_count: 0 } },
    NOHU: { history: [], latest: { Phien: null, Xuc_xac_1: null, Xuc_xac_2: null, Xuc_xac_3: null, Tong: null, Ket_qua: '', nguon: 'NOHU', brand: BRAND.name, server_time: new Date().toISOString(), update_count: 0 } }
};

let aggregatedHistory = [];
let aggregatedLatest = { Phien: null, Xuc_xac_1: null, Xuc_xac_2: null, Xuc_xac_3: null, Tong: null, Ket_qua: '', nguon: 'Tổng hợp', brand: BRAND.name, server_time: new Date().toISOString(), update_count: 0 };

// ==================== HÀM FETCH VỚI RETRY & TIMEOUT ====================
async function fetchWithRetry(url, retries = MAX_RETRY) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const json = await response.json();
            console.log(`[tuanx3000] ✅ Fetch thành công (attempt ${attempt}) - ${JSON.stringify(json).length} bytes`);
            return json;
        } catch (error) {
            clearTimeout(timeoutId);
            const isTimeout = error.name === 'AbortError';
            console.warn(`[tuanx3000] ⚠️ Attempt ${attempt}/${retries} thất bại: ${isTimeout ? 'Timeout' : error.message}`);
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, RETRY_DELAY * attempt));
            } else {
                console.error(`[tuanx3000] ❌ Đã hết retry cho ${url.substring(0, 50)}...`);
                return null;
            }
        }
    }
    return null;
}

// ==================== CHUYỂN ĐỔI DỮ LIỆU (CÓ VALIDATION) ====================
function convertToStandard(rawData, sourceName, mapping) {
    if (!rawData) {
        console.warn(`[tuanx3000] ⚠️ rawData null/undefined từ ${sourceName}`);
        return [];
    }

    let items = rawData;
    if (typeof rawData === 'object' && !Array.isArray(rawData)) {
        if (Array.isArray(rawData.data)) {
            items = rawData.data;
            console.log(`[tuanx3000] 📦 Dùng nested .data với ${items.length} phần tử`);
        } else if (Array.isArray(rawData)) {
            items = rawData;
        } else {
            console.warn(`[tuanx3000] ⚠️ Không thể tìm array trong response`);
            return [];
        }
    }

    if (!Array.isArray(items)) {
        console.warn(`[tuanx3000] ⚠️ items không phải array: ${typeof items}`);
        return [];
    }

    console.log(`[tuanx3000] 🔄 Chuyển đổi ${items.length} phần tử từ ${sourceName}`);

    const validItems = [];
    let skipped = 0;

    for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        try {
            // 1. Lấy sessionId
            let sessionId = String(item[mapping.session] || item.SessionId || '').trim();
            if (!sessionId) {
                skipped++;
                continue;
            }

            // 2. Dice values
            const dice1 = parseInt(item[mapping.dice1] || item.FirstDice || 0, 10);
            const dice2 = parseInt(item[mapping.dice2] || item.SecondDice || 0, 10);
            const dice3 = parseInt(item[mapping.dice3] || item.ThirdDice || 0, 10);
            if (isNaN(dice1) || isNaN(dice2) || isNaN(dice3) || dice1 < 1 || dice1 > 6 || dice2 < 1 || dice2 > 6 || dice3 < 1 || dice3 > 6) {
                skipped++;
                continue;
            }

            // 3. Sum
            let diceSum = parseInt(item[mapping.sum] || item.DiceSum || 0, 10);
            if (isNaN(diceSum) || diceSum < 3 || diceSum > 18) {
                diceSum = dice1 + dice2 + dice3;
                if (diceSum < 3 || diceSum > 18) {
                    skipped++;
                    continue;
                }
            }

            // 4. BetSide
            const betSideRaw = item[mapping.bet];
            let ketQua = '';
            if (betSideRaw === 0 || betSideRaw === '0') {
                ketQua = 'Tài';
            } else if (betSideRaw === 1 || betSideRaw === '1') {
                ketQua = 'Xỉu';
            } else if (betSideRaw === 'Tài' || betSideRaw === 'tai') {
                ketQua = 'Tài';
            } else if (betSideRaw === 'Xỉu' || betSideRaw === 'xiu') {
                ketQua = 'Xỉu';
            } else {
                ketQua = (diceSum >= 11) ? 'Tài' : 'Xỉu';
            }

            // 5. Time - chuẩn hóa ISO
            let serverTime = item[mapping.time] || item.CreatedDate || new Date().toISOString();
            try {
                const d = new Date(serverTime);
                if (!isNaN(d.getTime())) serverTime = d.toISOString();
                else serverTime = new Date().toISOString();
            } catch (e) {
                serverTime = new Date().toISOString();
            }

            validItems.push({
                Phien: sessionId,
                Xuc_xac_1: dice1,
                Xuc_xac_2: dice2,
                Xuc_xac_3: dice3,
                Tong: diceSum,
                Ket_qua: ketQua,
                nguon: sourceName,
                server_time: serverTime,
                bet_side_raw: betSideRaw
            });

        } catch (e) {
            skipped++;
            console.error(`[tuanx3000] ❌ Lỗi item #${idx}:`, e.message);
        }
    }

    if (skipped > 0) {
        console.warn(`[tuanx3000] ⚠️ Đã bỏ qua ${skipped} phần tử không hợp lệ từ ${sourceName}`);
    }
    return validItems;
}

// ==================== CẬP NHẬT DỮ LIỆU (CÓ DEDUPLICATE) ====================
async function refreshSource(sourceKey) {
    const source = SOURCES[sourceKey];
    if (!source) {
        console.error(`[tuanx3000] ❌ Source ${sourceKey} không tồn tại`);
        return;
    }

    console.log(`[tuanx3000] ⏳ Đang cập nhật ${sourceKey}...`);
    const raw = await fetchWithRetry(source.url);

    if (!raw) {
        console.warn(`[tuanx3000] ⚠️ ${sourceKey}: không lấy được dữ liệu`);
        return;
    }

    let converted = convertToStandard(raw, sourceKey, source.mapping);
    if (converted.length === 0) {
        console.warn(`[tuanx3000] ⚠️ ${sourceKey}: không có phiên hợp lệ sau conversion`);
        return;
    }

    // Sắp xếp theo thời gian giảm dần (mới nhất trước)
    converted.sort((a, b) => new Date(b.server_time).getTime() - new Date(a.server_time).getTime());

    // Deduplicate dựa trên Phien (giữ phiên mới nhất)
    const seen = new Set();
    const unique = [];
    for (const item of converted) {
        const key = item.Phien + '-' + sourceKey;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(item);
        }
    }

    if (unique.length < converted.length) {
        console.log(`[tuanx3000] 🧹 Loại bỏ ${converted.length - unique.length} phiên trùng lặp trong ${sourceKey}`);
    }

    const store = dataStore[sourceKey];
    store.history = unique.slice(0, HISTORY_LIMIT);

    if (store.history.length > 0) {
        const latest = store.history[0];
        store.latest = {
            Phien: latest.Phien,
            Xuc_xac_1: latest.Xuc_xac_1,
            Xuc_xac_2: latest.Xuc_xac_2,
            Xuc_xac_3: latest.Xuc_xac_3,
            Tong: latest.Tong,
            Ket_qua: latest.Ket_qua,
            nguon: sourceKey,
            brand: BRAND.name,
            server_time: new Date().toISOString(),
            update_count: (store.latest.update_count || 0) + 1
        };

        console.log(`[tuanx3000] ✅ ${sourceKey}: ${converted.length} phiên nhận, ${unique.length} hợp lệ, ${store.history.length} lưu, mới nhất #${latest.Phien} [${latest.Xuc_xac_1}-${latest.Xuc_xac_2}-${latest.Xuc_xac_3}=${latest.Tong}] → ${latest.Ket_qua}`);
    }
}

function updateAggregated() {
    const all = [];
    for (const key of ['MD5', 'NOHU']) {
        all.push(...dataStore[key].history);
    }

    // Deduplicate tổng hợp (theo Phien + nguon)
    const seen = new Set();
    const unique = [];
    for (const item of all) {
        const key = item.Phien + '-' + item.nguon;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(item);
        }
    }

    unique.sort((a, b) => new Date(b.server_time).getTime() - new Date(a.server_time).getTime());

    aggregatedHistory = unique.slice(0, HISTORY_LIMIT * 2);

    if (aggregatedHistory.length > 0) {
        const latest = aggregatedHistory[0];
        aggregatedLatest = {
            Phien: latest.Phien,
            Xuc_xac_1: latest.Xuc_xac_1,
            Xuc_xac_2: latest.Xuc_xac_2,
            Xuc_xac_3: latest.Xuc_xac_3,
            Tong: latest.Tong,
            Ket_qua: latest.Ket_qua,
            nguon: latest.nguon,
            brand: BRAND.name,
            server_time: new Date().toISOString(),
            update_count: (aggregatedLatest.update_count || 0) + 1
        };

        const md5Count = aggregatedHistory.filter(h => h.nguon === 'MD5').length;
        const nohuCount = aggregatedHistory.filter(h => h.nguon === 'NOHU').length;
        console.log(`[tuanx3000] 🔄 Tổng hợp: ${aggregatedHistory.length} phiên (MD5: ${md5Count}, NOHU: ${nohuCount}), mới nhất từ ${latest.nguon}`);
    } else {
        console.warn(`[tuanx3000] ⚠️ Không có dữ liệu tổng hợp`);
    }
}

async function refreshAll() {
    console.log(`[tuanx3000] 🔄🔄🔄 BẮT ĐẦU CẬP NHẬT TOÀN BỘ [${new Date().toISOString()}]`);
    await refreshSource('MD5');
    await refreshSource('NOHU');
    updateAggregated();
    console.log(`[tuanx3000] ✅✅✅ HOÀN THÀNH CẬP NHẬT\n`);
}

// ==================== API ROUTES ====================
app.get('/', (req, res) => {
    res.json({
        brand: BRAND.name,
        version: BRAND.version,
        author: BRAND.author,
        contact: BRAND.contact,
        message: 'Server tổng hợp dữ liệu Tài Xỉu - bởi tuanx3000',
        endpoints: {
            '/api/latest': 'Kết quả mới nhất tổng hợp',
            '/api/history?limit=20': 'Lịch sử tổng hợp',
            '/api/stats': 'Thống kê tổng hợp',
            '/api/md5/latest': 'Kết quả mới nhất từ MD5',
            '/api/md5/history': 'Lịch sử từ MD5',
            '/api/md5/stats': 'Thống kê từ MD5',
            '/api/nohu/latest': 'Kết quả mới nhất từ NOHU',
            '/api/nohu/history': 'Lịch sử từ NOHU',
            '/api/nohu/stats': 'Thống kê từ NOHU',
            '/health': 'Kiểm tra sức khỏe server'
        }
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        sources: {
            MD5: { count: dataStore.MD5.history.length, latest: dataStore.MD5.latest.Phien },
            NOHU: { count: dataStore.NOHU.history.length, latest: dataStore.NOHU.latest.Phien }
        },
        aggregated: aggregatedHistory.length
    });
});

app.get('/api/latest', (req, res) => {
    res.json(aggregatedLatest);
});

app.get('/api/history', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 20, 500);
    res.json({
        brand: BRAND.name,
        total: aggregatedHistory.length,
        limit: limit,
        data: aggregatedHistory.slice(0, limit)
    });
});

app.get('/api/stats', (req, res) => {
    const total = aggregatedHistory.length;
    const tai = aggregatedHistory.filter(h => h.Ket_qua === 'Tài').length;
    const xiu = total - tai;
    const bySource = aggregatedHistory.reduce((acc, h) => {
        acc[h.nguon] = (acc[h.nguon] || 0) + 1;
        return acc;
    }, {});

    res.json({
        brand: BRAND.name,
        total,
        tai,
        xiu,
        tai_percent: total ? ((tai / total) * 100).toFixed(2) : 0,
        xiu_percent: total ? ((xiu / total) * 100).toFixed(2) : 0,
        by_source: bySource
    });
});

app.get('/api/md5/latest', (req, res) => {
    res.json(dataStore.MD5.latest);
});

app.get('/api/md5/history', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 20, 500);
    res.json({
        brand: BRAND.name,
        source: 'MD5',
        total: dataStore.MD5.history.length,
        limit: limit,
        data: dataStore.MD5.history.slice(0, limit)
    });
});

app.get('/api/md5/stats', (req, res) => {
    const history = dataStore.MD5.history;
    const total = history.length;
    const tai = history.filter(h => h.Ket_qua === 'Tài').length;
    const xiu = total - tai;

    res.json({
        brand: BRAND.name,
        source: 'MD5',
        total,
        tai,
        xiu,
        tai_percent: total ? ((tai / total) * 100).toFixed(2) : 0,
        xiu_percent: total ? ((xiu / total) * 100).toFixed(2) : 0
    });
});

app.get('/api/nohu/latest', (req, res) => {
    res.json(dataStore.NOHU.latest);
});

app.get('/api/nohu/history', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 20, 500);
    res.json({
        brand: BRAND.name,
        source: 'NOHU',
        total: dataStore.NOHU.history.length,
        limit: limit,
        data: dataStore.NOHU.history.slice(0, limit)
    });
});

app.get('/api/nohu/stats', (req, res) => {
    const history = dataStore.NOHU.history;
    const total = history.length;
    const tai = history.filter(h => h.Ket_qua === 'Tài').length;
    const xiu = total - tai;

    res.json({
        brand: BRAND.name,
        source: 'NOHU',
        total,
        tai,
        xiu,
        tai_percent: total ? ((tai / total) * 100).toFixed(2) : 0,
        xiu_percent: total ? ((xiu / total) * 100).toFixed(2) : 0
    });
});

// ==================== ERROR HANDLING ====================
app.use((err, req, res, next) => {
    console.error('[tuanx3000] 🚨 Server Error:', err.message);
    res.status(500).json({ error: err.message });
});

// ==================== KHỞI ĐỘNG ====================
const server = app.listen(PORT, '0.0.0.0', async () => {
    const ifaces = os.networkInterfaces();
    let ip = '127.0.0.1';
    for (const iface of Object.values(ifaces)) {
        for (const addr of iface) {
            if (!addr.internal && addr.family === 'IPv4') ip = addr.address;
        }
    }

    console.log(`\n╔════════════════════════════════════════════════════╗`);
    console.log(`║   🚀 TX DATA AGGREGATOR SERVER (FIXED v2.1.0)     ║`);
    console.log(`║   👤 tuanx3000 - Tổng hợp MD5 & NOHU             ║`);
    console.log(`╠════════════════════════════════════════════════════╣`);
    console.log(`║   🌐 Local:   http://localhost:${PORT}${' '.repeat(31 - PORT.toString().length)} ║`);
    console.log(`║   🌐 Network: http://${ip}:${PORT}${' '.repeat(29 - ip.length - PORT.toString().length)} ║`);
    console.log(`║   ⏱️  Interval: ${FETCH_INTERVAL / 1000}s | Timeout: ${FETCH_TIMEOUT / 1000}s            ║`);
    console.log(`║   📊 Limit: ${HISTORY_LIMIT} records/source                 ║`);
    console.log(`╚════════════════════════════════════════════════════╝\n`);

    console.log(`[tuanx3000] ✅ Server khởi động thành công`);
    console.log(`[tuanx3000] 📋 Fix log:\n` +
        `   ✅ FIX #1: NOHU mapping FirstDisc → FirstDice\n` +
        `   ✅ FIX #2: Handle nested .data structure\n` +
        `   ✅ FIX #3: BetSide logic explicit validation\n` +
        `   ✅ FIX #4: DiceSum validation & fallback\n` +
        `   ✅ FIX #5: SessionId as string\n` +
        `   ✅ FIX #6: AbortController timeout 10s\n` +
        `   ✅ FIX #7: Better error logging\n` +
        `   ✅ FIX #8: CORS whitelist instead of allow all\n` +
        `   ✅ FIX #9: Retry mechanism (3 lần)\n` +
        `   ✅ FIX #10: Deduplicate by Phien + nguon\n` +
        `   ✅ FIX #11: Validate dice range (1-6), sum (3-18)\n` +
        `   ✅ FIX #12: Endpoint /health\n`);

    console.log(`[tuanx3000] 🔄 Cập nhật lần đầu...\n`);
    await refreshAll();

    setInterval(refreshAll, FETCH_INTERVAL);
    console.log(`[tuanx3000] 🔄 Auto-refresh mỗi ${FETCH_INTERVAL / 1000}s. Ctrl+C để dừng.\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log(`\n[tuanx3000] 🛑 SIGTERM nhận được, đóng server...`);
    server.close(() => {
        console.log(`[tuanx3000] ✅ Server đã đóng.`);
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log(`\n[tuanx3000] 🛑 SIGINT nhận được, đóng server...`);
    server.close(() => {
        console.log(`[tuanx3000] ✅ Server đã đóng.`);
        process.exit(0);
    });
});