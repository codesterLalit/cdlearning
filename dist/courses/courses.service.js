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
        const existingCourse = await this.findSimilarCourse(createCourseDto.topic, createCourseDto.complexity);
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
    async findSimilarCourse(topic, complexity, threshold = 3) {
        const result = await this.neo4jService.read(`MATCH (c:Course) RETURN c`, {});
        for (const record of result.records) {
            const course = record.get('c').properties;
            const distance = levenshtein.distance(topic.toLowerCase(), course.topic.toLowerCase());
            if (distance <= threshold && course.complexity == complexity) {
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
             content: $chapterContent,
             serialNumber: $serialNumber
           })
           CREATE (course)-[:HAS_CHAPTER]->(chapter)
           CREATE (chapter)-[:BELONGS_TO]->(course)`, {
                    courseId,
                    chapterId,
                    chapterTitle: chapter.title,
                    chapterContent: chapter.content,
                    serialNumber: chapter.serialNumber
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
               content: $subContentContent,
               serialNumber: $serialNumber
             })
             CREATE (chapter)-[:HAS_SUBCONTENT]->(subContent)
             CREATE (subContent)-[:BELONGS_TO]->(chapter)`, {
                        chapterId,
                        subContentId,
                        subContentTitle: subContent.title,
                        subContentContent: subContent.content,
                        serialNumber: subContent.serialNumber,
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
        const result = await this.neo4jService.read(`MATCH (u:User {userId: $userId})-[r:ENROLLED_IN]->(c:Course)
       RETURN c, r.lastInteracted AS lastInteracted
       ORDER BY r.lastInteracted DESC`, { userId });
        const courses = await Promise.all(result.records.map(async (record) => {
            const course = record.get('c').properties;
            const lastInteracted = record.get('lastInteracted');
            const progress = await this.getUserProgress(course.courseId, userId);
            const totalItems = await this.getTotalItemsCount(course.courseId);
            const isCompleted = totalItems > 0 && progress.finishedCount >= totalItems;
            const progressPercentage = totalItems > 0
                ? Math.round((progress.finishedCount / totalItems) * 100)
                : 0;
            return {
                courseId: course.courseId,
                title: course.title,
                complexity: course.complexity,
                topic: course.topic,
                createdAt: (0, neo4j_date_util_1.formatNeo4jDate)(course.createdAt),
                lastInteracted: lastInteracted ? (0, neo4j_date_util_1.formatNeo4jDate)(lastInteracted) : (0, neo4j_date_util_1.formatNeo4jDate)(course.createdAt),
                progress: {
                    completed: progress.finishedCount,
                    total: totalItems,
                    percentage: progressPercentage,
                    isCompleted
                }
            };
        }));
        return courses;
    }
    async getLearningContent(courseId, userId, questionId, contentId) {
        const isEnrolled = await this.neo4jService.read(`MATCH (u:User {userId: $userId})-[:ENROLLED_IN]->(c:Course {courseId: $courseId})
       RETURN COUNT(u) > 0 AS enrolled`, { userId, courseId });
        if (!isEnrolled.records[0].get('enrolled')) {
            throw new common_1.NotFoundException('User is not enrolled in this course');
        }
        if (questionId) {
            return this.getQuestionWithAnswer(courseId, userId, questionId);
        }
        const progress = await this.getUserProgress(courseId, userId);
        const totalCount = await this.getTotalItemsCount(courseId);
        if (progress.finishedCount == totalCount) {
            const hierarchy = await this.getCourseHierarchy(courseId);
            return {
                type: 'content',
                id: '',
                title: '',
                text: '',
                recommendedQuestions: [],
                currentProgress: progress.finishedCount,
                totalItems: totalCount,
                courseHierarchy: hierarchy
            };
        }
        if (progress.finishedCount === 0) {
            return this.getFirstChapterContent(courseId, userId);
        }
        return this.getNextUnfinishedItem(courseId, userId);
    }
    async getCourseHierarchy(courseId, currentContentId) {
        const result = await this.neo4jService.read(`MATCH (c:Course {courseId: $courseId})-[:HAS_CHAPTER]->(chapter:Chapter)
        OPTIONAL MATCH (chapter)-[:HAS_SUBCONTENT]->(subcontent:SubContent)
        RETURN chapter, subcontent
        ORDER BY chapter.serialNumber, subcontent.serialNumber`, { courseId });
        const hierarchy = [];
        result.records.forEach(record => {
            const chapter = record.get('chapter');
            const subcontent = record.get('subcontent');
            if (chapter) {
                const chapterId = chapter.properties.chapterId;
                if (!hierarchy.some(item => item.id === chapterId)) {
                    hierarchy.push({
                        id: chapterId,
                        type: 'content',
                        title: chapter.properties.title,
                        serialNumber: chapter.properties.serialNumber,
                        parentId: undefined,
                        current: currentContentId === chapterId
                    });
                }
            }
            if (subcontent) {
                const subContentId = subcontent.properties.subContentId;
                if (!hierarchy.some(item => item.id === subContentId)) {
                    hierarchy.push({
                        id: subContentId,
                        type: 'subcontent',
                        title: subcontent.properties.title,
                        serialNumber: subcontent.properties.serialNumber,
                        parentId: chapter?.properties.chapterId,
                        current: currentContentId === subContentId
                    });
                }
            }
        });
        return hierarchy;
    }
    async getRecommendedQuestions(courseId, userId, currentContentId) {
        let result = await this.neo4jService.read(`MATCH (u:User {userId: $userId})-[:ENROLLED_IN]->(c:Course {courseId: $courseId})
       MATCH (content {chapterId: $currentContentId})-[:HAS_SUBCONTENT]->(subcontent)-[:HAS_QUESTION]->(q:Question)
       WHERE NOT (u)-[:ANSWERED]->(q)
       RETURN q
       ORDER BY subcontent.serialNumber, q.text
       LIMIT 5`, { userId, courseId, currentContentId });
        let questions = result.records.map(r => ({
            id: r.get('q').properties.questionId,
            text: r.get('q').properties.text
        }));
        if (questions.length < 5 && currentContentId) {
            result = await this.neo4jService.read(`MATCH (u:User {userId: $userId})-[:ENROLLED_IN]->(c:Course {courseId: $courseId})
         MATCH (content {chapterId: $currentContentId})-[:HAS_QUESTION]->(q:Question)
         WHERE NOT (u)-[:ANSWERED]->(q)
         RETURN q
         ORDER BY q.text
         LIMIT ${5 - questions.length}`, { userId, courseId, currentContentId });
            questions = questions.concat(result.records.map(r => ({
                id: r.get('q').properties.questionId,
                text: r.get('q').properties.text
            })));
        }
        if (questions.length < 5) {
            const currentContent = currentContentId
                ? await this.neo4jService.read(`MATCH (c:Course {courseId: $courseId})-[:HAS_CHAPTER]->(content)
             WHERE content.chapterId = $currentContentId OR content.subContentId = $currentContentId
             RETURN content.serialNumber AS serialNumber, labels(content) AS labels`, { courseId, currentContentId })
                : { records: [] };
            const currentSerial = currentContent.records[0]?.get('serialNumber') || 0;
            const isChapter = currentContent.records[0]?.get('labels')?.includes('Chapter');
            result = await this.neo4jService.read(`MATCH (u:User {userId: $userId})-[:ENROLLED_IN]->(c:Course {courseId: $courseId})
         MATCH (c)-[:HAS_CHAPTER]->(chapter)-[:HAS_SUBCONTENT*0..1]->(content)-[:HAS_QUESTION]->(q:Question)
         WHERE NOT (u)-[:ANSWERED]->(q)
           AND (
             (chapter.serialNumber > ${currentSerial})
             OR (chapter.serialNumber = ${currentSerial} AND ${isChapter ? 'true' : 'false'})
           )
         RETURN q, content.serialNumber AS contentSerial
         ORDER BY contentSerial, q.text
         LIMIT ${5 - questions.length}`, { userId, courseId });
            questions = questions.concat(result.records.map(r => ({
                id: r.get('q').properties.questionId,
                text: r.get('q').properties.text
            })));
        }
        return questions;
    }
    async getNextUnfinishedItem(courseId, userId) {
        try {
            const result = await this.neo4jService.read(`MATCH (u:User {userId: $userId})
         MATCH (c:Course {courseId: $courseId})-[:HAS_CHAPTER]->(chapter:Chapter)
         OPTIONAL MATCH (chapter)-[:HAS_SUBCONTENT]->(subcontent:SubContent)
         
         WITH u, c, COLLECT(chapter) + COLLECT(subcontent) AS allContents
         UNWIND allContents AS content
         WITH u, content
         WHERE content IS NOT NULL
            AND NOT (u)-[:FINISHED]->(content)
         
         WITH u, content 
         ORDER BY content.serialNumber 
         LIMIT 1
         
         RETURN content, labels(content) AS contentLabels`, { courseId, userId });
            if (result.records.length === 0) {
                throw new common_1.NotFoundException('No unfinished content found in this course');
            }
            const record = result.records[0];
            const content = record.get('content').properties;
            const contentLabels = record.get('contentLabels');
            const type = contentLabels.includes('Chapter') ? 'content' : 'subcontent';
            const id = content.chapterId || content.subContentId;
            const questions = await this.getRecommendedQuestions(courseId, userId, id);
            const hierarchy = await this.getCourseHierarchy(courseId, id);
            return {
                type,
                id,
                title: content.title,
                text: content.content,
                recommendedQuestions: questions,
                currentProgress: (await this.getUserProgress(courseId, userId)).finishedCount,
                totalItems: await this.getTotalItemsCount(courseId),
                courseHierarchy: hierarchy
            };
        }
        catch (error) {
            console.error(error);
            throw new common_1.InternalServerErrorException('Failed to fetch learning content');
        }
    }
    async getQuestionWithAnswer(courseId, userId, questionId) {
        try {
            const result = await this.neo4jService.read(`MATCH (u:User {userId: $userId})-[:ENROLLED_IN]->(c:Course {courseId: $courseId})
         MATCH (q:Question {questionId: $questionId})-[:HAS_ANSWER]->(a:Answer)
         MATCH (parent)-[:HAS_QUESTION]->(q)
         RETURN q, a, parent, labels(parent) AS parentLabels`, { userId, courseId, questionId });
            if (result.records.length === 0) {
                throw new common_1.NotFoundException('Question not found');
            }
            const record = result.records[0];
            const question = record.get('q').properties;
            const answer = record.get('a').properties;
            const parent = record.get('parent').properties;
            const parentLabels = record.get('parentLabels');
            const type = parentLabels.includes('Chapter') ? 'content' : 'subcontent';
            const id = parent.chapterId || parent.subContentId;
            const questions = await this.getRecommendedQuestions(courseId, userId, id);
            const hierarchy = await this.getCourseHierarchy(courseId, id);
            return {
                type,
                id,
                title: parent.title,
                text: parent.content,
                recommendedQuestions: questions,
                requestedQuestion: {
                    id: questionId,
                    text: question.text,
                    answer: answer.text
                },
                currentProgress: (await this.getUserProgress(courseId, userId)).finishedCount,
                totalItems: await this.getTotalItemsCount(courseId),
                courseHierarchy: hierarchy
            };
        }
        catch (error) {
            throw new common_1.InternalServerErrorException(error);
        }
    }
    async getFirstChapterContent(courseId, userId) {
        try {
            const result = await this.neo4jService.read(`MATCH (u:User {userId: $userId})
         MATCH (c:Course {courseId: $courseId})-[:HAS_CHAPTER]->(chapter:Chapter)
         WITH u, chapter 
         ORDER BY chapter.serialNumber 
         LIMIT 1
         RETURN chapter`, { courseId, userId });
            if (result.records.length === 0) {
                throw new common_1.NotFoundException('No chapters found in this course');
            }
            const record = result.records[0];
            const chapter = record.get('chapter').properties;
            const questions = await this.getRecommendedQuestions(courseId, userId, chapter.chapterId);
            const hierarchy = await this.getCourseHierarchy(courseId, chapter.chapterId);
            return {
                type: 'content',
                id: chapter.chapterId,
                title: chapter.title,
                text: chapter.content,
                recommendedQuestions: questions,
                currentProgress: 0,
                totalItems: await this.getTotalItemsCount(courseId),
                courseHierarchy: hierarchy
            };
        }
        catch (error) {
            console.error(error);
            throw new common_1.InternalServerErrorException(error);
        }
    }
    async getTotalItemsCount(courseId) {
        const result = await this.neo4jService.read(`MATCH (c:Course {courseId: $courseId})-[:HAS_CHAPTER]->(chapter:Chapter)
       OPTIONAL MATCH (chapter)-[:HAS_SUBCONTENT*]->(subcontent:SubContent)
       WITH COLLECT(chapter) + COLLECT(subcontent) AS allContents
       UNWIND allContents AS content
       RETURN COUNT(DISTINCT content) AS total`, { courseId });
        return result.records[0].get('total').toNumber();
    }
    async getUserProgress(courseId, userId) {
        const result = await this.neo4jService.read(`MATCH (u:User {userId: $userId})-[:FINISHED]->(content)
       WHERE (content)-[:BELONGS_TO]->(:Course {courseId: $courseId}) OR
             (content)-[:BELONGS_TO]->(:Chapter)-[:BELONGS_TO]->(:Course {courseId: $courseId}) OR
             (content)-[:BELONGS_TO]->(:SubContent)-[:BELONGS_TO*]->(:Course {courseId: $courseId})
       RETURN COUNT(DISTINCT content) AS finishedCount`, { userId, courseId });
        return {
            finishedCount: result.records[0].get('finishedCount').toNumber()
        };
    }
    async markContentAsFinished(courseId, userId, contentId, type) {
        const label = type === 'content' ? 'Chapter' : 'SubContent';
        const idProperty = type === 'content' ? 'chapterId' : 'subContentId';
        const contentExists = await this.neo4jService.read(`MATCH (c:Course {courseId: $courseId})-[:HAS_CHAPTER]->()-[:HAS_SUBCONTENT*0..1]->(content:${label} {${idProperty}: $contentId})
       RETURN COUNT(content) > 0 AS exists`, { courseId, contentId });
        if (!contentExists.records[0].get('exists')) {
            throw new common_1.NotFoundException('Content not found in this course');
        }
        const result = await this.neo4jService.write(`MATCH (u:User {userId: $userId})
       MATCH (content:${label} {${idProperty}: $contentId})
       WHERE NOT (u)-[:FINISHED]->(content)
       
       // Mark content as finished
       MERGE (u)-[:FINISHED {at: datetime()}]->(content)
       
       // Mark connected questions as answered
       WITH u, content
       MATCH (content)-[:HAS_QUESTION]->(q:Question)
       WHERE NOT (u)-[:ANSWERED]->(q)
       MERGE (u)-[:ANSWERED {at: datetime()}]->(q)
       
       // Update course interaction time
       WITH u
       MATCH (u)-[r:ENROLLED_IN]->(c:Course {courseId: $courseId})
       SET r.lastInteracted = datetime()
       
       // Return progress data
       WITH u, c
       MATCH (u)-[:FINISHED]->(finishedContent)
       WHERE (finishedContent)-[:BELONGS_TO*]->(c)
       WITH COUNT(DISTINCT finishedContent) AS finishedCount
       
       MATCH (c:Course {courseId: $courseId})
       OPTIONAL MATCH (c)-[:HAS_CHAPTER]->(ch:Chapter)
       OPTIONAL MATCH (ch)-[:HAS_SUBCONTENT*]->(sc:SubContent)
       WITH finishedCount, COUNT(DISTINCT ch) + COUNT(DISTINCT sc) AS totalContent
       
       RETURN finishedCount, totalContent, datetime() AS lastInteracted`, { userId, contentId, courseId });
        const record = result.records[0];
        const finishedCount = record.get('finishedCount').toInt();
        const totalContent = record.get('totalContent').toInt();
        const lastInteracted = (0, neo4j_date_util_1.formatNeo4jDate)(record.get('lastInteracted'));
        const progressPercentage = totalContent > 0
            ? Math.round((finishedCount / totalContent) * 100)
            : 0;
        return {
            totalProgress: finishedCount,
            completed: finishedCount >= totalContent,
            totalContent,
            progress: finishedCount,
            progressPercentage,
            lastInteracted
        };
    }
    async enrollInCourse(courseId, userId) {
        const courseExists = await this.neo4jService.read(`MATCH (c:Course {courseId: $courseId}) RETURN c`, { courseId });
        if (courseExists.records.length === 0) {
            throw new common_1.NotFoundException('Course not found');
        }
        const alreadyEnrolled = await this.neo4jService.read(`MATCH (u:User {userId: $userId})-[:ENROLLED_IN]->(c:Course {courseId: $courseId})
      RETURN COUNT(u) AS count`, { userId, courseId });
        if (alreadyEnrolled.records[0].get('count').toInt() > 0) {
            throw new common_1.BadRequestException('User is already enrolled in this course');
        }
        await this.neo4jService.write(`
      MATCH (u:User {userId: $userId}), (c:Course {courseId: $courseId})
      MERGE (u)-[:ENROLLED_IN {at: datetime()}]->(c)
      `, { userId, courseId });
    }
    async resetCourseProgress(courseId, userId) {
        const isEnrolled = await this.neo4jService.read(`MATCH (u:User {userId: $userId})-[:ENROLLED_IN]->(c:Course {courseId: $courseId})
       RETURN COUNT(u) > 0 AS enrolled`, { userId, courseId });
        if (!isEnrolled.records[0].get('enrolled')) {
            throw new common_1.NotFoundException('User is not enrolled in this course');
        }
        try {
            await this.neo4jService.write(`MATCH (u:User {userId: $userId})-[f:FINISHED]->(content)
         WHERE (content:Chapter)-[:BELONGS_TO]->(:Course {courseId: $courseId})
            OR (content:SubContent)-[:BELONGS_TO]->(:Chapter)-[:BELONGS_TO]->(:Course {courseId: $courseId})
         DELETE f`, { userId, courseId });
            await this.neo4jService.write(`MATCH (u:User {userId: $userId})-[a:ANSWERED]->(q:Question)
         WHERE (q)<-[:HAS_QUESTION]-(:Chapter)-[:BELONGS_TO]->(:Course {courseId: $courseId})
            OR (q)<-[:HAS_QUESTION]-(:SubContent)-[:BELONGS_TO]->(:Chapter)-[:BELONGS_TO]->(:Course {courseId: $courseId})
         DELETE a`, { userId, courseId });
            return { message: 'Course progress has been reset successfully' };
        }
        catch (error) {
            console.error('Error resetting course progress:', error);
            throw new common_1.InternalServerErrorException('Failed to reset course progress');
        }
    }
};
exports.CoursesService = CoursesService;
exports.CoursesService = CoursesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [nest_neo4j_1.Neo4jService])
], CoursesService);
//# sourceMappingURL=courses.service.js.map