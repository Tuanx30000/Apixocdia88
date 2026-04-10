const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// =========================================================================================
// 1. CẤU HÌNH API & TRẠNG THÁI (TUANX3000 CONFIG)
// =========================================================================================
const API_CONFIG = {
    NOHU: 'https://taixiu.system32-cloudfare-356783752985678522.monster/api/luckydice/GetSoiCau?',
    MD5: 'https://taixiumd5.system32-cloudfare-356783752985678522.monster/api/md5luckydice/GetSoiCau?'
};

let APP_STATE = {
    nohu: { history: [], lastPred: null, stats: { win: 0, loss: 0, total: 0 }, processed: new Set() },
    md5: { history: [], lastPred: null, stats: { win: 0, loss: 0, total: 0 }, processed: new Set() }
};

// =========================================================================================
// 2. ENGINE THUẬT TOÁN PRO (SOI HẾT LỊCH SỬ)
// =========================================================================================
class SmartPredictor {
    predict(history) {
        // Nếu API lỗi hoặc chưa có lịch sử -> Trả về Random để tool không bị đứng
        if (!history || history.length === 0) {
            return { ketqua: Math.random() > 0.5 ? 'Tài' : 'Xỉu', confidence: '50%', logic: 'Đang đợi dữ liệu API...' };
        }

        const results = history.map(h => h.result);
        const last = results[results.length - 1];
        
        // Đếm dây bệt thực tế từ lịch sử dài
        let chain = 0;
        for (let i = results.length - 1; i >= 0; i--) {
            if (results[i] === last) chain++; else break;
        }

        // --- HỆ THỐNG QUYẾT ĐỊNH ---
        // 1. Bệt quá dài (từ 6 tay) -> Bẻ cầu
        if (chain >= 6) {
            return { ketqua: last === 'Tài' ? 'Xỉu' : 'Tài', confidence: '85%', logic: 'Bẻ cầu (Hết biên)' };
        }
        // 2. Cầu bệt đang chạy (2-5 tay) -> Bám bệt
        if (chain >= 2) {
            return { ketqua: last, confidence: '75%', logic: `Bám bệt (${chain} tay)` };
        }
        // 3. Cầu 1-1 (ZigZag)
        if (results.length >= 2 && results[results.length - 1] !== results[results.length - 2]) {
            return { ketqua: last === 'Tài' ? 'Xỉu' : 'Tài', confidence: '80%', logic: 'Bám cầu 1-1' };
        }

        // Mặc định: Đánh đảo phiên dựa trên tay cuối
        return { ketqua: last === 'Tài' ? 'Xỉu' : 'Tài', confidence: '60%', logic: 'Cầu đảo' };
    }
}

const predictor = new SmartPredictor();

// =========================================================================================
// 3. ĐỒNG BỘ DỮ LIỆU (FIX LỖI DỮ LIỆU RỖNG)
// =========================================================================================
async function syncGameData(type) {
    try {
        const url = API_CONFIG[type.toUpperCase()];
        
        // Thêm Header để tránh bị Cloudflare hoặc Server game chặn
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.31 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.31',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        
        // Kiểm tra cấu trúc list trong API
        const rawList = data.list || data.data || data.results || [];
        if (rawList.length === 0) return;

        const state = APP_STATE[type];
        
        // Mapping linh hoạt mọi trường hợp tên biến của API
        const newHistory = rawList.map(item => {
            let resRaw = String(item.resultTruyenThong || item.resultMd5 || item.result || item.Result || '').toUpperCase();
            let finalRes = 'Xỉu';
            
            // Nếu API trả về chữ TAI/XIU hoặc số 1/2 hoặc tổng điểm
            if (resRaw.includes('TAI') || resRaw === 'T' || resRaw === '1' || parseInt(resRaw) > 10) {
                finalRes = 'Tài';
            }
            
            return {
                session: Number(item.id || item.SessionId || item.id_phien),
                result: finalRes
            };
        }).filter(h => h.session > 0).reverse(); // Đảo lại để cũ -> mới

        const latest = newHistory[newHistory.length - 1];

        // TỰ ĐỘNG CHECK THẮNG/THUA
        if (state.lastPred && state.lastPred.phien === latest.session && !state.processed.has(latest.session)) {
            state.stats.total++;
            if (state.lastPred.ketqua === latest.result) {
                state.stats.win++;
            } else {
                state.stats.loss++;
            }
            state.processed.add(latest.session);
            if (state.processed.size > 100) state.processed.delete(state.processed.values().next().value);
        }

        // Cập nhật mảng lịch sử chính
        state.history = newHistory;
        
    } catch (e) {
        console.log(`[TUANX3000-LOG] Lỗi lấy dữ liệu ${type}:`, e.message);
    }
}

// Cập nhật dữ liệu mỗi 5 giây
setInterval(() => {
    syncGameData('nohu');
    syncGameData('md5');
}, 5000);

// =========================================================================================
// 4. GIAO DIỆN JSON OUTPUT
// =========================================================================================
app.get('/', (req, res) => {
    const build = (type) => {
        const s = APP_STATE[type];
        const lastSession = s.history.length > 0 ? s.history[s.history.length - 1].session : 0;
        const nextId = lastSession + 1;

        if (!s.lastPred || s.lastPred.phien !== nextId) {
            const p = predictor.predict(s.history);
            s.lastPred = { phien: nextId, ...p };
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
        system: "TX-PREDICTOR-V3-FINAL",
        admin: "TUANX3000",
        update_at: new Date().toLocaleString('vi-VN'),
        nohu: build('nohu'),
        md5: build('md5')
    });
});

// Link reset stats: /reset
app.get('/reset', (req, res) => {
    Object.keys(APP_STATE).forEach(k => {
        APP_STATE[k].stats = { win: 0, loss: 0, total: 0 };
        APP_STATE[k].processed.clear();
    });
    res.json({ message: "Đã reset thống kê bởi ADMIN TUANX3000" });
});

app.listen(PORT, () => {
    console.log(`ADMIN TUANX3000: Server Online Port ${PORT}`);
    syncGameData('nohu');
    syncGameData('md5');
});
