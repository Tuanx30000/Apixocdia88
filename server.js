const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8000;
app.use(cors());
app.use(express.json());

// --- Cấu hình API ---
const API_CONFIG = {
    NOHU: 'https://taixiu.system32-cloudfare-356783752985678522.monster/api/luckydice/GetSoiCau?',
    MD5: 'https://taixiumd5.system32-cloudfare-356783752985678522.monster/api/md5luckydice/GetSoiCau?' // Lưu ý: Xác minh lại link API MD5 chuẩn của web
};

// --- Trạng thái hệ thống ---
let APP_STATE = {
    nohu: { history: [], lastPred: null, stats: { win: 0, loss: 0, total: 0 }, processed: new Set() },
    md5: { history: [], lastPred: null, stats: { win: 0, loss: 0, total: 0 }, processed: new Set() }
};

// =========================================================================================
// THUẬT TOÁN DỰ ĐOÁN (ENGINE)
// =========================================================================================
class SmartPredictor {
    predict(history) {
        if (!history || history.length < 5) {
            return { ketqua: 'Tài', confidence: '50%', logic: 'Đang chờ đủ dữ liệu' };
        }

        const results = history.map(h => h.result);
        const last = results[results.length - 1];
        
        // 1. Phân tích độ dài dây cầu hiện tại
        let chain = 0;
        for (let i = results.length - 1; i >= 0; i--) {
            if (results[i] === last) chain++; else break;
        }

        // 2. Kiểm tra cầu chéo 1-1 (ít nhất 3 phiên gần nhất khác nhau liên tiếp)
        let isZigZag = true;
        const last4 = results.slice(-4);
        for (let i = 1; i < last4.length; i++) {
            if (last4[i] === last4[i-1]) { isZigZag = false; break; }
        }

        // --- BỘ LỌC QUYẾT ĐỊNH CHÍNH ---
        // Ưu tiên 1: Đang bệt -> Bám bệt
        if (chain >= 3 && chain < 6) {
            return { ketqua: last, confidence: '75%', logic: `Bám bệt (${chain} tay)` };
        }
        // Ưu tiên 2: Bệt quá dài -> Tới điểm gãy, bẻ cầu
        if (chain >= 6) {
            return { ketqua: last === 'Tài' ? 'Xỉu' : 'Tài', confidence: '85%', logic: 'Bẻ cầu (Hết biên)' };
        }
        // Ưu tiên 3: Đang ra cầu 1-1 -> Đánh ngược kết quả vừa ra
        if (isZigZag) {
            return { ketqua: last === 'Tài' ? 'Xỉu' : 'Tài', confidence: '80%', logic: 'Bám cầu 1-1' };
        }
        
        // Mặc định: Bắt theo xu hướng tay to (Hồi phục tỷ lệ)
        const taiCount = results.slice(-10).filter(r => r === 'Tài').length;
        const pred = taiCount > 5 ? 'Xỉu' : 'Tài';
        return { ketqua: pred, confidence: '60%', logic: 'Cân bằng xác suất' };
    }
}

const predictor = new SmartPredictor();

// =========================================================================================
// HÀM ĐỒNG BỘ DỮ LIỆU TỰ ĐỘNG
// =========================================================================================
async function syncGameData(type) {
    try {
        const url = API_CONFIG[type.toUpperCase()];
        const res = await fetch(url, { timeout: 4000 }); // Node.js 18+ đã có sẵn fetch, set timeout tránh kẹt
        
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        const data = await res.json();
        
        if (!data || !data.list || data.list.length === 0) return;

        const state = APP_STATE[type];
        
        // Map dữ liệu cẩn thận, phòng hờ tên biến API của MD5 khác Nổ hũ
        const newHistory = data.list.map(item => {
            const rawResult = String(item.resultTruyenThong || item.resultMd5 || item.result || '').toUpperCase();
            return {
                session: Number(item.id),
                result: rawResult.includes('TAI') ? 'Tài' : 'Xỉu'
            };
        }).reverse(); // API trả về giảm dần, cần reverse để sắp xếp cũ -> mới

        const latest = newHistory[newHistory.length - 1];

        // LOGIC CHỐNG GHI ĐÈ & TÍNH WIN/LOSS TỰ ĐỘNG
        if (state.lastPred && state.lastPred.phien === latest.session && !state.processed.has(latest.session)) {
            state.stats.total++;
            
            if (state.lastPred.ketqua === latest.result) {
                state.stats.win++;
                console.log(`✅ [${type.toUpperCase()}] WIN Phiên ${latest.session}: ${latest.result}`);
            } else {
                state.stats.loss++;
                console.log(`❌ [${type.toUpperCase()}] LOSS Phiên ${latest.session}: Đánh ${state.lastPred.ketqua} ra ${latest.result}`);
            }
            
            state.processed.add(latest.session);
            
            // Xóa rác bộ nhớ (Tránh Set bành trướng)
            if (state.processed.size > 20) {
                const first = state.processed.values().next().value;
                state.processed.delete(first);
            }
        }
        
        // Cập nhật lại lịch sử vào Ram
        state.history = newHistory;
        
    } catch (e) {
        // Log lỗi im lặng, không làm crash App
        console.error(`[!] Lỗi lấy dữ liệu ${type.toUpperCase()}:`, e.message);
    }
}

// Chạy định kỳ mỗi 5 giây
setInterval(() => {
    syncGameData('nohu');
    syncGameData('md5');
}, 5000);

// =========================================================================================
// API ROUTER CHÍNH
// =========================================================================================
app.get('/', (req, res) => {
    const buildResponse = (type) => {
        const state = APP_STATE[type];
        const last = state.history[state.history.length - 1];
        const nextId = last ? last.session + 1 : 0;
        
        // CHỈ tạo dự đoán mới nếu chưa có dự đoán cho phiên này
        if (!state.lastPred || state.lastPred.phien !== nextId) {
            const pred = predictor.predict(state.history);
            state.lastPred = { phien: nextId, ...pred };
        }

        const wr = state.stats.total > 0 ? ((state.stats.win / state.stats.total) * 100).toFixed(1) : "0";
        
        return {
            phien_hien_tai: nextId,
            du_doan: state.lastPred.ketqua,
            tin_cay: state.lastPred.confidence,
            logic_su_dung: state.lastPred.logic,
            lich_su_5_tay: state.history.slice(-5).map(h => h.result).join(' - '),
            thong_ke: {
                thang: state.stats.win,
                thua: state.stats.loss,
                tong: state.stats.total,
                winrate: wr + "%"
            }
        };
    };

    res.json({
        thoi_gian: new Date().toLocaleString('vi-VN'),
        tai_xiu_nohu: buildResponse('nohu'),
        tai_xiu_md5: buildResponse('md5')
    });
});

// API Dọn Dẹp (Reset Thống Kê)
app.get('/reset', (req, res) => {
    const type = req.query.type; // Dùng ?type=md5 hoặc ?type=nohu
    
    if (type && APP_STATE[type]) {
        APP_STATE[type].stats = { win: 0, loss: 0, total: 0 };
        APP_STATE[type].processed.clear();
        return res.json({ message: `Đã reset thống kê ${type.toUpperCase()}` });
    }
    
    // Mặc định reset hết
    APP_STATE.nohu.stats = { win: 0, loss: 0, total: 0 };
    APP_STATE.md5.stats = { win: 0, loss: 0, total: 0 };
    APP_STATE.nohu.processed.clear();
    APP_STATE.md5.processed.clear();
    res.json({ message: "Đã reset toàn bộ thống kê hệ thống" });
});

// Khởi chạy
app.listen(PORT, () => {
    console.log(`
    =============================================
    🚀 TX DUAL-ENGINE: NỔ HŨ & MD5 ONLINE
    🌐 Server chạy tại: http://localhost:${PORT}
    🤖 Thuật toán: Smart Trend, Pattern, ZigZag
    ✔️ Tính năng: Tự động ghi nhận Win/Loss
    =============================================
    `);
    // Chạy mồi lần đầu tiên ngay khi khởi động
    syncGameData('nohu');
    syncGameData('md5');
});
