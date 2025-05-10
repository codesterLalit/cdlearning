import { Neo4jService } from 'nest-neo4j';
import { CreateCourseDto } from './dto/create-course.dto';
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
    getLearningContent(courseId: string, userId: string, questionId?: string): Promise<LearnResponseDto>;
    private getQuestionWithAnswer;
    private getFirstChapterContent;
    private getNextUnfinishedContent;
    private getNextContentBasedOnQuestion;
    private getProgressCount;
    private getTotalItemsCount;
    private getUserProgress;
    private getNextUnfinishedChapter;
    private getNextUnfinishedSubContent;
}
