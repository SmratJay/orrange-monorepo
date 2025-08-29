"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
var connection_1 = require("../lib/db/connection");
function manageDatabase() {
    return __awaiter(this, void 0, void 0, function () {
        var command, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    command = process.argv[2] || 'view';
                    _a = command;
                    switch (_a) {
                        case 'view': return [3 /*break*/, 1];
                        case 'clear': return [3 /*break*/, 3];
                        case 'stats': return [3 /*break*/, 5];
                    }
                    return [3 /*break*/, 7];
                case 1: return [4 /*yield*/, viewDatabase()];
                case 2:
                    _b.sent();
                    return [3 /*break*/, 8];
                case 3: return [4 /*yield*/, clearDatabase()];
                case 4:
                    _b.sent();
                    return [3 /*break*/, 8];
                case 5: return [4 /*yield*/, showStats()];
                case 6:
                    _b.sent();
                    return [3 /*break*/, 8];
                case 7:
                    showHelp();
                    _b.label = 8;
                case 8:
                    process.exit(0);
                    return [2 /*return*/];
            }
        });
    });
}
function viewDatabase() {
    return __awaiter(this, void 0, void 0, function () {
        var users, profiles, sessions, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('🗄️ ORRANGE DATABASE');
                    console.log('-'.repeat(40));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 5, , 6]);
                    return [4 /*yield*/, connection_1.db.query('SELECT id, email, status, created_at FROM users ORDER BY created_at DESC')];
                case 2:
                    users = _a.sent();
                    return [4 /*yield*/, connection_1.db.query('SELECT user_id, username, display_name FROM user_profiles')];
                case 3:
                    profiles = _a.sent();
                    return [4 /*yield*/, connection_1.db.query('SELECT user_id, expires_at FROM user_sessions')];
                case 4:
                    sessions = _a.sent();
                    console.log("\uFFFD Users: ".concat(users.length));
                    users.forEach(function (user, i) {
                        console.log("  ".concat(i + 1, ". ").concat(user.email, " (").concat(user.status, ")"));
                    });
                    console.log("\n\uFFFD Active Sessions: ".concat(sessions.filter(function (s) { return new Date(s.expires_at) > new Date(); }).length));
                    return [3 /*break*/, 6];
                case 5:
                    error_1 = _a.sent();
                    console.error('❌ Database error:', error_1);
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function clearDatabase() {
    return __awaiter(this, void 0, void 0, function () {
        var error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    console.log('🧹 Clearing database...');
                    return [4 /*yield*/, connection_1.db.query('DELETE FROM user_sessions')];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, connection_1.db.query('DELETE FROM user_profiles')];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, connection_1.db.query('DELETE FROM users')];
                case 3:
                    _a.sent();
                    console.log('✅ Database cleared');
                    return [3 /*break*/, 5];
                case 4:
                    error_2 = _a.sent();
                    console.error('❌ Clear failed:', error_2);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function showStats() {
    return __awaiter(this, void 0, void 0, function () {
        var users, profiles, sessions, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, connection_1.db.query('SELECT COUNT(*) as count FROM users')];
                case 1:
                    users = _a.sent();
                    return [4 /*yield*/, connection_1.db.query('SELECT COUNT(*) as count FROM user_profiles')];
                case 2:
                    profiles = _a.sent();
                    return [4 /*yield*/, connection_1.db.query('SELECT COUNT(*) as count FROM user_sessions')];
                case 3:
                    sessions = _a.sent();
                    console.log('📊 DATABASE STATS:');
                    console.log("   Users: ".concat(users[0].count));
                    console.log("   Profiles: ".concat(profiles[0].count));
                    console.log("   Sessions: ".concat(sessions[0].count));
                    return [3 /*break*/, 5];
                case 4:
                    error_3 = _a.sent();
                    console.error('❌ Stats failed:', error_3);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
function showHelp() {
    console.log('🗄️ DATABASE MANAGER');
    console.log('Usage: npx tsx scripts/db.ts [command]');
    console.log('');
    console.log('Commands:');
    console.log('  view   - View database contents (default)');
    console.log('  clear  - Clear all data');
    console.log('  stats  - Show statistics');
}
manageDatabase();
