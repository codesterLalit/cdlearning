import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { CourseResponseDto } from './dto/course-response.dto';
import { LearnResponseDto } from './dto/learn-response.dto';
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
    getLearningContent(courseId: string, questionId: string, req: any): Promise<LearnResponseDto>;
}
