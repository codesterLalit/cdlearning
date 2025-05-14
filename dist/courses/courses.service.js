"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoursesService = void 0;
const common_1 = require("@nestjs/common");
const nest_neo4j_1 = require("nest-neo4j");
const course_creation_service_1 = require("./course-creation.service");
const course_learning_service_1 = require("./course-learning.service");
const course_progress_service_1 = require("./course-progress.service");
const course_enrollment_service_1 = require("./course-enrollment.service");
const config_1 = require("@nestjs/config");
let CoursesService = class CoursesService {
    constructor(neo4jService, courseProgressService, configService) {
        this.neo4jService = neo4jService;
        this.courseProgressService = courseProgressService;
        this.configService = configService;
        this.creation = new course_creation_service_1.CourseCreationService(neo4jService, configService);
        this.learning = new course_learning_service_1.CourseLearningService(neo4jService, courseProgressService);
        this.progress = new course_progress_service_1.CourseProgressService(neo4jService);
        this.enrollment = new course_enrollment_service_1.CourseEnrollmentService(neo4jService, courseProgressService);
    }
};
exports.CoursesService = CoursesService;
exports.CoursesService = CoursesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [nest_neo4j_1.Neo4jService, course_progress_service_1.CourseProgressService, config_1.ConfigService])
], CoursesService);
//# sourceMappingURL=courses.service.js.map