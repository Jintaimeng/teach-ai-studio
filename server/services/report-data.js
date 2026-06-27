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
import { querySchoolScore } from '../yanbotClient.js';
function tagsOf(r) {
    var s = r.school;
    var level = (r.level || (s === null || s === void 0 ? void 0 : s.level) || '').toString();
    return {
        is985: Boolean(s === null || s === void 0 ? void 0 : s.is985) || /985/.test(level),
        is211: Boolean(s === null || s === void 0 ? void 0 : s.is211) || /211/.test(level),
        isDualClass: Boolean(s === null || s === void 0 ? void 0 : s.isDual_class) || /双一流/.test(level),
    };
}
/** 调用 yanbot 开放接口并归一化为 RecRow[]。 */
export function fetchRows(input, opts) {
    return __awaiter(this, void 0, void 0, function () {
        var subjectName, provinceName, level, common, pageSize, useAdjusted, data, _a, list, rows, _i, list_1, r, score;
        var _b, _c, _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    subjectName = ((_b = input.majorKeywords) === null || _b === void 0 ? void 0 : _b.length) ? input.majorKeywords[0] : undefined;
                    provinceName = ((_c = input.regionPrefs) === null || _c === void 0 ? void 0 : _c.length) ? input.regionPrefs[0] : undefined;
                    level = input.level && input.level !== '不限' ? input.level : undefined;
                    common = {
                        subjectName: subjectName,
                        provinceName: provinceName,
                        level: level,
                        includeSchool: true,
                    };
                    pageSize = (_d = opts.pageSize) !== null && _d !== void 0 ? _d : 40;
                    useAdjusted = opts.track === 'adjust';
                    if (!useAdjusted) return [3 /*break*/, 2];
                    return [4 /*yield*/, querySchoolScore(__assign(__assign({}, common), { hasAdjustment: true, minAdjustedLowestScore: opts.minScore, maxAdjustedLowestScore: opts.maxScore, sortBy: 'adjustedLowestScore', sortOrder: 'desc', pageSize: pageSize }))];
                case 1:
                    _a = _h.sent();
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, querySchoolScore(__assign(__assign({}, common), { hasFirstChoice: true, minLowestScore: opts.minScore, maxLowestScore: opts.maxScore, sortBy: 'lowestScore', sortOrder: 'desc', pageSize: pageSize }))];
                case 3:
                    _a = _h.sent();
                    _h.label = 4;
                case 4:
                    data = _a;
                    list = data.list || [];
                    rows = [];
                    for (_i = 0, list_1 = list; _i < list_1.length; _i++) {
                        r = list_1[_i];
                        score = useAdjusted ? r.adjustedLowestScore : r.lowestScore;
                        if (typeof score !== 'number')
                            continue;
                        rows.push(__assign({ schoolName: r.schoolName, location: r.provinceName || '', subjectName: r.subjectName, college: r.college, minScore: score, level: r.level || ((_e = r.school) === null || _e === void 0 ? void 0 : _e.level), rank: (_g = (_f = r.school) === null || _f === void 0 ? void 0 : _f.rank) !== null && _g !== void 0 ? _g : 9999 }, tagsOf(r)));
                    }
                    return [2 /*return*/, rows];
            }
        });
    });
}
/** 院校标签徽章。 */
export function buildBadge(row) {
    var tags = [];
    if (row.is985)
        tags.push('985');
    if (row.is211)
        tags.push('211');
    if (row.isDualClass && !row.is985 && !row.is211)
        tags.push('双一流');
    return tags.slice(0, 2).join('/') || '普通院校';
}
/**
 * 在候选行中按档位（冲/稳/保）打分排序并挑选 count 所院校。
 * 与原本地实现一致的权重逻辑：985/211/双一流 加权，越靠近档位中值越优，rank 越靠前越优。
 */
export function pickTier(rows, score, tier, count, range, mid, reasonFn) {
    var lo = range[0], hi = range[1];
    var candidates = rows.filter(function (r) {
        var d = score - r.minScore;
        return d >= lo && d <= hi;
    });
    var scored = candidates.map(function (r) {
        var diff = score - r.minScore;
        var w = 0;
        if (r.is985)
            w += 3;
        else if (r.is211)
            w += 1.5;
        else if (r.isDualClass)
            w += 1;
        w -= Math.abs(diff - mid) * 0.08;
        w -= r.rank * 0.001;
        return { row: r, diff: diff, w: w };
    });
    scored.sort(function (a, b) { return b.w - a.w; });
    var seen = new Set();
    var result = [];
    for (var _i = 0, scored_1 = scored; _i < scored_1.length; _i++) {
        var _a = scored_1[_i], row = _a.row, diff = _a.diff;
        if (result.length >= count)
            break;
        var key = "".concat(row.schoolName, "-").concat(row.subjectName);
        if (seen.has(key))
            continue;
        seen.add(key);
        result.push({
            tier: tier,
            name: row.schoolName,
            location: row.location,
            badge: buildBadge(row),
            minScore: row.minScore,
            scoreDiff: diff,
            reason: reasonFn(row, diff, tier),
        });
    }
    return result;
}
