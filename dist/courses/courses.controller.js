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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoursesController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const courses_service_1 = require("./courses.service");
const create_course_dto_1 = require("./dto/create-course.dto");
const finish_content_dto_1 = require("./dto/finish-content.dto");
let CoursesController = class CoursesController {
    constructor(coursesService) {
        this.coursesService = coursesService;
    }
    async createCourse(createCourseDto, req) {
        const userId = req.user.sub;
        return this.coursesService.createOrEnrollCourse(createCourseDto, userId);
    }
    async getAvailableCourses(req) {
        const userId = req.user.sub;
        return this.coursesService.getAvailableCourses(userId);
    }
    async getEnrolledCourses(req) {
        const userId = req.user.sub;
        return this.coursesService.getEnrolledCourses(userId);
    }
    async getLearningContent(courseId, questionId, req) {
        const userId = req.user.sub;
        return this.coursesService.getLearningContent(courseId, userId, questionId);
    }
    async finishContent(finishContentDto, req) {
        const userId = req.user.sub;
        const { courseId, contentId, type } = finishContentDto;
        const { totalProgress, completed, totalContent, progress, progressPercentage } = await this.coursesService.markContentAsFinished(courseId, userId, contentId, type);
        return {
            success: true,
            completed,
            totalContent,
            progress,
            progressPercentage
        };
    }
    async enrollInCourse(body, req) {
        const userId = req.user.sub;
        const { courseId } = body;
        await this.coursesService.enrollInCourse(courseId, userId);
        return { success: true };
    }
    async resetProgress(courseId, req) {
        return this.coursesService.resetCourseProgress(courseId, req.user.userId);
    }
};
exports.CoursesController = CoursesController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_course_dto_1.CreateCourseDto, Object]),
    __metadata("design:returntype", Promise)
], CoursesController.prototype, "createCourse", null);
__decorate([
    (0, common_1.Get)('available'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CoursesController.prototype, "getAvailableCourses", null);
__decorate([
    (0, common_1.Get)('enrolled'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CoursesController.prototype, "getEnrolledCourses", null);
__decorate([
    (0, common_1.Get)('learn/:courseId'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, common_1.Param)('courseId')),
    __param(1, (0, common_1.Query)('questionId')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], CoursesController.prototype, "getLearningContent", null);
__decorate([
    (0, common_1.Post)('finish-content'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [finish_content_dto_1.FinishContentDto, Object]),
    __metadata("design:returntype", Promise)
], CoursesController.prototype, "finishContent", null);
__decorate([
    (0, common_1.Post)('enroll'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CoursesController.prototype, "enrollInCourse", null);
__decorate([
    (0, common_1.Delete)(':courseId/progress'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('courseId')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CoursesController.prototype, "resetProgress", null);
exports.CoursesController = CoursesController = __decorate([
    (0, common_1.Controller)('courses'),
    __metadata("design:paramtypes", [courses_service_1.CoursesService])
], CoursesController);
//# sourceMappingURL=courses.controller.js.map