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
 * 调剂报告生成逻辑（新建，非 yanbot-claw 原有功能）。
 *
 * 场景：考生分数已出 / 未被理想志愿录取，想了解「分数已过线、有较大录取或征集/调剂
 * 机会」的院校专业组合。复用与择校报告相同的 VibeReport 数据结构与 admissions 数据，
 * 但取数区间与档位偏向「正分差」（考生分数高于院校录取线），文案围绕调剂/征集志愿。
 *
 * 档位语义（均以「考生分数 - 院校最低分」= scoreDiff 衡量）：
 *   冲（可冲调剂）：分差较小，需服从专业调剂、关注缺额方可冲一冲
 *   稳（稳妥调剂）：分差适中，录取/调剂把握较大
 *   保（保底调剂）：分差较大，作为兜底，避免滑档
 */
var YEAR = 2025;
var PROVINCE = '河北';
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
    var _a;
    var parts = [];
    var diffStr = diff >= 0 ? "+".concat(diff) : "".concat(diff);
    if (tier === '冲') {
        parts.push("2025\u5E74\u5F55\u53D6\u6700\u4F4E\u5206 ".concat(row.min_score, " \u5206\uFF0C\u5206\u5DEE ").concat(diffStr, "\uFF0C\u5904\u4E8E\u7EBF\u4E0A\u8FB9\u7F18\uFF0C\u5EFA\u8BAE\u52FE\u9009\u300C\u670D\u4ECE\u4E13\u4E1A\u8C03\u5242\u300D\u5E76\u5173\u6CE8\u62DB\u751F\u7F3A\u989D\u4EE5\u63D0\u9AD8\u5F55\u53D6\u6982\u7387"));
    }
    else if (tier === '稳') {
        parts.push("2025\u5E74\u5F55\u53D6\u6700\u4F4E\u5206 ".concat(row.min_score, " \u5206\uFF0C\u60A8\u9AD8 ").concat(diff, " \u5206\uFF0C\u5F55\u53D6\u6216\u8C03\u5242\u628A\u63E1\u8F83\u5927\uFF0C\u53EF\u4F5C\u4E3A\u91CD\u70B9\u8C03\u5242\u76EE\u6807"));
    }
    else {
        parts.push("2025\u5E74\u5F55\u53D6\u6700\u4F4E\u5206 ".concat(row.min_score, " \u5206\uFF0C\u60A8\u9AD8 ").concat(diff, " \u5206\uFF0C\u8C03\u5242\u5F55\u53D6\u6982\u7387\u9AD8\uFF0C\u9002\u5408\u515C\u5E95\u9632\u6ED1\u6863"));
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
        // 调剂关注「分数已过线 / 略低」的院校：min_score 落在 [score-60, score+12]
        'a.min_score BETWEEN ? AND ?',
    ];
    var params = [YEAR, PROVINCE, subjectGroup, score - 60, score + 12];
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
export function generateTiaojiReport(input) {
    var score = input.score, subjectGroup = input.subjectGroup, majorKeywords = input.majorKeywords, regionPrefs = input.regionPrefs;
    var rows = queryRows(input);
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
    var overview = "\u6839\u636E 2025 \u5E74".concat(PROVINCE, "\u7701\u672C\u79D1\u6279").concat(groupLabel, "\u9009\u79D1\u771F\u5B9E\u5F55\u53D6\u6570\u636E\uFF0C\u4E3A\u60A8\u751F\u6210\u8C03\u5242\u62A5\u544A").concat(relaxNote, "\u3002") +
        "\u7ED3\u5408\u60A8\u7684 ".concat(score, " \u5206\uFF08\u610F\u5411\u4E13\u4E1A\uFF1A").concat(majorLabel, "\uFF0C\u5730\u533A\u504F\u597D\uFF1A").concat(regionLabel, "\uFF09\uFF0C") +
        "\u5DF2\u7B5B\u9009\u51FA\u5206\u6570\u5DF2\u8FC7\u7EBF\u3001\u5177\u5907\u5F55\u53D6\u6216\u5F81\u96C6/\u8C03\u5242\u673A\u4F1A\u7684\u9662\u6821\u4E13\u4E1A\u7EC4\u5408\uFF0C" +
        "\u5171\u63A8\u8350 ".concat(recs.length, " \u6240\u9662\u6821\uFF08\u542B\u53EF\u51B2 ").concat(recs.filter(function (r) { return r.tier === '冲'; }).length, " \u6240\u3001") +
        "\u7A33\u59A5 ".concat(recs.filter(function (r) { return r.tier === '稳'; }).length, " \u6240\u3001") +
        "\u4FDD\u5E95 ".concat(recs.filter(function (r) { return r.tier === '保'; }).length, " \u6240\uFF09\u3002\u5EFA\u8BAE\u4F18\u5148\u5173\u6CE8\u7A33\u59A5\u4E0E\u4FDD\u5E95\u6863\uFF0C\u786E\u4FDD\u4E0D\u6ED1\u6863\u3002");
    var tips = [
        "\u8C03\u5242/\u5F81\u96C6\u5FD7\u613F\u5F55\u53D6\u7EBF\u5E38\u4E0E\u9996\u8F6E\u6295\u6863\u7EBF\u63A5\u8FD1\u751A\u81F3\u66F4\u9AD8\uFF0C\u672C\u62A5\u544A\u57FA\u4E8E 2025 \u5E74".concat(PROVINCE, "\u7701\u5F55\u53D6\u6700\u4F4E\u5206\u6D4B\u7B97\uFF0C\u4EC5\u4F9B\u53C2\u8003"),
        "\u586B\u62A5\u65F6\u52A1\u5FC5\u52FE\u9009\u300C\u670D\u4ECE\u4E13\u4E1A\u8C03\u5242\u300D\uFF0C\u53EF\u663E\u8457\u964D\u4F4E\u9000\u6863\u98CE\u9669\uFF1B\u540C\u65F6\u7559\u610F\u5404\u6821\u62DB\u751F\u7F3A\u989D\u516C\u544A\u4E0E\u5F81\u96C6\u5FD7\u613F\u65F6\u95F4\u8282\u70B9",
        "\u4FDD\u5E95\u6863\u5EFA\u8BAE\u81F3\u5C11\u4FDD\u7559 2-3 \u6240\u5206\u5DEE 30 \u5206\u4EE5\u4E0A\u7684\u9662\u6821\uFF0C\u907F\u514D\u56E0\u4E13\u4E1A\u53D7\u9650\u6216\u4F53\u68C0/\u5355\u79D1\u8981\u6C42\u88AB\u9000\u6863",
        "\u82E5\u5BF9\u4E13\u4E1A\u6709\u660E\u786E\u8981\u6C42\uFF0C\u53EF\u9002\u5F53\u4E0B\u6C89\u9662\u6821\u5C42\u6B21\u6362\u53D6\u7406\u60F3\u4E13\u4E1A\uFF1B\u53CD\u4E4B\u53EF\u63A5\u53D7\u8C03\u5242\u4EE5\u6362\u53D6\u66F4\u9AD8\u9662\u6821\u5E73\u53F0",
    ];
    return {
        kind: 'tiaoji',
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
export { TIER_DESC as TIAOJI_TIER_DESC };
