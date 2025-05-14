// courses/course-creation.service.ts
import { Injectable } from '@nestjs/common';
import { Neo4jService } from 'nest-neo4j';
import { BadRequestException } from '@nestjs/common';
import * as levenshtein from 'fastest-levenshtein';
import { v4 as uuidv4 } from 'uuid';
import { CourseGenerator } from 'src/common/utils/llm-utils';
import { CreateCourseDto } from './dto/create-course.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CourseCreationService {
  private courseGenerator: CourseGenerator;

  constructor(private readonly neo4jService: Neo4jService, private configService: ConfigService) {
    this.courseGenerator = new CourseGenerator(configService);
  }

  async createOrEnrollCourse(createCourseDto: CreateCourseDto, userId: string) {
    // First check for similar existing courses
    const existingCourse = await this.findSimilarCourse(createCourseDto.topic, createCourseDto.complexity);

    const isTopicValidForCourse = await this.courseGenerator.validateTopic(createCourseDto.topic)

    if(!isTopicValidForCourse.canBeCourse) {
      throw new BadRequestException(isTopicValidForCourse.reason)
    }

    if (existingCourse) {
      // Enroll user in existing course
      await this.enrollUserInCourse(userId, existingCourse.courseId);
      return {
        message: 'Enrolled in existing similar course',
        course: existingCourse,
        enrolled: true
      };
    }

    // Generate new course
    const generatedCourse = await this.courseGenerator.generate(
      createCourseDto.topic,
      createCourseDto.complexity
    );

    // Import to Neo4j
    const courseId = await this.importCourseToNeo4j(generatedCourse, createCourseDto.topic);

    // Associate user with course as creator
    await this.neo4jService.write(
      `MATCH (u:User {userId: $userId})
       MATCH (c:Course {courseId: $courseId})
       MERGE (u)-[:CREATED]->(c)
       MERGE (u)-[:ENROLLED_IN]->(c)`,
      { userId, courseId }
    );

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

  private async findSimilarCourse(topic: string, complexity: string, threshold = 3) {
    const result = await this.neo4jService.read(
      `MATCH (c:Course) RETURN c`,
      {}
    );

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

  private async enrollUserInCourse(userId: string, courseId: string) {
    await this.neo4jService.write(
      `MATCH (u:User {userId: $userId})
       MATCH (c:Course {courseId: $courseId})
       MERGE (u)-[:ENROLLED_IN]->(c)`,
      { userId, courseId }
    );
  }

  private async importCourseToNeo4j(courseData: any, topic: string) {
    const courseId = uuidv4();
    try {
      // Create Course node
      await this.neo4jService.write(
        `CREATE (course:Course {
          courseId: $courseId,
          title: $title,
          topic: $topic,
          complexity: $complexity,
          createdAt: datetime()
        })`,
        {
          courseId,
          title: courseData.Course,
          topic,
          complexity: courseData.complexity
        }
      );

      // Process chapters
      for (const chapter of courseData.chapters) {
        const chapterId = uuidv4();

        await this.neo4jService.write(
          `MATCH (course:Course {courseId: $courseId})
           CREATE (chapter:Chapter {
             chapterId: $chapterId,
             title: $chapterTitle,
             content: $chapterContent,
             serialNumber: $serialNumber
           })
           CREATE (course)-[:HAS_CHAPTER]->(chapter)
           CREATE (chapter)-[:BELONGS_TO]->(course)`,
          { 
            courseId, 
            chapterId, 
            chapterTitle: chapter.title, 
            chapterContent: chapter.content,
            serialNumber: chapter.serialNumber 
          }
        );

        // Process chapter questions
        for (const question of chapter.questions) {
          const questionId = uuidv4();
          const answerId = uuidv4();

          await this.neo4jService.write(
            `MATCH (chapter:Chapter {chapterId: $chapterId})
             CREATE (question:Question {
               questionId: $questionId,
               text: $questionText
             })
             CREATE (answer:Answer {
               answerId: $answerId,
               text: $answerText
             })
             CREATE (chapter)-[:HAS_QUESTION]->(question)
             CREATE (question)-[:HAS_ANSWER]->(answer)`,
            {
              chapterId,
              questionId,
              questionText: question.question,
              answerId,
              answerText: question.answer
            }
          );
        }

        // Process sub-content
        for (const subContent of chapter.sub_content) {
          const subContentId = uuidv4();

          // Create SubContent node
          await this.neo4jService.write(
            `MATCH (chapter:Chapter {chapterId: $chapterId})
             CREATE (subContent:SubContent {
               subContentId: $subContentId,
               title: $subContentTitle,
               content: $subContentContent,
               serialNumber: $serialNumber
             })
             CREATE (chapter)-[:HAS_SUBCONTENT]->(subContent)
             CREATE (subContent)-[:BELONGS_TO]->(chapter)`,
            {
              chapterId,
              subContentId,
              subContentTitle: subContent.title,
              subContentContent: subContent.content,
              serialNumber: subContent.serialNumber,
            }
          );

          // Process sub-content questions
          for (const question of subContent.questions) {
            const questionId = uuidv4();
            const answerId = uuidv4();

            await this.neo4jService.write(
              `MATCH (subContent:SubContent {subContentId: $subContentId})
               CREATE (question:Question {
                 questionId: $questionId,
                 text: $questionText
               })
               CREATE (answer:Answer {
                 answerId: $answerId,
                 text: $answerText
               })
               CREATE (subContent)-[:HAS_QUESTION]->(question)
               CREATE (question)-[:HAS_ANSWER]->(answer)`,
              {
                subContentId,
                questionId,
                questionText: question.question,
                answerId,
                answerText: question.answer
              }
            );
          }
        }
      }

      return courseId;
    } catch (error) {
      console.error('Error importing course:', error);
      throw new Error('Failed to import course to database');
    }
  }
}