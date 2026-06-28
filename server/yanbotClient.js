var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
import crypto from "node:crypto";
/**
 * yanbot 开放接口客户端
 *
 * 对接 https://yanbot.tech/open/school-score/*（考研院校专业历年录取分数）。
 * 鉴权与 yanbot 后端一致（见 yanbot 项目 src/modules/open-api/middlewares/auth.ts）：
 *   signature = HMAC-SHA256(apiKey + timestamp + nonce, apiSecret)  // 小写 hex
 * 请求头：x-api-key / x-timestamp(ms) / x-nonce(uuid) / x-signature
 *
 * 凭据与基址从环境变量读取：
 *   YANBOT_OPEN_BASE_URL（默认 https://yanbot.tech）
 *   OPEN_API_KEY / OPEN_API_SECRET
 */
var DEFAULT_TIMEOUT_MS = 15000;
var YanbotApiError = /** @class */ (function (_super) {
    __extends(YanbotApiError, _super);
    function YanbotApiError(message, statusCode, code) {
        var _this = _super.call(this, message) || this;
        _this.name = "YanbotApiError";
        _this.statusCode = statusCode;
        _this.code = code;
        return _this;
    }
    return YanbotApiError;
}(Error));
export { YanbotApiError };
export function isYanbotConfigured() {
    return Boolean(process.env.OPEN_API_KEY && process.env.OPEN_API_SECRET);
}
function getConfig() {
    var baseUrl = (process.env.YANBOT_OPEN_BASE_URL || "https://yanbot.tech").replace(/\/+$/, "");
    var apiKey = process.env.OPEN_API_KEY;
    var apiSecret = process.env.OPEN_API_SECRET;
    if (!apiKey || !apiSecret) {
        throw new YanbotApiError("未配置 yanbot 开放接口凭据：请在 .env 设置 OPEN_API_KEY 与 OPEN_API_SECRET", 500);
    }
    return { baseUrl: baseUrl, apiKey: apiKey, apiSecret: apiSecret };
}
function buildSignature(apiKey, timestamp, nonce, apiSecret) {
    var signStr = "".concat(apiKey).concat(timestamp).concat(nonce);
    return crypto.createHmac("sha256", apiSecret).update(signStr).digest("hex");
}
function buildAuthHeaders(apiKey, apiSecret) {
    var timestamp = Date.now().toString();
    var nonce = crypto.randomUUID();
    var signature = buildSignature(apiKey, timestamp, nonce, apiSecret);
    return {
        "x-api-key": apiKey,
        "x-timestamp": timestamp,
        "x-nonce": nonce,
        "x-signature": signature,
    };
}
function get(path, query) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, baseUrl, apiKey, apiSecret, qs, _i, _b, _c, k, v, url, controller, timer, res, err_1, body, _d;
        var _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    _a = getConfig(), baseUrl = _a.baseUrl, apiKey = _a.apiKey, apiSecret = _a.apiSecret;
                    qs = new URLSearchParams();
                    if (query) {
                        for (_i = 0, _b = Object.entries(query); _i < _b.length; _i++) {
                            _c = _b[_i], k = _c[0], v = _c[1];
                            if (v === undefined || v === null || v === "")
                                continue;
                            qs.append(k, String(v));
                        }
                    }
                    url = "".concat(baseUrl).concat(path).concat(qs.toString() ? "?".concat(qs.toString()) : "");
                    controller = new AbortController();
                    timer = setTimeout(function () { return controller.abort(); }, DEFAULT_TIMEOUT_MS);
                    _f.label = 1;
                case 1:
                    _f.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, fetch(url, {
                            method: "GET",
                            headers: buildAuthHeaders(apiKey, apiSecret),
                            signal: controller.signal,
                        })];
                case 2:
                    res = _f.sent();
                    return [3 /*break*/, 4];
                case 3:
                    err_1 = _f.sent();
                    clearTimeout(timer);
                    throw new YanbotApiError("\u8BF7\u6C42 yanbot \u5931\u8D25\uFF1A".concat((err_1 === null || err_1 === void 0 ? void 0 : err_1.message) || err_1), 0);
                case 4:
                    clearTimeout(timer);
                    _f.label = 5;
                case 5:
                    _f.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, res.json()];
                case 6:
                    body = (_f.sent());
                    return [3 /*break*/, 8];
                case 7:
                    _d = _f.sent();
                    body = undefined;
                    return [3 /*break*/, 8];
                case 8:
                    if (!res.ok || !(body === null || body === void 0 ? void 0 : body.success)) {
                        throw new YanbotApiError((body === null || body === void 0 ? void 0 : body.message) || "yanbot \u5F00\u653E\u63A5\u53E3\u8BF7\u6C42\u5931\u8D25 (HTTP ".concat(res.status, ")"), res.status, body === null || body === void 0 ? void 0 : body.code);
                    }
                    return [2 /*return*/, ((_e = body.data) !== null && _e !== void 0 ? _e : undefined)];
            }
        });
    });
}
/** 主查询：院校专业历年录取分数 */
export function querySchoolScore(params) {
    return get("/open/school-score/query", params);
}
/** 可用年份（降序） */
export function getYears() {
    return __awaiter(this, void 0, void 0, function () {
        var data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, get("/open/school-score/meta/years")];
                case 1:
                    data = _a.sent();
                    return [2 /*return*/, (data === null || data === void 0 ? void 0 : data.years) || []];
            }
        });
    });
}
/** 院校层次枚举（双一流/211/985/...） */
export function getLevels(year) {
    return __awaiter(this, void 0, void 0, function () {
        var data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, get("/open/school-score/meta/levels", { year: year })];
                case 1:
                    data = _a.sent();
                    return [2 /*return*/, (data === null || data === void 0 ? void 0 : data.levels) || []];
            }
        });
    });
}
