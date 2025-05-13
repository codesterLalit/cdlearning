// courses/courses.service.ts
import { Injectable } from '@nestjs/common';
import { Neo4jService } from 'nest-neo4j';
import { CourseCreationService } from './course-creation.service';
import { CourseLearningService } from './course-learning.service';
import { CourseProgressService } from './course-progress.service';
import { CourseEnrollmentService } from './course-enrollment.service';

@Injectable()
export class CoursesService {
  public creation: CourseCreationService;
  public learning: CourseLearningService;
  public progress: CourseProgressService;
  public enrollment: CourseEnrollmentService;

  constructor(private readonly neo4jService: Neo4jService, private courseProgressService: CourseProgressService) {
    this.creation = new CourseCreationService(neo4jService);
    this.learning = new CourseLearningService(neo4jService, courseProgressService);
    this.progress = new CourseProgressService(neo4jService);
    this.enrollment = new CourseEnrollmentService(neo4jService, courseProgressService);
  }
}