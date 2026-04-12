/**
 * =========================================================================================
 * 🚀 TUANX3000 ULTIMATE V10.3 - THE FINAL ENGINE
 * ADMIN: TUANX3000 | VERSION: 10.3 PRO MAX
 * ĐA THUẬT TOÁN + AUTO-SYNC + ANTI-CRASH RAILWAY
 * =========================================================================================
 */

const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// 1. CẤU HÌNH HỆ THỐNG
const CONFIG = {
    ADMIN: "TUANX3000",
    VERSION: "10.3 PRO MAX",
    SYNC_INTERVAL: 3000,
    ENDPOINTS: {
        NOHU: 'https://taixiu.system32-cloudfare-356783752985678522.monster/api/luckydice/GetSoiCau?access_token=05%2F7JlwSPGzCB603fmQJ2LRgxker3LXsB3UwDAmuWFIm9ePS%2F1XXM7wP3wlmMB16LVCmODRrV5DRirUc17U2EualvCdhpBers%2F%2FsHuv0tl1uOrwBqky3hnb%2BawFyyneuXdl42VfMnxKHyDlbmvc1ENnh6n7hndt76S2l6zQCwsJQkC8AUS4Tgx2tTlC9tAlgjY3x5FuhpGm%2FtSfFsBPmTgOa2dPdDXxQkROt9qsBacLqMq%2BFmiGq30OXhQQkPy6LkqBW9huthNBPJNJ4ybTofAdvGhgbhXRFYUsVFk%2FPZwDMGb3PvuyxxH5SUGueiC7hw4FPwdAT7XJT0nqUcu3U1VYtZseioncyfzBeQDKKhS%2BMeioqDzgb7npOC83fb8oor2J52Mwlhrznla4iyx6h1Sjh%2B4jnuTayZ6gPXuPPsB4%3D.af4e87166d6c7da81f362337b2417f15d45a6394b8dfb5df946e585ce0a8fa6c',
        MD5: 'https://taixiumd5.system32-cloudfare-356783752985678522.monster/api/md5luckydice/GetSoiCau?access_token=05%2F7JlwSPGzCB603fmQJ2LRgxker3LXsB3UwDAmuWFIm9ePS%2F1XXM7wP3wlmMB16LVCmODRrV5DRirUc17U2EualvCdhpBercF4lEtCzawXzAQna8Fs2wRabUFeu80mKL8fj8IAGPMsP45pdIIXZysKmRi40b%2FOVLAp4yOpkaXO20ojipFSKTtn7TTM8v9v9Z1sJx%2BjIDZ%2B3lx5JM%2BoUuP%2Fkjgh5xWXtOPx9FkyKPEBY25AdX3CvOcjOZP5wTJcTMKTon1%2FxmfMgV5GWn25w7EtZR2srxv3Rt03dw%2FNg0TT%2FIKw%2F1IPCNY2oi8RygWpHwIFWcHGdeoTeM6kskfrqNSmhapPBCREit0So1HOC6jOiz5IyKVNadwp8EfsxKzBOKE0z0zdavvY6wXrSZhEJeDmQq4dyeUwQNDYOJP%2B%2Fh7o%3D.a83a4fbc291bb9e436363c167eee148fce60c62d3eaebd36413bd63268ab7218'
    }
};

// 2. CƠ SỞ DỮ LIỆU TẠM THỜI
let DATA_STORE = {
    nohu: { history: [], lastPrediction: null, stats: { win: 0, loss: 0, total: 0 }, processedSessions: new Set() },
    md5: { history: [], lastPrediction: null, stats: { win: 0, loss: 0, total: 0 }, processedSessions: new Set() }
};

// 3. CÔNG CỤ CHUẨN HÓA DỮ LIỆU
const Utils = {
    standardize: (item) => {
        let raw = String(item.resultTruyenThong || item.result || item.BetSide || '').toUpperCase();
        if (raw.includes('TAI') || raw.includes('TÀI') || (item.DiceSum && item.DiceSum >= 11)) return 'Tài';
        return 'Xỉu';
    }
};

// 4. HỆ THỐNG PHÂN TÍCH (ALGORITHMS)
const Algos = {
    markovChain: (h) => {
        const last4 = h.map(x => x.result === 'Tài' ? 'T' : 'X').slice(-4).join('');
        const patterns = { 'TTTT': 'X', 'XXXX': 'T', 'TXTX': 'T', 'XTXT': 'X', 'TTXX': 'T', 'XXTT': 'X' };
        return patterns[last4] || null;
    },
    frequency: (h) => {
        const countT = h.slice(-12).filter(x => x.result === 'Tài').length;
        if (countT >= 8) return 'X';
        if (countT <= 4) return 'T';
        return null;
    },
    trendFollow: (h) => {
        const last3 = h.slice(-3);
        if (last3.length < 3) return null;
        if (last3.every(v => v.result === last3[0].result)) return last3[0].result;
        return null;
    }
};

// 5. BỘ NÃO DỰ ĐOÁN TỔNG HỢP
function predictNext(type) {
    const history = DATA_STORE[type].history;
    if (history.length < 10) return { res: 'N/A', conf: '0%', log: 'Đang nạp dữ liệu' };

    const lastResult = history[history.length - 1].result;
    
    // Kiểm tra bệt (Ưu tiên số 1)
    let streak = 0;
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].result === lastResult) streak++; else break;
    }

    if (streak >= 3 && streak <= 5) {
        return { res: lastResult, conf: '88%', log: 'THEO BỆT TAY ' + (streak + 1) };
    }

    // Biểu quyết từ các thuật toán
    let votes = { T: 0, X: 0 };
    const pMarkov = Algos.markovChain(history);
    const pFreq = Algos.frequency(history);
    const pTrend = Algos.trendFollow(history);

    if (pMarkov === 'T') votes.T += 2; else if (pMarkov === 'X') votes.X += 2;
    if (pFreq === 'T') votes.T += 1; else if (pFreq === 'X') votes.X += 1;
    if (pTrend === 'T') votes.T += 1; else if (pTrend === 'X') votes.X += 1;

    if (votes.T > votes.X) return { res: 'Tài', conf: '75%', log: 'AI VOTE TÀI' };
    if (votes.X > votes.T) return { res: 'Xỉu', conf: '75%', log: 'AI VOTE XỈU' };

    return { res: lastResult === 'Tài' ? 'Xỉu' : 'Tài', conf: '60%', log: 'ĐÁNH CẦU ĐẢO' };
}

// 6. LUỒNG ĐỒNG BỘ DỮ LIỆU
async function runSync() {
    for (const key of ['nohu', 'md5']) {
        try {
            const response = await fetch(CONFIG.ENDPOINTS[key.toUpperCase()]);
            const json = await response.json();
            const list = Array.isArray(json) ? json : (json.list || json.data || []);
            const state = DATA_STORE[key];

            const cleanList = list.map(item => ({
                session: Number(item.id || item.SessionId || 0),
                result: Utils.standardize(item)
            })).filter(h => h.session > 0).sort((a, b) => a.session - b.session);

            if (cleanList.length > 0) {
                const latest = cleanList[cleanList.length - 1];
                
                // Đối soát thắng thua
                if (state.lastPrediction && state.lastPrediction.session === latest.session) {
                    if (!state.processedSessions.has(latest.session)) {
                        if (state.lastPrediction.res === latest.result) {
                            state.stats.win++;
                        } else {
                            state.stats.loss++;
                        }
                        state.stats.total++;
                        state.processedSessions.add(latest.session);
                    }
                }
                state.history = cleanList;
            }
        } catch (err) {
            console.log('Error Syncing ' + key);
        }
    }
}

// Khởi tạo vòng lặp
setInterval(runSync, CONFIG.SYNC_INTERVAL);

// 7. API ENDPOINTS
app.get('/api/all', (req, res) => {
    const buildResponse = (type) => {
        const s = DATA_STORE[type];
        const lastSes = s.history.length > 0 ? s.history[s.history.length - 1].session : 0;
        const pred = predictNext(type);
        
        // Ghi nhớ dự đoán cho phiên tiếp theo
        s.lastPrediction = { session: lastSes + 1, res: pred.res };

        return {
            phien_hien_tai: lastSes,
            phien_tiep: lastSes + 1,
            du_doan: pred.res,
            tin_cay: pred.conf,
            phan_tich: pred.log,
            stats: {
                win: s.stats.win,
                loss: s.stats.loss,
                rate: s.stats.total > 0 ? ((s.stats.win / s.stats.total) * 100).toFixed(1) + '%' : '0%'
            },
            history_str: s.history.slice(-12).map(x => x.result[0]).join('-')
        };
    };

    res.json({
        author: CONFIG.ADMIN,
        version: CONFIG.VERSION,
        server_time: new Date().toLocaleString(),
        data: {
            nohu: buildResponse('nohu'),
            md5: buildResponse('md5')
        }
    });
});

// Giao diện người dùng (Dashboard)
app.get('/', (req, res) => {
    res.send(`
        <body style="background:#0a0a0a; color:#00ff00; font-family:monospace; text-align:center; padding-top:50px;">
            <h1 style="color:#00ffcc; text-shadow:0 0 10px #00ffcc;">🚀 TUANX3000 CORE V10.3 ALL-IN-ONE</h1>
            <p>API: <a href="/api/all" style="color:#fff;">/api/all</a></p>
            <div style="display:flex; justify-content:center; gap:20px; flex-wrap:wrap; margin-top:30px;">
                <div style="border:2px solid #00ffcc; padding:20px; width:350px; border-radius:15px; background:#111;">
                    <h2 style="color:#00ffcc;">TÀI XỈU NỔ HŨ</h2>
                    <div id="nohu_ui">Loading...</div>
                </div>
                <div style="border:2px solid #ff00ff; padding:20px; width:350px; border-radius:15px; background:#111;">
                    <h2 style="color:#ff00ff;">TÀI XỈU MD5</h2>
                    <div id="md5_ui">Loading...</div>
                </div>
            </div>
            <script>
                async function fetchFullData() {
                    try {
                        const r = await fetch('/api/all');
                        const d = await r.json();
                        
                        const render = (target, item, color) => {
                            document.getElementById(target).innerHTML = ' \
                                <h1 style="font-size:50px; color:'+color+'; margin:10px 0;">'+item.du_doan+'</h1> \
                                <p>Độ tin cậy: <b>'+item.tin_cay+'</b></p> \
                                <p>Logic: <i>'+item.phan_tich+'</i></p> \
                                <p>Cầu: '+item.history_str+'</p> \
                                <p style="border-top:1px solid #333; padding-top:10px;">Thắng: '+item.stats.win+' | Thua: '+item.stats.loss+' | Tỷ lệ: '+item.stats.rate+'</p> \
                            ';
                        };
                        
                        render('nohu_ui', d.data.nohu, '#00ffcc');
                        render('md5_ui', d.data.md5, '#ff00ff');
                    } catch(e) {}
                }
                setInterval(fetchFullData, 2000);
                fetchFullData();
            </script>
        </body>
    `);
});

// Chạy Server
app.listen(PORT, () => {
    console.log('--- SYSTEM ONLINE ---');
    console.log('Admin: ' + CONFIG.ADMIN);
    console.log('Port: ' + PORT);
    runSync();
});
