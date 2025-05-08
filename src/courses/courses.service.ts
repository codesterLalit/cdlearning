// courses/courses.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Neo4jService } from 'nest-neo4j';
import { CreateCourseDto } from './dto/create-course.dto';
import { GoogleGenAI } from '@google/genai';
import * as levenshtein from 'fastest-levenshtein';
import { v4 as uuidv4 } from 'uuid';
import { CourseGenerator } from 'src/common/utils/llm-utils';
import { CourseResponseDto } from './dto/course-response.dto';
import { formatNeo4jDate } from 'src/common/utils/neo4j-date-util';

@Injectable()
export class CoursesService {
  private courseGenerator:CourseGenerator;

  constructor(private readonly neo4jService: Neo4jService) {
    this.courseGenerator = new CourseGenerator();
  }

  async createOrEnrollCourse(createCourseDto: CreateCourseDto, userId: string) {
    // First check for similar existing courses
    const existingCourse = await this.findSimilarCourse(createCourseDto.topic);
    
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

  private async findSimilarCourse(topic: string, threshold = 3) {
    const result = await this.neo4jService.read(
      `MATCH (c:Course) RETURN c`,
      {}
    );

    for (const record of result.records) {
      const course = record.get('c').properties;
      const distance = levenshtein.distance(topic.toLowerCase(), course.title.toLowerCase());
      
      if (distance <= threshold) {
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

  private async importCourseToNeo4j(courseData: any, topic:string) {
    const courseId = uuidv4();
    
    try {
      // Create Course node
      await this.neo4jService.write(
        `CREATE (course:Course {
          courseId: $courseId,
          title: $title,
          topic: $topic 
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
        
        // Create Chapter node
        await this.neo4jService.write(
          `MATCH (course:Course {courseId: $courseId})
           CREATE (chapter:Chapter {
             chapterId: $chapterId,
             title: $chapterTitle,
             content: $chapterContent
           })
           CREATE (course)-[:HAS_CHAPTER]->(chapter)`,
          {
            courseId,
            chapterId,
            chapterTitle: chapter.title,
            chapterContent: chapter.content
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
               content: $subContentContent
             })
             CREATE (chapter)-[:HAS_SUBCONTENT]->(subContent)`,
            {
              chapterId,
              subContentId,
              subContentTitle: subContent.title,
              subContentContent: subContent.content
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
}