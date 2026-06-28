// server.js - PHIÊN BẢN SỬA CHỮA HOÀN CHỈNH V2.1.1
// Bản quyền: tuanx3000 - Tổng hợp dữ liệu Tài Xỉu từ đa nguồn (MD5 & NOHU)
// Fix Log: Sửa lỗi Scope timeoutId trong catch block, tối ưu hóa thứ tự mảng trả về cho Client.

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
    version: '2.1.1',
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

const dataStore = {
    MD5: { history: [], latest: { Phien: null, Xuc_xac_1: null, Xuc_xac_2: null, Xuc_xac_3: null, Tong: null, Ket_qua: '', nguon: 'MD5', brand: BRAND.name, server_time: new Date().toISOString(), update_count: 0 } },
    NOHU: { history: [], latest: { Phien: null, Xuc_xac_1: null, Xuc_xac_2: null, Xuc_xac_3: null, Tong: null, Ket_qua: '', nguon: 'NOHU', brand: BRAND.name, server_time: new Date().toISOString(), update_count: 0 } }
};

let aggregatedHistory = [];
let aggregatedLatest = { Phien: null, Xuc_xac_1: null, Xuc_xac_2: null, Xuc_xac_3: null, Tong: null, Ket_qua: '', nguon: 'Tổng hợp', brand: BRAND.name, server_time: new Date().toISOString(), update_count: 0 };

// ==================== FIX #1: ĐƯA TIMEOUTID RA NGOÀI SCOPE ĐỂ TRÁNH CRASH CRITICAL ====================
async function fetchWithRetry(url, retries = MAX_RETRY) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        let timeoutId = null; // Khai báo ở đây để khối catch có thể đọc được và xoá bỏ timer
        try {
            const controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
            
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const json = await response.json();
            console.log(`[tuanx3000] ✅ Fetch thành công (attempt ${attempt}) - ${JSON.stringify(json).length} bytes`);
            return json;
        } catch (error) {
            if (timeoutId) clearTimeout(timeoutId);
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
    if (!rawData) return [];

    let items = rawData;
    if (typeof rawData === 'object' && !Array.isArray(rawData)) {
        if (Array.isArray(rawData.data)) {
            items = rawData.data;
        } else if (Array.isArray(rawData)) {
            items = rawData;
        } else {
            return [];
        }
    }

    if (!Array.isArray(items)) return [];

    const validItems = [];
    let skipped = 0;

    for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        try {
            let sessionId = String(item[mapping.session] || item.SessionId || '').trim();
            if (!sessionId) { skipped++; continue; }

            const dice1 = parseInt(item[mapping.dice1] || item.FirstDice || 0, 10);
            const dice2 = parseInt(item[mapping.dice2] || item.SecondDice || 0, 10);
            const dice3 = parseInt(item[mapping.dice3] || item.ThirdDice || 0, 10);
            if (isNaN(dice1) || isNaN(dice2) || isNaN(dice3) || dice1 < 1 || dice1 > 6 || dice2 < 1 || dice2 > 6 || dice3 < 1 || dice3 > 6) {
                skipped++; continue;
            }

            let diceSum = parseInt(item[mapping.sum] || item.DiceSum || 0, 10);
            if (isNaN(diceSum) || diceSum < 3 || diceSum > 18) {
                diceSum = dice1 + dice2 + dice3;
                if (diceSum < 3 || diceSum > 18) { skipped++; continue; }
            }

            const betSideRaw = item[mapping.bet];
            let ketQua = '';
            if (betSideRaw === 0 || betSideRaw === '0') { ketQua = 'Tài'; } 
            else if (betSideRaw === 1 || betSideRaw === '1') { ketQua = 'Xỉu'; } 
            else if (betSideRaw === 'Tài' || betSideRaw === 'tai') { ketQua = 'Tài'; } 
            else if (betSideRaw === 'Xỉu' || betSideRaw === 'xiu') { ketQua = 'Xỉu'; } 
            else { ketQua = (diceSum >= 11) ? 'Tài' : 'Xỉu'; }

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
        }
    }
    return validItems;
}

// ==================== CẬP NHẬT DỮ LIỆU ĐỘC LẬP TỪNG NGUỒN ====================
async function refreshSource(sourceKey) {
    const source = SOURCES[sourceKey];
    if (!source) return;

    const raw = await fetchWithRetry(source.url);
    if (!raw) return;

    let converted = convertToStandard(raw, sourceKey, source.mapping);
    if (converted.length === 0) return;

    // Sắp xếp giảm dần theo thời gian (mới nhất lên đầu) để lấy `latest` chuẩn xác nhất
    converted.sort((a, b) => new Date(b.server_time).getTime() - new Date(a.server_time).getTime());

    const seen = new Set();
    const unique = [];
    for (const item of converted) {
        const key = item.Phien + '-' + sourceKey;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(item);
        }
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
    }
}

// ==================== TỔNG HỢP MẢNG DATA ĐẢO NGƯỢC CHUẨN FRONTEND ====================
function updateAggregated() {
    const all = [];
    for (const key of ['MD5', 'NOHU']) {
        all.push(...dataStore[key].history);
    }

    const seen = new Set();
    const unique = [];
    for (const item of all) {
        const key = item.Phien + '-' + item.nguon;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(item);
        }
    }

    // Sắp xếp toàn bộ mảng tổng hợp: Phiên MỚI NHẤT lên đầu danh sách để Frontend bóc tách [0] ăn ngay
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
        console.log(`[tuanx3000] 🔄 Đồng bộ: Đã nạp thành công phiên mới nhất từ nguồn [${latest.nguon}] - Phiên #${latest.Phien}`);
    }
}

async function refreshAll() {
    await refreshSource('MD5');
    await refreshSource('NOHU');
    updateAggregated();
}

// ==================== API ROUTES ====================
app.get('/', (req, res) => {
    res.json({ brand: BRAND.name, message: 'Server tổng hợp dữ liệu Tài Xỉu - bởi tuanx3000' });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        sources: {
            MD5: { count: dataStore.MD5.history.length, latest: dataStore.MD5.latest.Phien },
            NOHU: { count: dataStore.NOHU.history.length, latest: dataStore.NOHU.latest.Phien }
        }
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

app.use((err, req, res, next) => {
    console.error('[tuanx3000] 🚨 Server Error:', err.message);
    res.status(500).json({ error: err.message });
});

// ==================== KHỞI ĐỘNG CƠ CHẾ CHẠY LUỒNG ====================
const server = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[tuanx3000] ✅ Server khởi chạy thành công trên cổng ${PORT}`);
    await refreshAll();
    setInterval(refreshAll, FETCH_INTERVAL);
});
