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
 * 择校报告生成逻辑。
 * 取数已改为参考 recommend 模块：通过 yanbot 开放接口的「一志愿」录取分数
 * （lowestScore）检索考研院校专业，按冲/稳/保分层。纯数据驱动，无 LLM。
 */
var TIER_RANGE = {
    冲: [-30, -8],
    稳: [-7, 8],
    保: [9, 40],
};
var TIER_MID = {
    冲: -18,
    稳: 0,
    保: 22,
};
function buildReason(row, diff, tier) {
    var parts = [];
    var diffStr = diff >= 0 ? "+".concat(diff) : "".concat(diff);
    var subjectLabel = row.subjectName ? "\u300C".concat(row.subjectName, "\u300D\u4E13\u4E1A") : '该专业';
    if (tier === '冲') {
        parts.push("".concat(subjectLabel, "\u4E00\u5FD7\u613F\u5F55\u53D6\u6700\u4F4E\u5206 ").concat(row.minScore, " \u5206\uFF0C\u60A8\u4F4E ").concat(Math.abs(diff), " \u5206\uFF0C\u5C5E\u4E8E\u51B2\u523A\u76EE\u6807\uFF0C\u9700\u8BA4\u771F\u5907\u8003\u5E76\u51C6\u5907\u8C03\u5242\u9884\u6848"));
    }
    else if (tier === '稳') {
        parts.push("".concat(subjectLabel, "\u4E00\u5FD7\u613F\u5F55\u53D6\u6700\u4F4E\u5206 ").concat(row.minScore, " \u5206\uFF08\u5206\u5DEE ").concat(diffStr, "\uFF09\uFF0C\u5206\u6570\u5951\u5408\u5EA6\u9AD8\uFF0C\u4E0A\u5CB8\u628A\u63E1\u8F83\u5927"));
    }
    else {
        parts.push("".concat(subjectLabel, "\u4E00\u5FD7\u613F\u5F55\u53D6\u6700\u4F4E\u5206 ").concat(row.minScore, " \u5206\uFF0C\u60A8\u9AD8 ").concat(diff, " \u5206\uFF0C\u53EF\u4F5C\u4E3A\u7A33\u59A5\u4FDD\u5E95\u9009\u62E9"));
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
export function generateVibeReport(input) {
    return __awaiter(this, void 0, void 0, function () {
        var score, majorKeywords, regionPrefs, level, rows, relaxed, recs, majorLabel, regionLabel, levelLabel, relaxNote, overview, tips;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    score = input.score, majorKeywords = input.majorKeywords, regionPrefs = input.regionPrefs, level = input.level;
                    return [4 /*yield*/, fetchRows(input, { track: 'first', minScore: score - 40, maxScore: score + 30 })];
                case 1:
                    rows = _a.sent();
                    relaxed = false;
                    if (!(rows.length < 9 && (majorKeywords === null || majorKeywords === void 0 ? void 0 : majorKeywords.length))) return [3 /*break*/, 3];
                    relaxed = true;
                    return [4 /*yield*/, fetchRows(__assign(__assign({}, input), { majorKeywords: undefined }), { track: 'first', minScore: score - 40, maxScore: score + 30 })];
                case 2:
                    rows = _a.sent();
                    _a.label = 3;
                case 3:
                    recs = __spreadArray(__spreadArray(__spreadArray([], pickTier(rows, score, '冲', 2, TIER_RANGE['冲'], TIER_MID['冲'], buildReason), true), pickTier(rows, score, '稳', 3, TIER_RANGE['稳'], TIER_MID['稳'], buildReason), true), pickTier(rows, score, '保', 2, TIER_RANGE['保'], TIER_MID['保'], buildReason), true);
                    majorLabel = (majorKeywords === null || majorKeywords === void 0 ? void 0 : majorKeywords.length) ? "".concat(majorKeywords.join('、')) : '综合方向';
                    regionLabel = (regionPrefs === null || regionPrefs === void 0 ? void 0 : regionPrefs.length) ? regionPrefs.join('、') : '全国';
                    levelLabel = level || '不限';
                    relaxNote = relaxed ? '（专业方向已适当放宽以保证推荐数量）' : '';
                    overview = "\u6839\u636E yanbot \u8003\u7814\u9662\u6821\u4E13\u4E1A\u5386\u5E74\u5F55\u53D6\u6570\u636E\uFF0C\u4E3A\u60A8\u751F\u6210\u62E9\u6821\u62A5\u544A".concat(relaxNote, "\u3002") +
                        "\u7ED3\u5408\u60A8\u7684\u521D\u8BD5\u603B\u5206 ".concat(score, " \u5206\uFF08\u610F\u5411\u4E13\u4E1A\uFF1A").concat(majorLabel, "\uFF0C\u5730\u533A\u504F\u597D\uFF1A").concat(regionLabel, "\uFF0C\u9662\u6821\u5C42\u6B21\uFF1A").concat(levelLabel, "\uFF09\uFF0C") +
                        "\u5171\u63A8\u8350 ".concat(recs.length, " \u6240\u9662\u6821\uFF08\u542B\u51B2 ").concat(recs.filter(function (r) { return r.tier === '冲'; }).length, " \u6240\u3001") +
                        "\u7A33 ".concat(recs.filter(function (r) { return r.tier === '稳'; }).length, " \u6240\u3001") +
                        "\u4FDD ".concat(recs.filter(function (r) { return r.tier === '保'; }).length, " \u6240\uFF09\uFF0C\u5206\u6570\u5747\u6765\u81EA\u771F\u5B9E\u4E00\u5FD7\u613F\u5F55\u53D6\u6570\u636E\u3002");
                    tips = [
                        "\u672C\u62A5\u544A\u57FA\u4E8E\u5386\u5E74\u4E00\u5FD7\u613F\u5F55\u53D6\u6700\u4F4E\u5206\uFF0C\u4EC5\u4F9B\u53C2\u8003\u3002\u5404\u9662\u6821\u590D\u8BD5\u7EBF\u4E0E\u5F55\u53D6\u7EBF\u6BCF\u5E74\u6709\u6D6E\u52A8\uFF0C\u5EFA\u8BAE\u7ED3\u5408\u8FD1\u4E09\u5E74\u8D8B\u52BF\u7EFC\u5408\u5224\u65AD",
                        "\u51B2\u7C7B\u9662\u6821\u7ADE\u4E89\u6FC0\u70C8\uFF0C\u5EFA\u8BAE\u540C\u65F6\u5173\u6CE8\u8C03\u5242\u653F\u7B56\u4E0E\u540C\u5C42\u6B21\u4FDD\u5E95\u9662\u6821\uFF1B\u540C\u4E00\u9662\u6821\u4E0D\u540C\u9662\u7CFB/\u65B9\u5411\u5206\u5DEE\u53EF\u8FBE 20-40 \u5206\uFF0C\u62A5\u8003\u65F6\u6CE8\u610F\u7EC6\u5206\u65B9\u5411\u9009\u62E9",
                        "\u521D\u8BD5\u6210\u7EE9\u4E4B\u5916\uFF0C\u52A1\u5FC5\u91CD\u89C6\u590D\u8BD5\u5360\u6BD4\u4E0E\u5355\u79D1\u7EBF\uFF08\u653F\u6CBB/\u82F1\u8BED/\u4E13\u4E1A\u8BFE\uFF09\u8981\u6C42\uFF0C\u63D0\u524D\u4E86\u89E3\u76EE\u6807\u9662\u6821\u590D\u8BD5\u7EC6\u5219",
                        "\u8DE8\u4E13\u4E1A\u6216\u8DE8\u533A\u57DF\u62A5\u8003\u5EFA\u8BAE\u5C3D\u65E9\u8054\u7CFB\u5BFC\u5E08\u3001\u6536\u96C6\u771F\u9898\u4E0E\u53C2\u8003\u4E66\u76EE\uFF0C\u4FE1\u606F\u5DEE\u5F80\u5F80\u51B3\u5B9A\u4E0A\u5CB8\u6982\u7387",
                    ];
                    return [2 /*return*/, {
                            kind: 'zhaixiao',
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
