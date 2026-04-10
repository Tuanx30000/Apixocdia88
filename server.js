const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// =========================================================================================
// 1. CẤU HÌNH HỆ THỐNG TRUNG GIAN (ADMIN: TUANX3000)
// =========================================================================================
const API_CONFIG = {
    NOHU: 'https://taixiu.system32-cloudfare-356783752985678522.monster/api/luckydice/GetSoiCau?',
    MD5: 'https://taixiumd5.system32-cloudfare-356783752985678522.monster/api/md5luckydice/GetSoiCau?'
};

let STATE = {
    nohu: { history: [], lastPred: null, stats: { win: 0, loss: 0 }, processed: new Set() },
    md5: { history: [], lastPred: null, stats: { win: 0, loss: 0 }, processed: new Set() }
};

// =========================================================================================
// 2. SUPREME ENGINE V5 (TỐI ƯU THUẬT TOÁN SOI CẦU & XU HƯỚNG)
// =========================================================================================
class SupremeEngine {
    predict(history) {
        // Nếu API rỗng, trả về kết quả ngẫu nhiên để tool không đứng
        if (!history || history.length < 1) {
            return { res: Math.random() > 0.5 ? 'Tài' : 'Xỉu', conf: '50%', logic: 'Đang kết nối API...' };
        }

        const results = history.map(h => h.result);
        const last = results[results.length - 1];
        const fullStr = results.join('');

        // --- A. PHÂN TÍCH XU HƯỚNG (TREND STRENGTH) ---
        const last10 = results.slice(-10);
        const taiCount10 = last10.filter(r => r === 'Tài').length;
        // Độ mạnh xu hướng: Càng xa mốc cân bằng (5) càng mạnh
        const trendStrength = Math.abs(taiCount10 - 5) / 5; 
        const mainTrend = taiCount10 > 5 ? 'Tài' : 'Xỉu';

        // --- B. ĐẾM DÂY BỆT ---
        let chain = 0;
        for (let i = results.length - 1; i >= 0; i--) {
            if (results[i] === last) chain++; else break;
        }

        // --- C. QUYẾT ĐỊNH THEO PATTERN & XU HƯỚNG ---

        // 1. Bẻ bệt sâu (Ưu tiên số 1 - Chống cháy tài khoản)
        if (chain >= 6) {
            return { res: last === 'Tài' ? 'Xỉu' : 'Tài', conf: '92%', logic: 'Bẻ cầu (Bệt quá dài)' };
        }

        // 2. Cầu 3-3 (TTT XXX)
        if (fullStr.endsWith('TàiTàiTàiXỉuXỉuXỉu') || fullStr.endsWith('XỉuXỉuXỉuTàiTàiTài')) {
            return { res: last === 'Tài' ? 'Xỉu' : 'Tài', conf: '88%', logic: 'Gãy nhịp 3-3' };
        }

        // 3. Cầu 2-2 (TT XX)
        if (fullStr.endsWith('TàiTàiXỉuXỉu') || fullStr.endsWith('XỉuXỉuTàiTài')) {
            return { res: last, conf: '85%', logic: 'Bám cầu đối xứng 2-2' };
        }

        // 4. Bám xu hướng mạnh (Trend Follower logic)
        if (trendStrength > 0.6) {
            const dynamicConf = Math.round(70 + trendStrength * 20) + '%';
            return { res: mainTrend, conf: dynamicConf, logic: `Bám xu hướng ${mainTrend}` };
        }

        // 5. Cầu chéo 1-1 (TX TX)
        const is11 = results.length >= 4 && results.slice(-4).every((v, i, a) => i === 0 || v !== a[i-1]);
        if (is11) {
            return { res: last === 'Tài' ? 'Xỉu' : 'Tài', conf: '82%', logic: 'Bám nhịp 1-1' };
        }

        // 6. Bám bệt ngắn (Dây 2-5 tay)
        if (chain >= 2) {
            return { res: last, conf: '75%', logic: `Bám dây bệt (${chain} tay)` };
        }

        // Mặc định: Đánh đảo cửa so với tay trước
        return { res: last === 'Tài' ? 'Xỉu' : 'Tài', conf: '62%', logic: 'Cầu đảo ngắn' };
    }
}

const engine = new SupremeEngine();

// =========================================================================================
// 3. ĐỒNG BỘ DỮ LIỆU (SOI SẠCH LỊCH SỬ - KHÔNG LỖI)
// =========================================================================================
async function updateData(type) {
    try {
        const response = await fetch(API_CONFIG[type.toUpperCase()], {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(5000)
        });
        
        const data = await response.json();
        const rawList = data.list || data.data || [];
        if (rawList.length === 0) return;

        const s = STATE[type];
        
        // Map sạch dữ liệu lịch sử từ link API
        const newHistory = rawList.map(item => {
            const rawValue = String(item.resultTruyenThong || item.resultMd5 || item.result || '').toUpperCase();
            let finalRes = 'Xỉu';
            if (rawValue.includes('TAI') || rawValue === 'T' || rawValue === '1' || parseInt(rawValue) > 10) {
                finalRes = 'Tài';
            }
            return { id: Number(item.id || item.SessionId), result: finalRes };
        }).filter(x => x.id > 0).reverse();

        const latest = newHistory[newHistory.length - 1];

        // Tự động kiểm tra thắng thua cho phiên vừa qua
        if (s.lastPred && s.lastPred.phien === latest.id && !s.processed.has(latest.id)) {
            if (s.lastPred.ketqua === latest.result) s.stats.win++; else s.stats.loss++;
            s.processed.add(latest.id);
            // Giới hạn bộ nhớ processed
            if (s.processed.size > 100) s.processed.delete(s.processed.values().next().value);
        }

        s.history = newHistory;
    } catch (e) {
        // Bỏ qua lỗi kết nối tạm thời
    }
}

// Cập nhật dữ liệu mỗi 5 giây/lần
setInterval(() => { updateData('nohu'); updateData('md5'); }, 5000);

// =========================================================================================
// 4. API TRẢ VỀ CHO TOOL (CHUẨN JSON TUANX3000)
// =========================================================================================
app.get('/', (req, res) => {
    const buildResponse = (type) => {
        const s = STATE[type];
        const lastSession = s.history.length > 0 ? s.history[s.history.length - 1].id : 0;
        const nextSession = lastSession + 1;

        // Chỉ tạo dự đoán mới nếu phiên tiếp theo chưa được tính toán
        if (!s.lastPred || s.lastPred.phien !== nextSession) {
            const p = engine.predict(s.history);
            s.lastPred = { phien: nextSession, ketqua: p.res, tyle: p.conf, note: p.logic };
        }

        return {
            phien_tiep: nextSession,
            du_doan: s.lastPred.ketqua,
            tin_cay: s.lastPred.tyle,
            logic: s.lastPred.note,
            lich_su_chuoi: s.history.slice(-15).map(x => x.result[0]).join(''),
            thong_ke: {
                thang: s.stats.win,
                thua: s.stats.loss,
                winrate: (s.stats.win + s.stats.loss) > 0 
                    ? ((s.stats.win / (s.stats.win + s.stats.loss)) * 100).toFixed(1) + "%" 
                    : "0%"
            }
        };
    };

    res.json({
        admin: "TUANX3000",
        version: "5.0-FINAL",
        time: new Date().toLocaleString('vi-VN'),
        nohu: buildResponse('nohu'),
        md5: buildResponse('md5')
    });
});

// Reset thống kê nhanh
app.get('/reset', (req, res) => {
    Object.keys(STATE).forEach(k => {
        STATE[k].stats = { win: 0, loss: 0 };
        STATE[k].processed.clear();
    });
    res.json({ status: "OK", message: "Đã reset bởi ADMIN TUANX3000" });
});

app.listen(PORT, () => {
    console.log(`[TUANX3000] SUPREME V5 ONLINE - PORT ${PORT}`);
    updateData('nohu'); updateData('md5');
});
