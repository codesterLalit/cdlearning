import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { CourseResponseDto } from './dto/course-response.dto';
import { LearnResponseDto } from './dto/learn-response.dto';
import { FinishContentDto } from './dto/finish-content.dto';
import { UUIDTypes } from 'uuid';
export declare class CoursesController {
    private readonly coursesService;
    constructor(coursesService: CoursesService);
    createCourse(createCourseDto: CreateCourseDto, req: any): Promise<{
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
    getAvailableCourses(req: any): Promise<CourseResponseDto[]>;
    getEnrolledCourses(req: any): Promise<CourseResponseDto[]>;
    getLearningContent(courseId: string, questionId: UUIDTypes, req: any): Promise<LearnResponseDto>;
    finishContent(finishContentDto: FinishContentDto, req: any): Promise<{
        success: boolean;
        completed: boolean;
        totalContent: number;
        progress: number;
        progressPercentage: number;
    }>;
    enrollInCourse(body: {
        courseId: string;
    }, req: any): Promise<{
        success: boolean;
    }>;
    resetProgress(courseId: string, req: any): Promise<{
        message: string;
    }>;
}
