"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const nest_neo4j_1 = require("nest-neo4j");
const bcrypt = __importStar(require("bcrypt"));
const jwt_1 = require("@nestjs/jwt");
const neo4j_date_util_1 = require("../common/utils/neo4j-date-util");
let AuthService = class AuthService {
    constructor(neo4jService, jwtService) {
        this.neo4jService = neo4jService;
        this.jwtService = jwtService;
    }
    async register(registerUserDto) {
        const { email, username, password } = registerUserDto;
        const existingUser = await this.neo4jService.read(`MATCH (u:User {email: $email}) RETURN u`, { email });
        if (existingUser.records.length > 0) {
            throw new common_1.BadRequestException('User already exists');
        }
        const salt = await bcrypt.genSalt();
        const hashedPassword = await bcrypt.hash(password, salt);
        const result = await this.neo4jService.write(`CREATE (u:User {
        userId: apoc.create.uuid(),
        email: $email,
        username: $username,
        password: $hashedPassword,
        createdAt: datetime()
      }) RETURN u`, { email, username, hashedPassword });
        const user = result.records[0].get('u').properties;
        const { password: _, ...userWithoutPassword } = user;
        userWithoutPassword.createdAt = userWithoutPassword.createdAt ? (0, neo4j_date_util_1.formatNeo4jDate)(userWithoutPassword.createdAt) : null;
        return userWithoutPassword;
    }
    async login(loginUserDto) {
        const { email, password } = loginUserDto;
        const result = await this.neo4jService.read(`MATCH (u:User {email: $email}) RETURN u`, { email });
        if (result.records.length === 0) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const user = result.records[0].get('u').properties;
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const payload = {
            sub: user.userId,
            email: user.email,
            username: user.username
        };
        const accessToken = this.jwtService.sign(payload);
        const { password: _, ...userWithoutPassword } = user;
        userWithoutPassword.createdAt = userWithoutPassword.createdAt ? (0, neo4j_date_util_1.formatNeo4jDate)(userWithoutPassword.createdAt) : null;
        return {
            user: userWithoutPassword,
            accessToken,
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [nest_neo4j_1.Neo4jService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map