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
exports.CoursesService = void 0;
const common_1 = require("@nestjs/common");
const nest_neo4j_1 = require("nest-neo4j");
const genai_1 = require("@google/genai");
const levenshtein = __importStar(require("fastest-levenshtein"));
let CoursesService = class CoursesService {
    constructor(neo4jService) {
        this.neo4jService = neo4jService;
        this.ai = new genai_1.GoogleGenAI({ apiKey: 'AIzaSyBhm4YxIsiUJghqxa_mzoNpwJQqi1bWHAE' });
    }
    async createOrEnrollCourse(createCourseDto, userId) {
        const existingCourse = await this.findSimilarCourse(createCourseDto.topic);
        if (existingCourse) {
            await this.enrollUserInCourse(userId, existingCourse.courseId);
            return {
                message: 'Enrolled in existing similar course',
                course: existingCourse,
                enrolled: true
            };
        }
        const generatedCourse = await this.generateCourse(createCourseDto.topic, createCourseDto.complexity);
        const courseId = await this.importCourseToNeo4j(generatedCourse);
        await this.neo4jService.write(`MATCH (u:User {userId: $userId})
       MATCH (c:Course {courseId: $courseId})
       MERGE (u)-[:CREATED]->(c)
       MERGE (u)-[:ENROLLED_IN]->(c)`, { userId, courseId });
        return {
            message: 'New course created and enrolled',
            course: generatedCourse,
            enrolled: false
        };
    }
    async findSimilarCourse(topic, threshold = 3) {
        const result = await this.neo4jService.read(`MATCH (c:Course) RETURN c`, {});
        for (const record of result.records) {
            const course = record.get('c').properties;
            const distance = levenshtein.distance(topic.toLowerCase(), course.title.toLowerCase());
            if (distance <= threshold) {
                return {
                    courseId: course.courseId,
                    title: course.title,
                    complexity: course.complexity,
                    distance: distance
                };
            }
        }
        return null;
    }
    async enrollUserInCourse(userId, courseId) {
        await this.neo4jService.write(`MATCH (u:User {userId: $userId})
       MATCH (c:Course {courseId: $courseId})
       MERGE (u)-[:ENROLLED_IN]->(c)`, { userId, courseId });
    }
    async generateCourse(topic, complexityLevel) {
        const systemPrompt = `...`;
        const userPrompt = `Here is the topic: "${topic}"\nHere is the complexity level: "${complexityLevel}"`;
        const prompt = `${systemPrompt}\n\n${userPrompt}`;
        const result = await this.ai.models.generateContent({
            model: 'gemini-2.0-flash-001',
            contents: prompt,
        });
        return this.parseCourseResponse(result.text);
    }
    parseCourseResponse(response) {
    }
    async importCourseToNeo4j(courseData) {
        const session = this.neo4jService.getWriteSession();
        const courseId = this.generateUUID();
        try {
            const tx = session.beginTransaction();
            await tx.run(`CREATE (course:Course {
          courseId: $courseId,
          title: $title, 
          complexity: $complexity,
          createdAt: datetime()
        })`, {
                courseId,
                title: courseData.Course,
                complexity: courseData.complexity
            });
            await tx.commit();
            return courseId;
        }
        catch (error) {
            console.error('Error importing course:', error);
            throw error;
        }
        finally {
            await session.close();
        }
    }
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
};
exports.CoursesService = CoursesService;
exports.CoursesService = CoursesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [nest_neo4j_1.Neo4jService])
], CoursesService);
//# sourceMappingURL=courses.service.js.map