// server.js
// Bản quyền: tuanx3000 - Tổng hợp dữ liệu Tài Xỉu từ đa nguồn (MD5 & NOHU)

const express = require('express');
const cors = require('cors');
const os = require('os');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const HISTORY_LIMIT = 200;      // giới hạn mỗi nguồn
const FETCH_INTERVAL = 5000;    // 5 giây

// ==================== THƯƠNG HIỆU ====================
const BRAND = {
    name: 'tuanx3000',
    version: '2.0.0',
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
            dice1: 'FirstDisc',
            dice2: 'SecondDisc',
            dice3: 'ThirdDisc',
            sum: 'DiscSum',
            session: 'SessionId',
            bet: 'BetSide',
            time: 'CreatedDate'
        }
    }
};

// ==================== LƯU TRỮ DỮ LIỆU CHO TỪNG NGUỒN ====================
// Mỗi nguồn có: history (mảng), latest (object)
const dataStore = {
    MD5: {
        history: [],
        latest: {
            Phien: null, Xuc_xac_1: null, Xuc_xac_2: null, Xuc_xac_3: null,
            Tong: null, Ket_qua: '', nguon: 'MD5', brand: BRAND.name,
            server_time: new Date().toISOString(), update_count: 0
        }
    },
    NOHU: {
        history: [],
        latest: {
            Phien: null, Xuc_xac_1: null, Xuc_xac_2: null, Xuc_xac_3: null,
            Tong: null, Ket_qua: '', nguon: 'NOHU', brand: BRAND.name,
            server_time: new Date().toISOString(), update_count: 0
        }
    }
};

// Tổng hợp chung (gộp cả 2 nguồn)
let aggregatedHistory = [];
let aggregatedLatest = {
    Phien: null, Xuc_xac_1: null, Xuc_xac_2: null, Xuc_xac_3: null,
    Tong: null, Ket_qua: '', nguon: 'Tổng hợp', brand: BRAND.name,
    server_time: new Date().toISOString(), update_count: 0
};

// ==================== HÀM FETCH ====================
async function fetchData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error(`[tuanx3000] Lỗi fetch ${url}:`, error.message);
        return null;
    }
}

// ==================== CHUYỂN ĐỔI DỮ LIỆU ====================
function convertToStandard(rawData, sourceName, mapping) {
    if (!rawData) return [];
    let items = rawData;
    if (rawData && typeof rawData === 'object' && Array.isArray(rawData.data)) {
        items = rawData.data;
    }
    if (!Array.isArray(items)) return [];

    return items.map(item => {
        const get = (key) => item[mapping[key]] || item[key] || 0;
        const firstDice = get('dice1');
        const secondDice = get('dice2');
        const thirdDice = get('dice3');
        const diceSum = get('sum');
        const sessionId = get('session') || '';
        const betSide = item[mapping.bet] !== undefined ? item[mapping.bet] : null;
        const createdDate = get('time') || new Date().toISOString();

        let ketQua;
        if (betSide !== null && betSide !== undefined) {
            ketQua = (betSide === 0) ? 'Tài' : 'Xỉu';
        } else {
            ketQua = (diceSum >= 11) ? 'Tài' : 'Xỉu';
        }

        return {
            Phien: sessionId,
            Xuc_xac_1: firstDice,
            Xuc_xac_2: secondDice,
            Xuc_xac_3: thirdDice,
            Tong: diceSum,
            Ket_qua: ketQua,
            nguon: sourceName,
            server_time: createdDate
        };
    });
}

// ==================== CẬP NHẬT DỮ LIỆU CHO MỘT NGUỒN ====================
async function refreshSource(sourceKey) {
    const source = SOURCES[sourceKey];
    if (!source) return;

    console.log(`[tuanx3000] ⏳ Đang cập nhật ${sourceKey}...`);
    const raw = await fetchData(source.url);
    if (!raw) {
        console.warn(`[tuanx3000] ⚠️ ${sourceKey}: không lấy được dữ liệu`);
        return;
    }

    const converted = convertToStandard(raw, sourceKey, source.mapping);
    if (converted.length === 0) {
        console.warn(`[tuanx3000] ⚠️ ${sourceKey}: không có phiên nào`);
        return;
    }

    // Sắp xếp mới nhất trước
    converted.sort((a, b) => new Date(b.server_time) - new Date(a.server_time));

    // Lưu vào store riêng
    const store = dataStore[sourceKey];
    store.history = converted.slice(0, HISTORY_LIMIT);

    // Cập nhật latest
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
        console.log(`[tuanx3000] ✅ ${sourceKey}: ${converted.length} phiên, mới nhất: ${latest.Phien} - ${latest.Xuc_xac_1}-${latest.Xuc_xac_2}-${latest.Xuc_xac_3} = ${latest.Tong} (${latest.Ket_qua})`);
    }
}

// ==================== CẬP NHẬT TỔNG HỢP ====================
function updateAggregated() {
    // Gộp tất cả lịch sử từ 2 nguồn
    const all = [];
    for (const key of ['MD5', 'NOHU']) {
        all.push(...dataStore[key].history);
    }
    all.sort((a, b) => new Date(b.server_time) - new Date(a.server_time));
    aggregatedHistory = all.slice(0, HISTORY_LIMIT * 2); // giữ nhiều hơn

    if (aggregatedHistory.length > 0) {
        const latest = aggregatedHistory[0];
        aggregatedLatest = {
            Phien: latest.Phien,
            Xuc_xac_1: latest.Xuc_xac_1,
            Xuc_xac_2: latest.Xuc_xac_2,
            Xuc_xac_3: latest.Xuc_xac_3,
            Tong: latest.Tong,
            Ket_qua: latest.Ket_qua,
            nguon: latest.nguon + ' (tổng hợp)',
            brand: BRAND.name,
            server_time: new Date().toISOString(),
            update_count: (aggregatedLatest.update_count || 0) + 1
        };
        console.log(`[tuanx3000] 🔄 Tổng hợp: ${aggregatedHistory.length} phiên, mới nhất từ ${latest.nguon}`);
    }
}

// ==================== REFRESH TOÀN BỘ ====================
async function refreshAll() {
    await refreshSource('MD5');
    await refreshSource('NOHU');
    updateAggregated();
}

// ==================== API ROUTES ====================

// Trang chủ
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
            '/api/nohu/stats': 'Thống kê từ NOHU'
        }
    });
});

// ----- TỔNG HỢP -----
app.get('/api/latest', (req, res) => {
    res.json(aggregatedLatest);
});

app.get('/api/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    res.json({
        brand: BRAND.name,
        total: aggregatedHistory.length,
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
        tai_percent: total ? ((tai/total)*100).toFixed(2) : 0,
        xiu_percent: total ? ((xiu/total)*100).toFixed(2) : 0,
        by_source: bySource
    });
});

// ----- MD5 -----
app.get('/api/md5/latest', (req, res) => {
    res.json(dataStore.MD5.latest);
});

app.get('/api/md5/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    res.json({
        brand: BRAND.name,
        source: 'MD5',
        total: dataStore.MD5.history.length,
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
        tai_percent: total ? ((tai/total)*100).toFixed(2) : 0,
        xiu_percent: total ? ((xiu/total)*100).toFixed(2) : 0
    });
});

// ----- NOHU -----
app.get('/api/nohu/latest', (req, res) => {
    res.json(dataStore.NOHU.latest);
});

app.get('/api/nohu/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    res.json({
        brand: BRAND.name,
        source: 'NOHU',
        total: dataStore.NOHU.history.length,
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
        tai_percent: total ? ((tai/total)*100).toFixed(2) : 0,
        xiu_percent: total ? ((xiu/total)*100).toFixed(2) : 0
    });
});

// ==================== KHỞI ĐỘNG SERVER ====================
app.listen(PORT, '0.0.0.0', async () => {
    const interfaces = os.networkInterfaces();
    let ip = '127.0.0.1';
    for (const iface of Object.values(interfaces)) {
        for (const addr of iface) {
            if (!addr.internal && addr.family === 'IPv4') ip = addr.address;
        }
    }

    console.log(`\n╔═══════════════════════════════════════════════════╗`);
    console.log(`║   🚀 SERVER TỔNG HỢP DỮ LIỆU MD5 & NOHU    ║`);
    console.log(`║   👤 Bản quyền: tuanx3000                    ║`);
    console.log(`║   📦 Phiên bản: ${BRAND.version}                        ║`);
    console.log(`╠═══════════════════════════════════════════════════╣`);
    console.log(`║   🌐 Local:  http://localhost:${PORT}           ║`);
    console.log(`║   🌐 Network: http://${ip}:${PORT}             ║`);
    console.log(`╚═══════════════════════════════════════════════════╝\n`);
    console.log(`[tuanx3000] ✅ Server đã sẵn sàng, cập nhật mỗi ${FETCH_INTERVAL/1000}s`);

    await refreshAll();
    setInterval(refreshAll, FETCH_INTERVAL);
});