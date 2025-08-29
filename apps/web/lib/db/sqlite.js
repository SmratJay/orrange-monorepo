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
exports.sqliteDb = void 0;
var Database = require("better-sqlite3");
var path_1 = require("path");
var SQLiteDatabase = /** @class */ (function () {
    function SQLiteDatabase() {
        var dbPath = (0, path_1.join)(process.cwd(), 'lib', 'db', 'orrange.db');
    this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.init();
    }
    SQLiteDatabase.getInstance = function () {
        if (!SQLiteDatabase.instance) {
            SQLiteDatabase.instance = new SQLiteDatabase();
        }
        return SQLiteDatabase.instance;
    };
    SQLiteDatabase.prototype.init = function () {
        // Create tables
        this.db.exec("\n      CREATE TABLE IF NOT EXISTS users (\n        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),\n        email TEXT UNIQUE NOT NULL,\n        password_hash TEXT,\n        provider TEXT DEFAULT 'email',\n        provider_id TEXT,\n        avatar_url TEXT,\n        email_verified BOOLEAN DEFAULT 0,\n        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n        last_login_at DATETIME,\n        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted'))\n      );\n\n      CREATE TABLE IF NOT EXISTS user_profiles (\n        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),\n        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,\n        username TEXT UNIQUE NOT NULL,\n        display_name TEXT NOT NULL,\n        bio TEXT,\n        avatar_url TEXT,\n        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP\n      );\n\n      CREATE TABLE IF NOT EXISTS user_sessions (\n        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),\n        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,\n        token_hash TEXT NOT NULL,\n        device_info TEXT,\n        ip_address TEXT,\n        expires_at DATETIME NOT NULL,\n        created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n      );\n\n      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);\n      CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id);\n      CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);\n      CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username);\n      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);\n      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);\n    ");
    };
    SQLiteDatabase.prototype.query = function (sql, params) {
        if (params === void 0) { params = []; }
        try {
            var stmt = this.db.prepare(sql);
            var upperSql = sql.trim().toUpperCase();
            if (upperSql.startsWith('SELECT') || upperSql.startsWith('PRAGMA')) {
                return stmt.all(params);
            }
            else {
                var result = stmt.run(params);
                return [{ changes: result.changes, lastInsertRowid: result.lastInsertRowid }];
            }
        }
        catch (error) {
            console.error('Database query error:', error);
            throw error;
        }
    };
    SQLiteDatabase.prototype.transaction = function (callback) {
        return __awaiter(this, void 0, void 0, function () {
            var transaction;
            return __generator(this, function (_a) {
                transaction = this.db.transaction(function () {
                    return callback();
                });
                return [2 /*return*/, transaction()];
            });
        });
    };
    return SQLiteDatabase;
}());
exports.sqliteDb = SQLiteDatabase.getInstance();
