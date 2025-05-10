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
const levenshtein = __importStar(require("fastest-levenshtein"));
const uuid_1 = require("uuid");
const llm_utils_1 = require("../common/utils/llm-utils");
const neo4j_date_util_1 = require("../common/utils/neo4j-date-util");
let CoursesService = class CoursesService {
    constructor(neo4jService) {
        this.neo4jService = neo4jService;
        this.courseGenerator = new llm_utils_1.CourseGenerator();
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
        const generatedCourse = await this.courseGenerator.generate(createCourseDto.topic, createCourseDto.complexity);
        const courseId = await this.importCourseToNeo4j(generatedCourse, createCourseDto.topic);
        await this.neo4jService.write(`MATCH (u:User {userId: $userId})
       MATCH (c:Course {courseId: $courseId})
       MERGE (u)-[:CREATED]->(c)
       MERGE (u)-[:ENROLLED_IN]->(c)`, { userId, courseId });
        return {
            message: 'New course created and enrolled',
            course: {
                courseId,
                title: generatedCourse.Course,
                complexity: generatedCourse.complexity,
                topic: generatedCourse.topic
            },
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
    async importCourseToNeo4j(courseData, topic) {
        const courseId = (0, uuid_1.v4)();
        try {
            await this.neo4jService.write(`CREATE (course:Course {
          courseId: $courseId,
          title: $title,
          topic: $topic, 
          complexity: $complexity,
          createdAt: datetime()
        })`, {
                courseId,
                title: courseData.Course,
                topic,
                complexity: courseData.complexity
            });
            for (const chapter of courseData.chapters) {
                const chapterId = (0, uuid_1.v4)();
                await this.neo4jService.write(`MATCH (course:Course {courseId: $courseId})
           CREATE (chapter:Chapter {
             chapterId: $chapterId,
             title: $chapterTitle,
             content: $chapterContent
           })
           CREATE (course)-[:HAS_CHAPTER]->(chapter)`, {
                    courseId,
                    chapterId,
                    chapterTitle: chapter.title,
                    chapterContent: chapter.content
                });
                for (const question of chapter.questions) {
                    const questionId = (0, uuid_1.v4)();
                    const answerId = (0, uuid_1.v4)();
                    await this.neo4jService.write(`MATCH (chapter:Chapter {chapterId: $chapterId})
             CREATE (question:Question {
               questionId: $questionId,
               text: $questionText
             })
             CREATE (answer:Answer {
               answerId: $answerId,
               text: $answerText
             })
             CREATE (chapter)-[:HAS_QUESTION]->(question)
             CREATE (question)-[:HAS_ANSWER]->(answer)`, {
                        chapterId,
                        questionId,
                        questionText: question.question,
                        answerId,
                        answerText: question.answer
                    });
                }
                for (const subContent of chapter.sub_content) {
                    const subContentId = (0, uuid_1.v4)();
                    await this.neo4jService.write(`MATCH (chapter:Chapter {chapterId: $chapterId})
             CREATE (subContent:SubContent {
               subContentId: $subContentId,
               title: $subContentTitle,
               content: $subContentContent
             })
             CREATE (chapter)-[:HAS_SUBCONTENT]->(subContent)`, {
                        chapterId,
                        subContentId,
                        subContentTitle: subContent.title,
                        subContentContent: subContent.content
                    });
                    for (const question of subContent.questions) {
                        const questionId = (0, uuid_1.v4)();
                        const answerId = (0, uuid_1.v4)();
                        await this.neo4jService.write(`MATCH (subContent:SubContent {subContentId: $subContentId})
               CREATE (question:Question {
                 questionId: $questionId,
                 text: $questionText
               })
               CREATE (answer:Answer {
                 answerId: $answerId,
                 text: $answerText
               })
               CREATE (subContent)-[:HAS_QUESTION]->(question)
               CREATE (question)-[:HAS_ANSWER]->(answer)`, {
                            subContentId,
                            questionId,
                            questionText: question.question,
                            answerId,
                            answerText: question.answer
                        });
                    }
                }
            }
            return courseId;
        }
        catch (error) {
            console.error('Error importing course:', error);
            throw new Error('Failed to import course to database');
        }
    }
    async getAvailableCourses(userId) {
        try {
            const result = await this.neo4jService.read(`MATCH (c:Course)
         WHERE NOT EXISTS {
           MATCH (:User {userId: $userId})-[:ENROLLED_IN]->(c)
         }
         RETURN c
         ORDER BY c.createdAt DESC`, { userId });
            return result.records.map(record => {
                const course = record.get('c').properties;
                return {
                    courseId: course.courseId,
                    title: course.title,
                    complexity: course.complexity,
                    topic: course.topic,
                    createdAt: (0, neo4j_date_util_1.formatNeo4jDate)(course.createdAt)
                };
            });
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error);
        }
    }
    async getEnrolledCourses(userId) {
        const result = await this.neo4jService.read(`MATCH (u:User {userId: $userId})-[:ENROLLED_IN]->(c:Course)
       RETURN c
       ORDER BY c.createdAt DESC`, { userId });
        return result.records.map(record => {
            const course = record.get('c').properties;
            return {
                courseId: course.courseId,
                title: course.title,
                complexity: course.complexity,
                createdAt: (0, neo4j_date_util_1.formatNeo4jDate)(course.createdAt)
            };
        });
    }
    async getLearningContent(courseId, userId, questionId) {
        if (questionId) {
            return this.getQuestionWithAnswer(courseId, userId, questionId);
        }
        const progress = await this.getUserProgress(courseId, userId);
        if (progress.finishedCount === 0) {
            return this.getFirstChapterContent(courseId, userId);
        }
        return this.getNextUnfinishedContent(courseId, userId, progress);
    }
    async getQuestionWithAnswer(courseId, userId, questionId) {
        const result = await this.neo4jService.read(`MATCH (u:User {userId: $userId})-[:ENROLLED_IN]->(c:Course {courseId: $courseId})
     MATCH (q:Question {questionId: $questionId})-[:HAS_ANSWER]->(a:Answer)
     OPTIONAL MATCH (q)<-[:HAS_QUESTION]-(parent)
     RETURN q, a, parent, labels(parent) AS parentLabels`, { userId, courseId, questionId });
        if (result.records.length === 0) {
            throw new common_1.NotFoundException('Question not found');
        }
        const record = result.records[0];
        const question = record.get('q').properties;
        const answer = record.get('a').properties;
        const parent = record.get('parent')?.properties;
        const parentLabels = record.get('parentLabels');
        await this.neo4jService.write(`MATCH (u:User {userId: $userId}), (q:Question {questionId: $questionId})
     MERGE (u)-[:ANSWERED]->(q)`, { userId, questionId });
        const parentType = parentLabels?.includes('Chapter') ? 'content' : 'subcontent';
        return {
            type: 'question',
            id: questionId,
            question: {
                id: questionId,
                text: question.text,
                answer: answer.text
            },
            ...(parent && {
                title: parent.title,
                text: parent.content,
                parentType
            }),
            currentProgress: await this.getProgressCount(courseId, userId),
            totalItems: await this.getTotalItemsCount(courseId)
        };
    }
    async getFirstChapterContent(courseId, userId) {
        const result = await this.neo4jService.read(`MATCH (u:User {userId: $userId}), (c:Course {courseId: $courseId})-[:HAS_CHAPTER]->(chapter:Chapter)
     WITH chapter ORDER BY chapter.createdAt LIMIT 1
     OPTIONAL MATCH (chapter)-[:HAS_QUESTION]->(question:Question)
     WHERE NOT EXISTS((u)-[:ANSWERED]->(question))
     RETURN chapter, COLLECT(DISTINCT question)[0..5] AS questions`, { courseId, userId });
        if (result.records.length === 0) {
            throw new common_1.NotFoundException('No chapters found in this course');
        }
        const record = result.records[0];
        const chapter = record.get('chapter').properties;
        const questions = record.get('questions').map(q => ({
            id: q.properties.questionId,
            text: q.properties.text
        }));
        return {
            type: 'content',
            id: chapter.chapterId,
            title: chapter.title,
            text: chapter.content,
            questions,
            currentProgress: 0,
            totalItems: await this.getTotalItemsCount(courseId)
        };
    }
    async getNextUnfinishedContent(courseId, userId, progress) {
        const lastQuestion = await this.neo4jService.read(`MATCH (u:User {userId: $userId})-[:ANSWERED]->(q:Question)
     WHERE (q)-[:BELONGS_TO]->(:Course {courseId: $courseId})
     RETURN q ORDER BY q.answeredAt DESC LIMIT 1`, { userId, courseId });
        if (lastQuestion.records.length > 0) {
            const lastQ = lastQuestion.records[0].get('q').properties;
            return this.getNextContentBasedOnQuestion(courseId, userId, lastQ.questionId);
        }
        return this.getNextUnfinishedChapter(courseId, userId);
    }
    async getNextContentBasedOnQuestion(courseId, userId, lastQuestionId) {
        const result = await this.neo4jService.read(`MATCH (u:User {userId: $userId})-[:ANSWERED]->(q:Question {questionId: $lastQuestionId})
     MATCH (q)<-[:HAS_QUESTION]-(parent)
     OPTIONAL MATCH (parent)-[:NEXT|HAS_SUBCONTENT]->(nextContent)
     WHERE NOT EXISTS((u)-[:FINISHED]->(nextContent))
     WITH nextContent ORDER BY nextContent.createdAt LIMIT 1
     OPTIONAL MATCH (nextContent)-[:HAS_QUESTION]->(question:Question)
     WHERE NOT EXISTS((u)-[:ANSWERED]->(question))
     RETURN nextContent, labels(nextContent) AS contentLabels, 
            COLLECT(DISTINCT question)[0..5] AS questions`, { userId, courseId, lastQuestionId });
        if (result.records.length === 0) {
            return this.getNextUnfinishedChapter(courseId, userId);
        }
        const record = result.records[0];
        const content = record.get('nextContent').properties;
        const contentLabels = record.get('contentLabels');
        const questions = record.get('questions').map(q => ({
            id: q.properties.questionId,
            text: q.properties.text
        }));
        const type = contentLabels.includes('Chapter') ? 'content' : 'subcontent';
        return {
            type,
            id: content.chapterId || content.subContentId,
            title: content.title,
            text: content.content,
            questions,
            currentProgress: await this.getProgressCount(courseId, userId),
            totalItems: await this.getTotalItemsCount(courseId)
        };
    }
    async getProgressCount(courseId, userId) {
        const result = await this.neo4jService.read(`MATCH (u:User {userId: $userId})-[:FINISHED|ANSWERED]->(item)
     WHERE (item)-[:BELONGS_TO]->(:Course {courseId: $courseId})
     RETURN COUNT(DISTINCT item) AS count`, { userId, courseId });
        return result.records[0].get('count').toNumber();
    }
    async getTotalItemsCount(courseId) {
        const result = await this.neo4jService.read(`MATCH (c:Course {courseId: $courseId})-[:HAS_CHAPTER]->(chapter:Chapter)
     OPTIONAL MATCH (chapter)-[:HAS_SUBCONTENT]->(subcontent:SubContent)
     WITH COLLECT(chapter) + COLLECT(subcontent) AS allContents
     UNWIND allContents AS content
     RETURN COUNT(DISTINCT content) AS total`, { courseId });
        return result.records[0].get('total').toNumber();
    }
    async getUserProgress(courseId, userId) {
        const result = await this.neo4jService.read(`MATCH (u:User {userId: $userId})-[:FINISHED]->(content)
     WHERE (content)-[:BELONGS_TO]->(:Course {courseId: $courseId})
     RETURN COUNT(content) AS finishedCount`, { userId, courseId });
        return {
            finishedCount: result.records[0].get('finishedCount').toNumber()
        };
    }
    async getNextUnfinishedChapter(courseId, userId) {
        const result = await this.neo4jService.read(`MATCH (u:User {userId: $userId}), (c:Course {courseId: $courseId})-[:HAS_CHAPTER]->(chapter:Chapter)
     WHERE NOT EXISTS((u)-[:FINISHED]->(chapter))
     WITH chapter ORDER BY chapter.createdAt LIMIT 1
     OPTIONAL MATCH (chapter)-[:HAS_QUESTION]->(question:Question)
     WHERE NOT EXISTS((u)-[:ANSWERED]->(question))
     RETURN chapter, COLLECT(DISTINCT question)[0..5] AS questions`, { courseId, userId });
        if (result.records.length === 0) {
            return this.getNextUnfinishedSubContent(courseId, userId);
        }
        const record = result.records[0];
        const chapter = record.get('chapter').properties;
        const questions = record.get('questions').map(q => ({
            id: q.properties.questionId,
            text: q.properties.text
        }));
        return {
            type: 'content',
            id: chapter.chapterId,
            title: chapter.title,
            text: chapter.content,
            questions,
            currentProgress: await this.getProgressCount(courseId, userId),
            totalItems: await this.getTotalItemsCount(courseId)
        };
    }
    async getNextUnfinishedSubContent(courseId, userId) {
        const result = await this.neo4jService.read(`MATCH (u:User {userId: $userId}), (c:Course {courseId: $courseId})-[:HAS_CHAPTER]->(chapter:Chapter)
     MATCH (chapter)-[:HAS_SUBCONTENT]->(subcontent:SubContent)
     WHERE NOT EXISTS((u)-[:FINISHED]->(subcontent))
     WITH subcontent ORDER BY subcontent.createdAt LIMIT 1
     OPTIONAL MATCH (subcontent)-[:HAS_QUESTION]->(question:Question)
     WHERE NOT EXISTS((u)-[:ANSWERED]->(question))
     RETURN subcontent, COLLECT(DISTINCT question)[0..5] AS questions`, { courseId, userId });
        if (result.records.length === 0) {
            throw new common_1.NotFoundException('No unfinished content found in this course');
        }
        const record = result.records[0];
        const subcontent = record.get('subcontent').properties;
        const questions = record.get('questions').map(q => ({
            id: q.properties.questionId,
            text: q.properties.text
        }));
        return {
            type: 'subcontent',
            id: subcontent.subContentId,
            title: subcontent.title,
            text: subcontent.content,
            questions,
            currentProgress: await this.getProgressCount(courseId, userId),
            totalItems: await this.getTotalItemsCount(courseId)
        };
    }
};
exports.CoursesService = CoursesService;
exports.CoursesService = CoursesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [nest_neo4j_1.Neo4jService])
], CoursesService);
//# sourceMappingURL=courses.service.js.map