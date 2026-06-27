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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import { queryAll } from '../yanbot-db.js';
import { buildTags, } from './report-types.js';
/**
 * 择校报告生成逻辑。
 * 移植自 yanbot-claw/lib/services/school-report.ts，取数改为 sql.js 的 queryAll。
 * 纯数据驱动（2025 河北省本科批真实录取数据），无 LLM。
 */
var YEAR = 2025;
var PROVINCE = '河北';
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
    var _a;
    var parts = [];
    var diffStr = diff >= 0 ? "+".concat(diff) : "".concat(diff);
    if (tier === '冲') {
        parts.push("2025\u5E74\u5F55\u53D6\u6700\u4F4E\u5206 ".concat(row.min_score, " \u5206\uFF0C\u60A8\u4F4E ").concat(Math.abs(diff), " \u5206\uFF0C\u5C5E\u4E8E\u51B2\u523A\u5FD7\u613F\uFF0C\u9700\u8BA4\u771F\u5907\u8003\u5E76\u51C6\u5907\u8C03\u5242\u9884\u6848"));
    }
    else if (tier === '稳') {
        parts.push("2025\u5E74\u5F55\u53D6\u6700\u4F4E\u5206 ".concat(row.min_score, " \u5206\uFF08\u5206\u5DEE ").concat(diffStr, "\uFF09\uFF0C\u5206\u6570\u5951\u5408\u5EA6\u9AD8\uFF0C\u5F55\u53D6\u628A\u63E1\u8F83\u5927"));
    }
    else {
        parts.push("2025\u5E74\u5F55\u53D6\u6700\u4F4E\u5206 ".concat(row.min_score, " \u5206\uFF0C\u60A8\u9AD8 ").concat(diff, " \u5206\uFF0C\u53EF\u4F5C\u4E3A\u4FDD\u5E95\u9009\u62E9"));
    }
    if (row.is_985)
        parts.push('985 重点院校');
    else if (row.is_211)
        parts.push('211 重点院校');
    var city = (_a = row.school_city) !== null && _a !== void 0 ? _a : row.province_text;
    if (city)
        parts.push("\u4F4D\u4E8E".concat(city));
    return parts.join('；');
}
function queryRows(input) {
    var score = input.score, subjectGroup = input.subjectGroup, majorKeywords = input.majorKeywords, regionPrefs = input.regionPrefs;
    var conditions = [
        'a.year = ?',
        'a.province = ?',
        'a.subject_group = ?',
        'a.min_score IS NOT NULL',
        'a.min_score BETWEEN ? AND ?',
    ];
    var params = [YEAR, PROVINCE, subjectGroup, score - 30, score + 40];
    if (majorKeywords === null || majorKeywords === void 0 ? void 0 : majorKeywords.length) {
        conditions.push("(".concat(majorKeywords.map(function () { return 'a.major_name LIKE ?'; }).join(' OR '), ")"));
        params.push.apply(params, majorKeywords.map(function (kw) { return "%".concat(kw, "%"); }));
    }
    if (regionPrefs === null || regionPrefs === void 0 ? void 0 : regionPrefs.length) {
        conditions.push("(".concat(regionPrefs.map(function () { return '(a.school_city LIKE ? OR s.province_text LIKE ?)'; }).join(' OR '), ")"));
        for (var _i = 0, regionPrefs_1 = regionPrefs; _i < regionPrefs_1.length; _i++) {
            var r = regionPrefs_1[_i];
            params.push("%".concat(r, "%"), "%".concat(r, "%"));
        }
    }
    var sql = "\n    SELECT\n      a.school_name, a.school_city, a.school_owner, a.major_name, a.min_score,\n      s.is_985, s.is_211, s.province_text, s.rank\n    FROM admissions a\n    LEFT JOIN schools s ON a.school_ref_id = s.school_id\n    WHERE ".concat(conditions.join(' AND '), "\n    ORDER BY s.rank ASC NULLS LAST, a.min_score DESC\n  ");
    return queryAll(sql, params);
}
function pickTier(rows, score, tier, count) {
    var _a, _b;
    var _c = TIER_RANGE[tier], lo = _c[0], hi = _c[1];
    var mid = TIER_MID[tier];
    var candidates = rows.filter(function (r) {
        var d = score - r.min_score;
        return d >= lo && d <= hi;
    });
    var scored = candidates.map(function (r) {
        var _a;
        var diff = score - r.min_score;
        var w = 0;
        if (r.is_985)
            w += 3;
        else if (r.is_211)
            w += 1.5;
        w -= Math.abs(diff - mid) * 0.08;
        w -= ((_a = r.rank) !== null && _a !== void 0 ? _a : 9999) * 0.001;
        return { row: r, diff: diff, w: w };
    });
    scored.sort(function (a, b) { return b.w - a.w; });
    var seen = new Set();
    var result = [];
    for (var _i = 0, scored_1 = scored; _i < scored_1.length; _i++) {
        var _d = scored_1[_i], row = _d.row, diff = _d.diff;
        if (result.length >= count)
            break;
        if (seen.has(row.school_name))
            continue;
        seen.add(row.school_name);
        result.push({
            tier: tier,
            name: row.school_name,
            location: (_b = (_a = row.school_city) !== null && _a !== void 0 ? _a : row.province_text) !== null && _b !== void 0 ? _b : '',
            badge: buildTags(row).slice(0, 2).join('/') || '普通本科',
            minScore: row.min_score,
            scoreDiff: diff,
            reason: buildReason(row, diff, tier),
        });
    }
    return result;
}
export function generateVibeReport(input) {
    var score = input.score, subjectGroup = input.subjectGroup, majorKeywords = input.majorKeywords, regionPrefs = input.regionPrefs;
    var rows = queryRows(input);
    // 结果过少时放宽专业关键词
    var relaxed = [];
    if (rows.length < 9 && (majorKeywords === null || majorKeywords === void 0 ? void 0 : majorKeywords.length)) {
        relaxed = ['majorKeywords'];
        rows = queryRows(__assign(__assign({}, input), { majorKeywords: undefined }));
    }
    var recs = __spreadArray(__spreadArray(__spreadArray([], pickTier(rows, score, '冲', 2), true), pickTier(rows, score, '稳', 3), true), pickTier(rows, score, '保', 2), true);
    var groupLabel = subjectGroup === 'physics' ? '物理' : '历史';
    var majorLabel = (majorKeywords === null || majorKeywords === void 0 ? void 0 : majorKeywords.length) ? "".concat(majorKeywords.join('、')) : '综合方向';
    var regionLabel = (regionPrefs === null || regionPrefs === void 0 ? void 0 : regionPrefs.length) ? regionPrefs.join('、') : '全国';
    var relaxNote = relaxed.length ? '（专业方向已适当放宽以保证推荐数量）' : '';
    var level = score >= 620 ? '顶尖梯队'
        : score >= 570 ? '强势梯队'
            : score >= 530 ? '中上游'
                : score >= 490 ? '中游'
                    : '中下游';
    var overview = "\u6839\u636E 2025 \u5E74".concat(PROVINCE, "\u7701\u672C\u79D1\u6279").concat(groupLabel, "\u9009\u79D1\u771F\u5B9E\u5F55\u53D6\u6570\u636E\uFF0C") +
        "\u4E3A\u60A8\u751F\u6210\u62E9\u6821\u62A5\u544A".concat(relaxNote, "\u3002\u60A8\u7684 ").concat(score, " \u5206\u5728").concat(groupLabel, "\u9009\u79D1\u4E2D\u5904\u4E8E").concat(level, "\u6C34\u5E73\uFF0C") +
        "\u610F\u5411\u4E13\u4E1A\uFF1A".concat(majorLabel, "\uFF0C\u5730\u533A\u504F\u597D\uFF1A").concat(regionLabel, "\u3002") +
        "\u5171\u63A8\u8350 ".concat(recs.length, " \u6240\u9662\u6821\uFF08\u542B\u51B2 ").concat(recs.filter(function (r) { return r.tier === '冲'; }).length, " \u6240\u3001") +
        "\u7A33 ".concat(recs.filter(function (r) { return r.tier === '稳'; }).length, " \u6240\u3001") +
        "\u4FDD ".concat(recs.filter(function (r) { return r.tier === '保'; }).length, " \u6240\uFF09\uFF0C\u5206\u6570\u5747\u6765\u81EA\u771F\u5B9E\u5F55\u53D6\u6570\u636E\u3002");
    var tips = [
        "\u672C\u62A5\u544A\u57FA\u4E8E 2025 \u5E74".concat(PROVINCE, "\u7701\u5F55\u53D6\u6700\u4F4E\u5206\uFF0C\u4EC5\u4F9B\u53C2\u8003\u3002\u9AD8\u8003\u5F55\u53D6\u7EBF\u6BCF\u5E74\u6709\u6D6E\u52A8\uFF0C\u5EFA\u8BAE\u7ED3\u5408\u8FD1\u4E09\u5E74\u8D8B\u52BF\u7EFC\u5408\u5224\u65AD"),
        "\u51B2\u7C7B\u9662\u6821\u98CE\u9669\u8F83\u9AD8\uFF0C\u5EFA\u8BAE\u540C\u65F6\u5173\u6CE8\u8C03\u5242\u653F\u7B56\uFF1B".concat(score >= 570 ? '985 院校' : '211 院校', "\u5185\u90E8\u4E13\u4E1A\u5206\u5DEE\u53EF\u8FBE 20-40 \u5206\uFF0C\u586B\u62A5\u65F6\u6CE8\u610F\u4E13\u4E1A\u9009\u62E9"),
        "\u5E73\u884C\u5FD7\u613F\u4E2D\uFF0C\u76F8\u540C\u5B66\u6821\u4E0D\u540C\u4E13\u4E1A\u53EF\u62C9\u5F00\u68AF\u5EA6\uFF0C\u5EFA\u8BAE\u540C\u4E00\u6240\"\u7A33\"\u7C7B\u9662\u6821\u586B 2-3 \u4E2A\u4E13\u4E1A\u68AF\u5EA6",
        "\u63D0\u524D\u6279\u4E0E\u7279\u6B8A\u7C7B\u578B\u62DB\u751F\uFF08\u5982\u5F3A\u57FA\u8BA1\u5212\u3001\u7EFC\u5408\u8BC4\u4EF7\uFF09\u5355\u72EC\u586B\u62A5\uFF0C\u4E0D\u5F71\u54CD\u666E\u901A\u6279\u6B21\u5FD7\u613F\uFF0C\u6709\u610F\u5411\u7684\u540C\u5B66\u53EF\u63D0\u524D\u4E86\u89E3",
    ];
    return {
        kind: 'zhaixiao',
        candidate: {
            score: score,
            subjectGroup: subjectGroup,
            major: majorLabel,
            region: regionLabel,
        },
        overview: overview,
        recs: recs,
        tips: tips,
    };
}
