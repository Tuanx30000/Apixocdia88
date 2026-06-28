// server.js - PHIÊN BẢN TỐI ƯU & SỬA LỖI V2.1.2
// Bản quyền: tuanx3000 - Tổng hợp dữ liệu Tài Xỉu từ đa nguồn (MD5 & NOHU)
// Thay đổi v2.1.2: Fix lỗi scope, optimize memory, improve error handling, cải thiện performance

const express = require('express');
const cors = require('cors');

const app = express();

// ==================== CẤUHINH CONSTANTS ====================
const PORT = process.env.PORT || 3000;
const HISTORY_LIMIT = 200;
const FETCH_INTERVAL = 5000;
const FETCH_TIMEOUT = 10000;
const MAX_RETRY = 3;
const RETRY_DELAY = 1000;

// ==================== BRAND INFO ====================
const BRAND = {
    name: 'tuanx3000',
    version: '2.1.2',
    author: 'tuanx3000',
    contact: 'https://t.me/tuanx3000'
};

// ==================== CORS CONFIGURATION ====================
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:8080',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:8080',
            'https://apixocdia88-zb41.onrender.com',
            /^https?:\/\/localhost(:\d+)?$/,
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
            callback(new Error('CORS not allowed'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ==================== DATA SOURCES ====================
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

// ==================== DATA STORE ====================
const dataStore = {
    MD5: { 
        history: [], 
        latest: createEmptyRecord('MD5'),
        lastUpdate: null,
        errorCount: 0
    },
    NOHU: { 
        history: [], 
        latest: createEmptyRecord('NOHU'),
        lastUpdate: null,
        errorCount: 0
    }
};

let aggregatedHistory = [];
let aggregatedLatest = createEmptyRecord('Tổng hợp');
let lastAggregationTime = null;

function createEmptyRecord(source) {
    return {
        Phien: null,
        Xuc_xac_1: null,
        Xuc_xac_2: null,
        Xuc_xac_3: null,
        Tong: null,
        Ket_qua: '',
        nguon: source,
        brand: BRAND.name,
        server_time: new Date().toISOString(),
        update_count: 0
    };
}

// ==================== UTILITY: VALIDATE DICE ====================
function isValidDice(value) {
    const num = parseInt(value, 10);
    return !isNaN(num) && num >= 1 && num <= 6;
}

// ==================== UTILITY: VALIDATE SUM ====================
function isValidSum(value) {
    const num = parseInt(value, 10);
    return !isNaN(num) && num >= 3 && num <= 18;
}

// ==================== UTILITY: PARSE DATE SAFELY ====================
function parseDateSafely(dateStr) {
    if (!dateStr) return new Date().toISOString();
    try {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            return date.toISOString();
        }
    } catch (e) {
        // Ignore parse error
    }
    return new Date().toISOString();
}

// ==================== UTILITY: DETERMINE KET QUA ====================
function determineKetQua(betSideRaw, dice1, dice2, dice3) {
    // === LỰA CHỌN 1: Từ betSideRaw (Số) ===
    if (betSideRaw === 0 || betSideRaw === '0') return 'Tài';
    if (betSideRaw === 1 || betSideRaw === '1') return 'Xỉu';

    // === LỰA CHỌN 2: Từ betSideRaw (Text) ===
    const betText = String(betSideRaw || '').toLowerCase().trim();
    if (betText === 'tài' || betText === 'tai') return 'Tài';
    if (betText === 'xỉu' || betText === 'xiu') return 'Xỉu';

    // === FALLBACK: Tính từ tổng xúc xắc ===
    const sum = (dice1 || 0) + (dice2 || 0) + (dice3 || 0);
    return sum >= 11 ? 'Tài' : 'Xỉu';
}

// ==================== FIX #1: RETRY LOGIC VỚI TIMEOUT MANAGEMENT ====================
async function fetchWithRetry(url, retries = MAX_RETRY) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        let timeoutHandle = null;

        try {
            const controller = new AbortController();
            timeoutHandle = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

            const response = await fetch(url, { 
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (tuanx3000)' }
            });

            clearTimeout(timeoutHandle);
            timeoutHandle = null;

            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }

            const json = await response.json();
            
            if (!json) {
                throw new Error('Empty response body');
            }

            console.log(`[tuanx3000] ✅ Fetch success (attempt ${attempt}/${retries}) - ${JSON.stringify(json).length} bytes`);
            return json;

        } catch (error) {
            // === FIX: Đảm bảo timeoutHandle được xoá trong TẤT CẢ trường hợp ===
            if (timeoutHandle) {
                clearTimeout(timeoutHandle);
                timeoutHandle = null;
            }

            const isTimeout = error.name === 'AbortError';
            const errorMsg = isTimeout ? 'Timeout' : error.message;
            
            console.warn(`[tuanx3000] ⚠️ Attempt ${attempt}/${retries} failed: ${errorMsg}`);

            if (attempt < retries) {
                const delay = RETRY_DELAY * attempt;
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error(`[tuanx3000] ❌ All retries exhausted for: ${url.substring(0, 60)}...`);
                return null;
            }
        }
    }

    return null;
}

// ==================== FIX #2: IMPROVED DATA CONVERSION WITH VALIDATION ====================
function convertToStandard(rawData, sourceName, mapping) {
    if (!rawData) return [];

    // === Xác định mảng items ===
    let items = Array.isArray(rawData) ? rawData : null;
    
    if (!items) {
        if (typeof rawData === 'object' && Array.isArray(rawData.data)) {
            items = rawData.data;
        } else {
            return [];
        }
    }

    if (!Array.isArray(items) || items.length === 0) {
        return [];
    }

    const validItems = [];
    let skipped = 0;

    for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];

        try {
            // === VALIDATION: SESSION ID ===
            let sessionId = String(item[mapping.session] || item.SessionId || '').trim();
            if (!sessionId) {
                skipped++;
                continue;
            }

            // === VALIDATION: DICE VALUES ===
            const dice1 = parseInt(item[mapping.dice1] || item.FirstDice || 0, 10);
            const dice2 = parseInt(item[mapping.dice2] || item.SecondDice || 0, 10);
            const dice3 = parseInt(item[mapping.dice3] || item.ThirdDice || 0, 10);

            if (!isValidDice(dice1) || !isValidDice(dice2) || !isValidDice(dice3)) {
                skipped++;
                continue;
            }

            // === VALIDATION: SUM ===
            let diceSum = parseInt(item[mapping.sum] || item.DiceSum || 0, 10);
            if (!isValidSum(diceSum)) {
                diceSum = dice1 + dice2 + dice3;
                if (!isValidSum(diceSum)) {
                    skipped++;
                    continue;
                }
            }

            // === DETERMINE KET QUA ===
            const betSideRaw = item[mapping.bet];
            const ketQua = determineKetQua(betSideRaw, dice1, dice2, dice3);

            // === PARSE SERVER TIME ===
            const serverTime = parseDateSafely(item[mapping.time] || item.CreatedDate);

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

        } catch (error) {
            console.warn(`[tuanx3000] ⚠️ Skip item ${idx}: ${error.message}`);
            skipped++;
        }
    }

    if (skipped > 0) {
        console.log(`[tuanx3000] ℹ️ Converted ${validItems.length} items (skipped ${skipped})`);
    }

    return validItems;
}

// ==================== FIX #3: DEDUPLICATION OPTIMIZATION ====================
function deduplicateByPhienAndSource(items) {
    const seen = new Map();
    const result = [];

    for (const item of items) {
        const key = `${item.Phien}#${item.nguon}`;
        
        // Nếu đã có, so sánh server_time để giữ lại record mới hơn
        if (seen.has(key)) {
            const existing = seen.get(key);
            if (new Date(item.server_time) > new Date(existing.server_time)) {
                // Replace với item mới
                const idx = result.indexOf(existing);
                if (idx !== -1) result[idx] = item;
                seen.set(key, item);
            }
        } else {
            result.push(item);
            seen.set(key, item);
        }
    }

    return result;
}

// ==================== FIX #4: REFRESH SINGLE SOURCE ====================
async function refreshSource(sourceKey) {
    const source = SOURCES[sourceKey];
    if (!source) {
        console.error(`[tuanx3000] ❌ Unknown source: ${sourceKey}`);
        return;
    }

    const store = dataStore[sourceKey];

    try {
        const raw = await fetchWithRetry(source.url);
        
        if (!raw) {
            store.errorCount++;
            console.warn(`[tuanx3000] ⚠️ ${sourceKey} returned null (error count: ${store.errorCount})`);
            return;
        }

        let converted = convertToStandard(raw, sourceKey, source.mapping);
        
        if (converted.length === 0) {
            console.warn(`[tuanx3000] ⚠️ ${sourceKey} converted to empty array`);
            return;
        }

        // === SORT: Mới nhất lên đầu ===
        converted.sort((a, b) => 
            new Date(b.server_time).getTime() - new Date(a.server_time).getTime()
        );

        // === DEDUPLICATE ===
        const unique = deduplicateByPhienAndSource(converted);

        // === TRUNCATE TO LIMIT ===
        store.history = unique.slice(0, HISTORY_LIMIT);
        store.lastUpdate = new Date().toISOString();
        store.errorCount = 0;

        // === UPDATE LATEST ===
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

            console.log(`[tuanx3000] ✅ ${sourceKey}: Updated #${latest.Phien} (${store.history.length} records)`);
        }

    } catch (error) {
        store.errorCount++;
        console.error(`[tuanx3000] ❌ ${sourceKey} critical error: ${error.message}`);
    }
}

// ==================== FIX #5: AGGREGATE HISTORY WITH PROPER DEDUPLICATION ====================
function updateAggregated() {
    const all = [];

    // === Collect từ tất cả sources ===
    for (const key of Object.keys(SOURCES)) {
        all.push(...dataStore[key].history);
    }

    if (all.length === 0) {
        console.warn('[tuanx3000] ⚠️ No data to aggregate');
        return;
    }

    // === DEDUPLICATE ===
    const unique = deduplicateByPhienAndSource(all);

    // === SORT: Mới nhất lên đầu (thứ tự chuẩn cho Frontend) ===
    unique.sort((a, b) => 
        new Date(b.server_time).getTime() - new Date(a.server_time).getTime()
    );

    // === TRUNCATE ===
    aggregatedHistory = unique.slice(0, HISTORY_LIMIT * 2);
    lastAggregationTime = new Date().toISOString();

    // === UPDATE LATEST ===
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

        console.log(`[tuanx3000] 🔄 Aggregated: ${aggregatedHistory.length} records, Latest #${latest.Phien} [${latest.nguon}]`);
    }
}

// ==================== REFRESH ALL SOURCES ====================
async function refreshAll() {
    try {
        const md5Promise = refreshSource('MD5');
        const nohuPromise = refreshSource('NOHU');

        // === Parallel fetch ===
        await Promise.all([md5Promise, nohuPromise]);

        // === Aggregate after both sources ===
        updateAggregated();

    } catch (error) {
        console.error(`[tuanx3000] ❌ refreshAll critical error: ${error.message}`);
    }
}

// ==================== API ROUTES ====================

/**
 * GET /
 * Root endpoint - Status info
 */
app.get('/', (req, res) => {
    res.json({
        brand: BRAND.name,
        version: BRAND.version,
        message: 'Tài Xỉu Data Aggregator by tuanx3000',
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    const md5Store = dataStore.MD5;
    const nohuStore = dataStore.NOHU;

    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        sources: {
            MD5: {
                records: md5Store.history.length,
                latest: md5Store.latest.Phien,
                lastUpdate: md5Store.lastUpdate,
                errors: md5Store.errorCount
            },
            NOHU: {
                records: nohuStore.history.length,
                latest: nohuStore.latest.Phien,
                lastUpdate: nohuStore.lastUpdate,
                errors: nohuStore.errorCount
            }
        },
        aggregated: {
            total: aggregatedHistory.length,
            lastAggregation: lastAggregationTime
        }
    });
});

/**
 * GET /api/latest
 * Get latest record from aggregated data
 */
app.get('/api/latest', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.json(aggregatedLatest);
});

/**
 * GET /api/history
 * Get history with optional limit parameter
 * Query: ?limit=100
 */
app.get('/api/history', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.json({
        brand: BRAND.name,
        version: BRAND.version,
        total: aggregatedHistory.length,
        limit: limit,
        timestamp: new Date().toISOString(),
        data: aggregatedHistory.slice(0, limit)
    });
});

/**
 * GET /api/source/:name
 * Get history for specific source (MD5 or NOHU)
 */
app.get('/api/source/:name', (req, res) => {
    const sourceName = req.params.name.toUpperCase();
    const store = dataStore[sourceName];

    if (!store) {
        return res.status(404).json({ error: `Source ${sourceName} not found` });
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 500);

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.json({
        brand: BRAND.name,
        source: sourceName,
        total: store.history.length,
        limit: limit,
        timestamp: new Date().toISOString(),
        data: store.history.slice(0, limit)
    });
});

// ==================== ERROR HANDLING ====================
app.use((err, req, res, next) => {
    console.error(`[tuanx3000] 🚨 Error:`, err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
        timestamp: new Date().toISOString()
    });
});

// ==================== 404 HANDLER ====================
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        path: req.path,
        timestamp: new Date().toISOString()
    });
});

// ==================== SERVER INITIALIZATION ====================
let isInitialized = false;

const server = app.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n[tuanx3000] ✅ Server started on port ${PORT}`);
    console.log(`[tuanx3000] Version: ${BRAND.version}`);
    console.log(`[tuanx3000] Health: http://localhost:${PORT}/health`);
    console.log(`[tuanx3000] History: http://localhost:${PORT}/api/history?limit=50\n`);

    // === Initial data fetch ===
    try {
        await refreshAll();
        isInitialized = true;
    } catch (error) {
        console.error(`[tuanx3000] ❌ Initial refresh failed: ${error.message}`);
    }

    // === Periodic refresh (every 5 seconds) ===
    const refreshInterval = setInterval(refreshAll, FETCH_INTERVAL);

    // === Graceful shutdown ===
    process.on('SIGTERM', () => {
        console.log('[tuanx3000] ⚠️ SIGTERM received, shutting down gracefully...');
        clearInterval(refreshInterval);
        server.close(() => {
            console.log('[tuanx3000] ✅ Server closed');
            process.exit(0);
        });
    });

    process.on('SIGINT', () => {
        console.log('[tuanx3000] ⚠️ SIGINT received, shutting down gracefully...');
        clearInterval(refreshInterval);
        server.close(() => {
            console.log('[tuanx3000] ✅ Server closed');
            process.exit(0);
        });
    });
});

// ==================== HANDLE UNCAUGHT ERRORS ====================
process.on('uncaughtException', (error) => {
    console.error('[tuanx3000] 🚨 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[tuanx3000] 🚨 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

module.exports = app;
