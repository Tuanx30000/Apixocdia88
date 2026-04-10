const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// =========================================================================================
// 1. CẤU HÌNH HỆ THỐNG
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
// 2. ENGINE THUẬT TOÁN V2 (KHÔNG ĐỢI PHIÊN)
// =========================================================================================
class SmartPredictor {
    predict(history) {
        // Trường hợp 0: Nếu API lỗi hoặc chưa có dữ liệu lịch sử -> Random khởi đầu
        if (!history || history.length === 0) {
            const seed = Math.random() > 0.5 ? 'Tài' : 'Xỉu';
            return { ketqua: seed, confidence: '50%', logic: 'Khởi tạo (Dữ liệu rỗng)' };
        }

        const results = history.map(h => h.result);
        const last = results[results.length - 1];
        
        // Đếm độ dài dây bệt (Check từ tay cuối trở về trước)
        let chain = 0;
        for (let i = results.length - 1; i >= 0; i--) {
            if (results[i] === last) chain++; else break;
        }

        // --- BỘ LỌC QUYẾT ĐỊNH (ƯU TIÊN THEO THỨ TỰ) ---

        // Ưu tiên 1: Cầu bệt (Từ 2 tay trở lên là bắt đầu bám)
        if (chain >= 2 && chain < 6) {
            return { ketqua: last, confidence: '75%', logic: `Bám bệt (${chain} tay)` };
        }

        // Ưu tiên 2: Bệt quá dài -> Điểm gãy
        if (chain >= 6) {
            return { ketqua: last === 'Tài' ? 'Xỉu' : 'Tài', confidence: '85%', logic: 'Bẻ cầu (Hết biên)' };
        }

        // Ưu tiên 3: Cầu 1-1 (Chỉ cần có từ 2 phiên trở lên để so sánh)
        if (results.length >= 2) {
            const isZigZag = results[results.length - 1] !== results[results.length - 2];
            if (isZigZag) {
                return { ketqua: last === 'Tài' ? 'Xỉu' : 'Tài', confidence: '80%', logic: 'Bám cầu 1-1' };
            }
        }

        // Mặc định: Nếu không rơi vào các thế cầu trên, dự đoán ngược tay vừa ra
        return { 
            ketqua: last === 'Tài' ? 'Xỉu' : 'Tài', 
            confidence: '60%', 
            logic: 'Dự đoán cầu đảo' 
        };
    }
}

const predictor = new SmartPredictor();

// =========================================================================================
// 3. ĐỒNG BỘ DỮ LIỆU & TÍNH TOÁN WINRATE
// =========================================================================================
async function syncGameData(type) {
    try {
        const url = API_CONFIG[type.toUpperCase()];
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        
        if (!res.ok) return;
        const data = await res.json();
        
        if (!data || !data.list || data.list.length === 0) return;

        const state = APP_STATE[type];
        
        // Chuẩn hóa dữ liệu từ API (Mapping cẩn thận các trường)
        const newHistory = data.list.map(item => {
            const raw = String(item.resultTruyenThong || item.resultMd5 || item.result || '').toUpperCase();
            return {
                session: Number(item.id || item.SessionId),
                result: (raw.includes('TAI') || raw === 'T' || raw === '1') ? 'Tài' : 'Xỉu'
            };
        }).reverse(); // API thường trả về phiên mới lên đầu, cần đảo lại để tính toán

        const latest = newHistory[newHistory.length - 1];

        // TỰ ĐỘNG CHECK WIN/LOSS KHI PHIÊN VỪA DỰ ĐOÁN CÓ KẾT QUẢ
        if (state.lastPred && state.lastPred.phien === latest.session && !state.processed.has(latest.session)) {
            state.stats.total++;
            if (state.lastPred.ketqua === latest.result) {
                state.stats.win++;
                console.log(`✅ [${type.toUpperCase()}] WIN Phiên ${latest.session}`);
            } else {
                state.stats.loss++;
                console.log(`❌ [${type.toUpperCase()}] LOSS Phiên ${latest.session}`);
            }
            state.processed.add(latest.session);
            
            // Dọn dẹp bộ nhớ Set sau 100 phiên
            if (state.processed.size > 100) {
                const first = state.processed.values().next().value;
                state.processed.delete(first);
            }
        }

        // Chỉ cập nhật nếu có dữ liệu mới để tránh làm trống RAM
        if (newHistory.length > 0) {
            state.history = newHistory;
        }
        
    } catch (e) {
        console.log(`[!] Lỗi sync ${type}: ${e.message}`);
    }
}

// Chạy check mỗi 5 giây
setInterval(() => {
    syncGameData('nohu');
    syncGameData('md5');
}, 5000);

// =========================================================================================
// 4. API ENDPOINTS
// =========================================================================================

// Endpoint chính lấy dự đoán
app.get('/', (req, res) => {
    const buildResponse = (type) => {
        const state = APP_STATE[type];
        const lastSession = state.history.length > 0 ? state.history[state.history.length - 1].session : 0;
        const nextId = lastSession + 1;

        // Tạo dự đoán mới nếu phiên hiện tại chưa có dự đoán
        if (!state.lastPred || state.lastPred.phien !== nextId) {
            const p = predictor.predict(state.history);
            state.lastPred = { phien: nextId, ...p };
        }

        const wr = state.stats.total > 0 ? ((state.stats.win / state.stats.total) * 100).toFixed(1) : "0";

        return {
            phien_tiep: nextId,
            du_doan: state.lastPred.ketqua,
            tin_cay: state.lastPred.confidence,
            logic: state.lastPred.logic,
            lich_su: state.history.slice(-10).map(h => h.result).join(' - '),
            thong_ke: {
                win: state.stats.win,
                loss: state.stats.loss,
                winrate: wr + "%"
            }
        };
    };

    res.json({
        system: "TX-PREDICTOR-V2",
        author: "AnhTuanMMO",
        time: new Date().toLocaleString('vi-VN'),
        game_nohu: buildResponse('nohu'),
        game_md5: buildResponse('md5')
    });
});

// Endpoint reset thống kê
app.get('/reset', (req, res) => {
    Object.keys(APP_STATE).forEach(k => {
        APP_STATE[k].stats = { win: 0, loss: 0, total: 0 };
        APP_STATE[k].processed.clear();
        APP_STATE[k].lastPred = null;
    });
    res.json({ status: "success", message: "Đã làm mới toàn bộ thống kê" });
});

// Khởi tạo server
app.listen(PORT, () => {
    console.log(`
    =============================================
    🚀 TX DUAL-ENGINE V2: RUNNING
    🌐 Port: ${PORT}
    🤖 Status: Khởi động dữ liệu...
    =============================================
    `);
    syncGameData('nohu');
    syncGameData('md5');
});
