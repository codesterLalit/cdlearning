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
exports.CreateCourseDto = exports.ComplexityLevel = void 0;
const class_validator_1 = require("class-validator");
var ComplexityLevel;
(function (ComplexityLevel) {
    ComplexityLevel["SURFACE"] = "Surface Level";
    ComplexityLevel["EXPLORING"] = "Exploring Level";
    ComplexityLevel["EXPERIMENTER"] = "Experimenter Level";
    ComplexityLevel["EXPERT"] = "Expert Level";
})(ComplexityLevel || (exports.ComplexityLevel = ComplexityLevel = {}));
class CreateCourseDto {
}
exports.CreateCourseDto = CreateCourseDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateCourseDto.prototype, "topic", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(ComplexityLevel),
    __metadata("design:type", String)
], CreateCourseDto.prototype, "complexity", void 0);
//# sourceMappingURL=create-course.dto.js.map