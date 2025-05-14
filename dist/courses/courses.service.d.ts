import { Neo4jService } from 'nest-neo4j';
import { CourseCreationService } from './course-creation.service';
import { CourseLearningService } from './course-learning.service';
import { CourseProgressService } from './course-progress.service';
import { CourseEnrollmentService } from './course-enrollment.service';
import { ConfigService } from '@nestjs/config';
export declare class CoursesService {
    private readonly neo4jService;
    private courseProgressService;
    private configService;
    creation: CourseCreationService;
    learning: CourseLearningService;
    progress: CourseProgressService;
    enrollment: CourseEnrollmentService;
    constructor(neo4jService: Neo4jService, courseProgressService: CourseProgressService, configService: ConfigService);
}
