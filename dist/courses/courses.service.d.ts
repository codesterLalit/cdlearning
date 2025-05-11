import { Neo4jService } from 'nest-neo4j';
import { CreateCourseDto } from './dto/create-course.dto';
import { UUIDTypes } from 'uuid';
import { CourseResponseDto } from './dto/course-response.dto';
import { LearnResponseDto } from './dto/learn-response.dto';
export declare class CoursesService {
    private readonly neo4jService;
    private courseGenerator;
    constructor(neo4jService: Neo4jService);
    createOrEnrollCourse(createCourseDto: CreateCourseDto, userId: string): Promise<{
        message: string;
        course: {
            courseId: any;
            title: any;
            complexity: any;
            distance: number;
        };
        enrolled: boolean;
    } | {
        message: string;
        course: {
            courseId: string;
            title: any;
            complexity: any;
            topic: any;
        };
        enrolled: boolean;
    }>;
    private findSimilarCourse;
    private enrollUserInCourse;
    private importCourseToNeo4j;
    getAvailableCourses(userId: string): Promise<CourseResponseDto[]>;
    getEnrolledCourses(userId: string): Promise<CourseResponseDto[]>;
    getLearningContent(courseId: string, userId: string, questionId?: UUIDTypes): Promise<LearnResponseDto>;
    private getNextUnfinishedItem;
    private getQuestionWithAnswer;
    private getFirstChapterContent;
    private getTotalItemsCount;
    private getUserProgress;
    markContentAsFinished(courseId: string, userId: string, contentId: string, type: 'content' | 'subcontent'): Promise<{
        totalProgress: number;
        completed: boolean;
        totalContent: number;
        progress: number;
        progressPercentage: number;
    }>;
    enrollInCourse(courseId: string, userId: string): Promise<void>;
    resetCourseProgress(courseId: string, userId: string): Promise<{
        message: string;
    }>;
}
