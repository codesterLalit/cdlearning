import { Neo4jService } from 'nest-neo4j';
import { CreateCourseDto } from './dto/create-course.dto';
export declare class CoursesService {
    private readonly neo4jService;
    private ai;
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
        course: void;
        enrolled: boolean;
    }>;
    private findSimilarCourse;
    private enrollUserInCourse;
    private generateCourse;
    private parseCourseResponse;
    private importCourseToNeo4j;
    private generateUUID;
}
