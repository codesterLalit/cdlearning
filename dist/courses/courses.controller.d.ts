import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
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
        course: void;
        enrolled: boolean;
    }>;
}
