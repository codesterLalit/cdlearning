"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const nest_neo4j_1 = require("nest-neo4j");
let DatabaseModule = class DatabaseModule {
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = __decorate([
    (0, common_1.Module)({
        imports: [
            nest_neo4j_1.Neo4jModule.forRootAsync({
                imports: [config_1.ConfigModule],
                useFactory: (config) => ({
                    scheme: 'bolt',
                    host: config.get('NEO4J_URI').split('//')[1].split(':')[0],
                    port: config.get('NEO4J_URI').split(':')[2],
                    username: config.get('NEO4J_USERNAME'),
                    password: config.get('NEO4J_PASSWORD'),
                }),
                inject: [config_1.ConfigService],
            }),
        ],
        exports: [nest_neo4j_1.Neo4jModule],
    })
], DatabaseModule);
//# sourceMappingURL=database.module.js.map