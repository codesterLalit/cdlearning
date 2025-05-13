// courses/course-enrollment.service.ts
import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { Neo4jService } from 'nest-neo4j';
import { CourseResponseDto } from './dto/course-response.dto';
import { formatNeo4jDate } from 'src/common/utils/neo4j-date-util';
import { CourseProgressService } from './course-progress.service';

@Injectable()
export class CourseEnrollmentService {
  constructor(private readonly neo4jService: Neo4jService, private courseProgressService: CourseProgressService) {}

  async getAvailableCourses(userId: string): Promise<CourseResponseDto[]> {
    try {
      const result = await this.neo4jService.read(
        `MATCH (c:Course)
         WHERE NOT EXISTS {
           MATCH (:User {userId: $userId})-[:ENROLLED_IN]->(c)
         }
         RETURN c
         ORDER BY c.createdAt DESC`,
        { userId }
      );

      return result.records.map(record => {
        const course = record.get('c').properties;
        return {
          courseId: course.courseId,
          title: course.title,
          complexity: course.complexity,
          topic: course.topic,
          createdAt: formatNeo4jDate(course.createdAt)
        };
      });
    } catch (error) {
      throw new InternalServerErrorException(error)
    }
  }

  async getEnrolledCourses(userId: string): Promise<CourseResponseDto[]> {
    const result = await this.neo4jService.read(
      `MATCH (u:User {userId: $userId})-[r:ENROLLED_IN]->(c:Course)
       RETURN c, r.lastInteracted AS lastInteracted
       ORDER BY r.lastInteracted DESC`,
      { userId }
    );
  
    const courses = await Promise.all(result.records.map(async (record) => {
      const course = record.get('c').properties;
      const lastInteracted = record.get('lastInteracted');
      
      const progress = await this.courseProgressService.getUserProgress(course.courseId, userId);
      const totalItems = await this.courseProgressService.getTotalItemsCount(course.courseId);
      const isCompleted = totalItems > 0 && progress.finishedCount >= totalItems;
      const progressPercentage = totalItems > 0 
        ? Math.round((progress.finishedCount / totalItems) * 100)
        : 0;
  
      return {
        courseId: course.courseId,
        title: course.title,
        complexity: course.complexity,
        topic: course.topic,
        createdAt: formatNeo4jDate(course.createdAt),
        lastInteracted: lastInteracted ? formatNeo4jDate(lastInteracted) : formatNeo4jDate(course.createdAt),
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

  async enrollInCourse(courseId: string, userId: string): Promise<void> {
    // Check if the course exists
    const courseExists = await this.neo4jService.read(
      `MATCH (c:Course {courseId: $courseId}) RETURN c`,
      { courseId }
    );

    if (courseExists.records.length === 0) {
      throw new NotFoundException('Course not found');
    }

    // Check if the user is already enrolled in the course
    const alreadyEnrolled = await this.neo4jService.read(
      `MATCH (u:User {userId: $userId})-[:ENROLLED_IN]->(c:Course {courseId: $courseId})
      RETURN COUNT(u) AS count`,
      { userId, courseId }
    );

    if (alreadyEnrolled.records[0].get('count').toInt() > 0) {
      throw new BadRequestException('User is already enrolled in this course');
    }

    // Enroll the user in the course
    await this.neo4jService.write(
      `
      MATCH (u:User {userId: $userId}), (c:Course {courseId: $courseId})
      MERGE (u)-[:ENROLLED_IN {at: datetime()}]->(c)
      `,
      { userId, courseId }
    );
  }
}