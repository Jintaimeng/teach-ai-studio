var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import { fetchRows, pickTier } from './report-data.js';
/**
 * 调剂报告生成逻辑。
 * 取数已改为参考 recommend 模块：通过 yanbot 开放接口的「调剂」录取分数
 * （adjustedLowestScore）检索接收调剂的考研院校专业，按冲/稳/保分层。
 *
 * 档位语义（均以「考生分数 - 院校调剂最低分」= scoreDiff 衡量）：
 *   冲（可冲调剂）：分差较小，处于调剂线边缘，需积极联系院校、关注缺额
 *   稳（稳妥调剂）：分差适中，调剂把握较大
 *   保（保底调剂）：分差较大，作为兜底，避免无书可读
 */
var TIER_RANGE = {
    冲: [-8, 8],
    稳: [9, 25],
    保: [26, 55],
};
var TIER_MID = {
    冲: 0,
    稳: 17,
    保: 40,
};
var TIER_DESC = {
    冲: '可冲调剂',
    稳: '稳妥调剂',
    保: '保底调剂',
};
function buildReason(row, diff, tier) {
    var parts = [];
    var diffStr = diff >= 0 ? "+".concat(diff) : "".concat(diff);
    var subjectLabel = row.subjectName ? "\u300C".concat(row.subjectName, "\u300D\u4E13\u4E1A") : '该专业';
    if (tier === '冲') {
        parts.push("".concat(subjectLabel, "\u8C03\u5242\u5F55\u53D6\u6700\u4F4E\u5206 ").concat(row.minScore, " \u5206\uFF0C\u5206\u5DEE ").concat(diffStr, "\uFF0C\u5904\u4E8E\u8C03\u5242\u7EBF\u8FB9\u7F18\uFF0C\u5EFA\u8BAE\u5C3D\u65E9\u8054\u7CFB\u9662\u6821\u5E76\u5173\u6CE8\u7F3A\u989D\u516C\u544A\u4EE5\u63D0\u9AD8\u8C03\u5242\u6210\u529F\u7387"));
    }
    else if (tier === '稳') {
        parts.push("".concat(subjectLabel, "\u8C03\u5242\u5F55\u53D6\u6700\u4F4E\u5206 ").concat(row.minScore, " \u5206\uFF0C\u60A8\u9AD8 ").concat(diff, " \u5206\uFF0C\u8C03\u5242\u628A\u63E1\u8F83\u5927\uFF0C\u53EF\u4F5C\u4E3A\u91CD\u70B9\u76EE\u6807"));
    }
    else {
        parts.push("".concat(subjectLabel, "\u8C03\u5242\u5F55\u53D6\u6700\u4F4E\u5206 ").concat(row.minScore, " \u5206\uFF0C\u60A8\u9AD8 ").concat(diff, " \u5206\uFF0C\u8C03\u5242\u6210\u529F\u6982\u7387\u9AD8\uFF0C\u9002\u5408\u515C\u5E95\u9632\u6B62\u65E0\u4E66\u53EF\u8BFB"));
    }
    if (row.is985)
        parts.push('985 重点院校');
    else if (row.is211)
        parts.push('211 重点院校');
    else if (row.isDualClass)
        parts.push('双一流院校');
    if (row.college)
        parts.push("\u62DB\u751F\u9662\u7CFB\uFF1A".concat(row.college));
    if (row.location)
        parts.push("\u4F4D\u4E8E".concat(row.location));
    return parts.join('；');
}
export function generateTiaojiReport(input) {
    return __awaiter(this, void 0, void 0, function () {
        var score, majorKeywords, regionPrefs, level, rows, relaxed, recs, majorLabel, regionLabel, levelLabel, relaxNote, overview, tips;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    score = input.score, majorKeywords = input.majorKeywords, regionPrefs = input.regionPrefs, level = input.level;
                    return [4 /*yield*/, fetchRows(input, { track: 'adjust', minScore: score - 55, maxScore: score + 8 })];
                case 1:
                    rows = _a.sent();
                    relaxed = false;
                    if (!(rows.length < 9 && (majorKeywords === null || majorKeywords === void 0 ? void 0 : majorKeywords.length))) return [3 /*break*/, 3];
                    relaxed = true;
                    return [4 /*yield*/, fetchRows(__assign(__assign({}, input), { majorKeywords: undefined }), { track: 'adjust', minScore: score - 55, maxScore: score + 8 })];
                case 2:
                    rows = _a.sent();
                    _a.label = 3;
                case 3:
                    recs = __spreadArray(__spreadArray(__spreadArray([], pickTier(rows, score, '冲', 2, TIER_RANGE['冲'], TIER_MID['冲'], buildReason), true), pickTier(rows, score, '稳', 3, TIER_RANGE['稳'], TIER_MID['稳'], buildReason), true), pickTier(rows, score, '保', 2, TIER_RANGE['保'], TIER_MID['保'], buildReason), true);
                    majorLabel = (majorKeywords === null || majorKeywords === void 0 ? void 0 : majorKeywords.length) ? "".concat(majorKeywords.join('、')) : '综合方向';
                    regionLabel = (regionPrefs === null || regionPrefs === void 0 ? void 0 : regionPrefs.length) ? regionPrefs.join('、') : '全国';
                    levelLabel = level || '不限';
                    relaxNote = relaxed ? '（专业方向已适当放宽以保证推荐数量）' : '';
                    overview = "\u6839\u636E yanbot \u8003\u7814\u9662\u6821\u4E13\u4E1A\u5386\u5E74\u8C03\u5242\u5F55\u53D6\u6570\u636E\uFF0C\u4E3A\u60A8\u751F\u6210\u8C03\u5242\u62A5\u544A".concat(relaxNote, "\u3002") +
                        "\u7ED3\u5408\u60A8\u7684\u521D\u8BD5\u603B\u5206 ".concat(score, " \u5206\uFF08\u610F\u5411\u4E13\u4E1A\uFF1A").concat(majorLabel, "\uFF0C\u5730\u533A\u504F\u597D\uFF1A").concat(regionLabel, "\uFF0C\u9662\u6821\u5C42\u6B21\uFF1A").concat(levelLabel, "\uFF09\uFF0C") +
                        "\u5DF2\u7B5B\u9009\u51FA\u5177\u5907\u8C03\u5242\u5F55\u53D6\u673A\u4F1A\u7684\u9662\u6821\u4E13\u4E1A\u7EC4\u5408\uFF0C" +
                        "\u5171\u63A8\u8350 ".concat(recs.length, " \u6240\u9662\u6821\uFF08\u542B\u53EF\u51B2 ").concat(recs.filter(function (r) { return r.tier === '冲'; }).length, " \u6240\u3001") +
                        "\u7A33\u59A5 ".concat(recs.filter(function (r) { return r.tier === '稳'; }).length, " \u6240\u3001") +
                        "\u4FDD\u5E95 ".concat(recs.filter(function (r) { return r.tier === '保'; }).length, " \u6240\uFF09\u3002\u5EFA\u8BAE\u4F18\u5148\u5173\u6CE8\u7A33\u59A5\u4E0E\u4FDD\u5E95\u6863\uFF0C\u786E\u4FDD\u6709\u4E66\u53EF\u8BFB\u3002");
                    tips = [
                        "\u8C03\u5242\u5F55\u53D6\u7EBF\u5E38\u4E0E\u4E00\u5FD7\u613F\u590D\u8BD5\u7EBF\u63A5\u8FD1\u751A\u81F3\u66F4\u9AD8\uFF0C\u672C\u62A5\u544A\u57FA\u4E8E\u5386\u5E74\u8C03\u5242\u5F55\u53D6\u6700\u4F4E\u5206\u6D4B\u7B97\uFF0C\u4EC5\u4F9B\u53C2\u8003",
                        "\u8C03\u5242\u8BB2\u7A76\u300C\u5FEB\u3001\u51C6\u3001\u5E7F\u300D\uFF1A\u5F00\u653E\u8C03\u5242\u7CFB\u7EDF\u540E\u7B2C\u4E00\u65F6\u95F4\u586B\u62A5\uFF0C\u591A\u8054\u7CFB\u5BFC\u5E08\u4E0E\u7814\u62DB\u529E\uFF0C\u5173\u6CE8\u5404\u6821\u7F3A\u989D\u516C\u544A\u4E0E\u5F00\u653E\u65F6\u95F4\u8282\u70B9",
                        "\u4FDD\u5E95\u6863\u5EFA\u8BAE\u81F3\u5C11\u4FDD\u7559 2-3 \u6240\u5206\u5DEE 26 \u5206\u4EE5\u4E0A\u7684\u9662\u6821\uFF0C\u907F\u514D\u56E0\u590D\u8BD5\u540D\u989D\u5DF2\u6EE1\u6216\u5355\u79D1\u7EBF\u4E0D\u8FBE\u6807\u800C\u9519\u5931\u673A\u4F1A",
                        "\u82E5\u5BF9\u4E13\u4E1A\u6709\u660E\u786E\u8981\u6C42\uFF0C\u53EF\u9002\u5F53\u4E0B\u6C89\u9662\u6821\u5C42\u6B21\u6362\u53D6\u7406\u60F3\u4E13\u4E1A\u65B9\u5411\uFF1B\u53CD\u4E4B\u53EF\u63A5\u53D7\u8C03\u5242\u6362\u53D6\u66F4\u9AD8\u9662\u6821\u5E73\u53F0",
                    ];
                    return [2 /*return*/, {
                            kind: 'tiaoji',
                            candidate: {
                                score: score,
                                major: majorLabel,
                                region: regionLabel,
                                level: levelLabel,
                            },
                            overview: overview,
                            recs: recs,
                            tips: tips,
                        }];
            }
        });
    });
}
export { TIER_DESC as TIAOJI_TIER_DESC };
