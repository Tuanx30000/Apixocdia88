const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// =========================================================================================
// 1. CẤU HÌNH API & TRẠNG THÁI (TUANX3000 CONFIG - V4)
// =========================================================================================
const API_CONFIG = {
    NOHU: 'https://taixiu.maksh3979madfw.com/api/luckydice/GetSoiCau?access_token=05%2F7JlwSPGzFBT3sGaKY2ZcLjROdAOOPB3UwDAmuWFKyfHGWuuM%2BC2zy%2FjjnuznAdeJ1hnJUb8IJnvmUDf44qzL49F2ysXpxi9Qj3ZQZ6ahSqlIQmeUS94Mz3ywCtmnj6ssOz4%2BcY90Z%2FFIaUyLA7aw%2FSOcfQ5jEh4AWpcuvdekhs8XvL9mZS4qPwgCPexrDRWK4gHWx7n2akAHlUFDedm6o6uPDpIEA7z1BXADeLKqizH6WVpDMuD3pEFwdC0zHP2jJtVEQgvGeDGXWLSeSr%2F00etslH1TXwCrs%2BrD4Dj%2B3OmJ3VlTStd%2BirPOtXfmDIBLEr2fUlNRwt%2BRKzRuxt3piAyOlfP1UjrYRX7ekIiTrO%2BYBr3m%2FKDgomuTf2vrP6KqCW%2F2hEdU%3D.14abebf71302f5cce8f3d94ed438ba5c1d31a484d0319b3172db76015a64b4d7',
    MD5: 'https://taixiumd5.maksh3979madfw.com/api/md5luckydice/GetSoiCau?access_token=05%2F7JlwSPGzFBT3sGaKY2ZcLjROdAOOPB3UwDAmuWFKyfHGWuuM%2BC2zy%2FjjnuznAdeJ1hnJUb8IJnvmUDf44qzL49F2ysXpxi9Qj3ZQZ6ahSqlIQmeUS94Mz3ywCtmnj6ssOz4%2BcY90Z%2FFIaUyLA7aw%2FSOcfQ5jEh4AWpcuvdekhs8XvL9mZS4qPwgCPexrDRWK4gHWx7n2akAHlUFDedm6o6uPDpIEA7z1BXADeLKqizH6WVpDMuD3pEFwdC0zHP2jJtVEQgvGeDGXWLSeSr%2F00etslH1TXwCrs%2BrD4Dj%2B3OmJ3VlTStd%2BirPOtXfmDIBLEr2fUlNRwt%2BRKzRuxt3piAyOlfP1UjrYRX7ekIiTrO%2BYBr3m%2FKDgomuTf2vrP6KqCW%2F2hEdU%3D.14abebf71302f5cce8f3d94ed438ba5c1d31a484d0319b3172db76015a64b4d7'
};

let APP_STATE = {
    nohu: { history: [], lastPred: null, stats: { win: 0, loss: 0, total: 0 }, processed: new Set() },
    md5:  { history: [], lastPred: null, stats: { win: 0, loss: 0, total: 0 }, processed: new Set() }
};

// =========================================================================================
// 2. ENGINE THUẬT TOÁN PRO (GIỮ NGUYÊN NHƯ V3 - V4)
// =========================================================================================
class SmartPredictor {
    predict(history) {
        if (!history || history.length === 0) {
            return { 
                ketqua: Math.random() > 0.5 ? 'Tài' : 'Xỉu', 
                confidence: '50%', 
                logic: 'Đang đợi dữ liệu API...' 
            };
        }

        const results = history.map(h => h.result);
        const last = results[results.length - 1];

        // Đếm dây bệt
        let chain = 0;
        for (let i = results.length - 1; i >= 0; i--) {
            if (results[i] === last) chain++;
            else break;
        }

        // 1. Bệt quá dài → bẻ cầu
        if (chain >= 6) {
            return { ketqua: last === 'Tài' ? 'Xỉu' : 'Tài', confidence: '85%', logic: 'Bẻ cầu (Hết biên)' };
        }
        // 2. Đang bệt → bám bệt
        if (chain >= 2) {
            return { ketqua: last, confidence: '75%', logic: `Bám bệt (${chain} tay)` };
        }
        // 3. Cầu 1-1 (ZigZag)
        if (results.length >= 2 && results[results.length - 1] !== results[results.length - 2]) {
            return { ketqua: last === 'Tài' ? 'Xỉu' : 'Tài', confidence: '80%', logic: 'Bám cầu 1-1' };
        }

        // Mặc định đảo
        return { ketqua: last === 'Tài' ? 'Xỉu' : 'Tài', confidence: '60%', logic: 'Cầu đảo' };
    }
}

const predictor = new SmartPredictor();

// =========================================================================================
// 3. ĐỒNG BỘ DỮ LIỆU (Cải tiến V4)
// =========================================================================================
async function syncGameData(type) {
    try {
        const url = API_CONFIG[type.toUpperCase()];

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.31 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.31',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const rawList = data.list || data.data || data.results || data || [];

        if (rawList.length === 0) {
            console.log(`[TUANX3000-V4] ${type} → Không có dữ liệu mới`);
            return;
        }

        const state = APP_STATE[type];

        const newHistory = rawList.map(item => {
            let resRaw = String(
                item.resultTruyenThong || 
                item.resultMd5 || 
                item.result || 
                item.Result || 
                ''
            ).toUpperCase();

            let finalRes = 'Xỉu';
            if (resRaw.includes('TAI') || resRaw.includes('TÀI') || resRaw === 'T' || resRaw === '1' || parseInt(resRaw) > 10) {
                finalRes = 'Tài';
            }

            return {
                session: Number(item.id || item.SessionId || item.id_phien || item.session || 0),
                result: finalRes
            };
        }).filter(h => h.session > 0).reverse();

        if (newHistory.length === 0) return;

        const latest = newHistory[newHistory.length - 1];

        // Tự động tính thắng/thua
        if (state.lastPred && state.lastPred.phien === latest.session && !state.processed.has(latest.session)) {
            state.stats.total++;
            if (state.lastPred.ketqua === latest.result) state.stats.win++;
            else state.stats.loss++;
            state.processed.add(latest.session);
            if (state.processed.size > 100) state.processed.delete(state.processed.values().next().value);
        }

        state.history = newHistory;
        console.log(`[TUANX3000-V4] ${type} → Đồng bộ thành công ${newHistory.length} phiên`);

    } catch (e) {
        console.log(`[TUANX3000-V4-ERROR] ${type}:`, e.message);
    }
}

// Sync mỗi 5 giây
setInterval(() => {
    syncGameData('nohu');
    syncGameData('md5');
}, 5000);

// =========================================================================================
// 4. API OUTPUT (ĐÃ FIX JSON ERROR)
// =========================================================================================
app.get('/', (req, res) => {
    try {
        const build = (type) => {
            const s = APP_STATE[type];
            const lastSession = s.history.length > 0 ? s.history[s.history.length - 1].session : 0;
            const nextId = lastSession + 1;

            if (!s.lastPred || s.lastPred.phien !== nextId) {
                const p = predictor.predict(s.history);
                s.lastPred = { 
                    phien: nextId, 
                    ketqua: p.ketqua, 
                    confidence: p.confidence, 
                    logic: p.logic 
                };
            }

            return {
                phien_tiep: nextId,
                du_doan: s.lastPred.ketqua,
                tin_cay: s.lastPred.confidence,
                logic: s.lastPred.logic,
                lich_su_gan_nhat: s.history.slice(-12).map(h => h.result).join(' - '),
                thong_ke: {
                    thang: s.stats.win,
                    thua: s.stats.loss,
                    winrate: s.stats.total > 0 ? ((s.stats.win / s.stats.total) * 100).toFixed(1) + "%" : "0%"
                }
            };
        };

        res.json({
            system: "TX-PREDICTOR-V4-FINAL",
            admin: "TUANX3000",
            update_at: new Date().toLocaleString('vi-VN'),
            nohu: build('nohu'),
            md5: build('md5')
        });
    } catch (err) {
        console.error('[TUANX3000-V4] Error:', err);
        res.status(500).json({ error: "Server error", message: err.message });
    }
});

app.get('/reset', (req, res) => {
    Object.keys(APP_STATE).forEach(k => {
        APP_STATE[k].stats = { win: 0, loss: 0, total: 0 };
        APP_STATE[k].processed.clear();
    });
    res.json({ message: "Đã reset thống kê - V4" });
});

app.listen(PORT, () => {
    console.log(`🚀 ADMIN TUANX3000: TX-PREDICTOR-V4 ONLINE PORT ${PORT}`);
    syncGameData('nohu');
    syncGameData('md5');
});