// courses/courses.service.ts
import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Neo4jService } from 'nest-neo4j';
import { CreateCourseDto } from './dto/create-course.dto';
import * as levenshtein from 'fastest-levenshtein';
import { v4 as uuidv4 } from 'uuid';
import { CourseGenerator } from 'src/common/utils/llm-utils';
import { CourseResponseDto } from './dto/course-response.dto';
import { formatNeo4jDate } from 'src/common/utils/neo4j-date-util';
import { LearnResponseDto } from './dto/learn-response.dto';

@Injectable()
export class CoursesService {
  private courseGenerator: CourseGenerator;

  constructor(private readonly neo4jService: Neo4jService) {
    this.courseGenerator = new CourseGenerator();
  }

  async createOrEnrollCourse(createCourseDto: CreateCourseDto, userId: string) {
    // First check for similar existing courses
    const existingCourse = await this.findSimilarCourse(createCourseDto.topic, createCourseDto.complexity);

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
             content: $chapterContent
           })
           CREATE (course)-[:HAS_CHAPTER]->(chapter)
           CREATE (chapter)-[:BELONGS_TO]->(course)`,
          { courseId, chapterId, chapterTitle: chapter.title, chapterContent: chapter.content }
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
             CREATE (chapter)-[:HAS_SUBCONTENT]->(subContent)
             CREATE (subContent)-[:BELONGS_TO]->(chapter)`,
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

  async getEnrolledCourses(userId: string): Promise<CourseResponseDto[]> {
    const result = await this.neo4jService.read(
      `MATCH (u:User {userId: $userId})-[:ENROLLED_IN]->(c:Course)
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
        createdAt: formatNeo4jDate(course.createdAt)
      };
    });
  }



  // main feature
  // courses/courses.service.ts
  async getLearningContent(courseId: string, userId: string, questionId?: string): Promise<LearnResponseDto> {
    // Verify user is enrolled
    const isEnrolled = await this.neo4jService.read(
      `MATCH (u:User {userId: $userId})-[:ENROLLED_IN]->(c:Course {courseId: $courseId})
       RETURN COUNT(u) > 0 AS enrolled`,
      { userId, courseId }
    );

    if (!isEnrolled.records[0].get('enrolled')) {
      throw new NotFoundException('User is not enrolled in this course');
    }
    if (questionId) {
      return this.getQuestionWithAnswer(courseId, userId, questionId);
    }

    // Get next content based on progress
    const progress = await this.getUserProgress(courseId, userId);

    if (progress.finishedCount === 0) {
      return this.getFirstChapterContent(courseId, userId);
    }

    return this.getNextUnfinishedContent(courseId, userId, progress);
  }

  private async getQuestionWithAnswer(courseId: string, userId: string, questionId: string): Promise<LearnResponseDto> {
    const result = await this.neo4jService.read(
      `
        MATCH (u:User {userId: $userId})-[:ENROLLED_IN]->(c:Course {courseId: $courseId})
        MATCH (q:Question {questionId: $questionId})-[:HAS_ANSWER]->(a:Answer)
        MATCH (parent)-[:HAS_QUESTION]->(q)
        WITH u, q, a, parent, labels(parent) AS parentLabels
        OPTIONAL MATCH (parent)-[:HAS_QUESTION]->(recommended:Question)
        WHERE recommended.questionId <> q.questionId AND NOT EXISTS {
          MATCH (u)-[:ANSWERED]->(recommended)
        }
        RETURN q, a, parent, parentLabels,
              COLLECT(DISTINCT recommended) AS recommendedQuestions`,
      { userId, courseId, questionId }
    );

    if (result.records.length === 0) {
      throw new NotFoundException('Question not found');
    }

    const record = result.records[0];
    const question = record.get('q').properties;
    const answer = record.get('a').properties;
    const parent = record.get('parent').properties;
    const parentLabels = record.get('parentLabels');
    const recommendedRaw = record.get('recommendedQuestions');

    const type = parentLabels.includes('Chapter') ? 'content' : 'subcontent';

    const recommendedQuestions = recommendedRaw
      .filter(q => q) // Avoid nulls
      .slice(0, 5)
      .map(q => ({
        id: q.properties.questionId,
        text: q.properties.text
      }));

    return {
      type,
      id: parent.chapterId || parent.subContentId,
      title: parent.title,
      text: parent.content,
      recommendedQuestions,
      requestedQuestion: {
        id: questionId,
        text: question.text,
        answer: answer.text
      },
      currentProgress: await this.getProgressCount(courseId, userId),
      totalItems: await this.getTotalItemsCount(courseId)
    };
  }


  private async getFirstChapterContent(courseId: string, userId: string): Promise<LearnResponseDto> {
    try {
      const result = await this.neo4jService.read(
        `MATCH (u:User {userId: $userId})
       MATCH (c:Course {courseId: $courseId})-[:HAS_CHAPTER]->(chapter:Chapter)
       WITH u, chapter ORDER BY chapter.createdAt LIMIT 1
       OPTIONAL MATCH (chapter)-[:HAS_QUESTION]->(question:Question)
       WHERE NOT (u)-[:ANSWERED]->(question)
       RETURN chapter, COLLECT(DISTINCT question)[0..5] AS questions`,
        { courseId, userId }
      );

      if (result.records.length === 0) {
        throw new NotFoundException('No chapters found in this course');
      }

      const record = result.records[0];
      const chapter = record.get('chapter').properties;
      const questions = record.get('questions').map(q => ({
        id: q.properties.questionId,
        text: q.properties.text
      }));

      return {
        type: 'content',
        id: chapter.chapterId,
        title: chapter.title,
        text: chapter.content,
        questions,
        currentProgress: 0,
        totalItems: await this.getTotalItemsCount(courseId)
      };
    } catch (error) {
      console.error(error)
      throw new InternalServerErrorException(error)
    }
  }

  private async getNextUnfinishedContent(courseId: string, userId: string, progress: any): Promise<LearnResponseDto> {
    // Get the last answered question to determine context
    const lastQuestion = await this.neo4jService.read(
      `MATCH (u:User {userId: $userId})-[:ANSWERED]->(q:Question)
     WHERE (q)-[:BELONGS_TO]->(:Course {courseId: $courseId})
     RETURN q ORDER BY q.answeredAt DESC LIMIT 1`,
      { userId, courseId }
    );

    if (lastQuestion.records.length > 0) {
      const lastQ = lastQuestion.records[0].get('q').properties;
      return this.getNextContentBasedOnQuestion(courseId, userId, lastQ.questionId);
    }

    // Fallback to content-based progression
    return this.getNextUnfinishedChapter(courseId, userId);
  }

  private async getNextContentBasedOnQuestion(courseId: string, userId: string, lastQuestionId: string): Promise<LearnResponseDto> {
    // Find connected content that hasn't been finished
    const result = await this.neo4jService.read(
      `MATCH (u:User {userId: $userId})-[:ANSWERED]->(q:Question {questionId: $lastQuestionId})
     MATCH (q)<-[:HAS_QUESTION]-(parent)
     WITH u, parent
     OPTIONAL MATCH (parent)-[:NEXT|HAS_SUBCONTENT]->(nextContent)
     WHERE NOT (u)-[:FINISHED]->(nextContent)
     WITH u, nextContent ORDER BY nextContent.createdAt LIMIT 1
     OPTIONAL MATCH (nextContent)-[:HAS_QUESTION]->(question:Question)
     WHERE NOT (u)-[:ANSWERED]->(question)
     RETURN nextContent, labels(nextContent) AS contentLabels, 
            COLLECT(DISTINCT question)[0..5] AS questions`,
      { userId, courseId, lastQuestionId }
    );

    if (result.records.length === 0) {
      return this.getNextUnfinishedChapter(courseId, userId);
    }

    const record = result.records[0];
    const content = record.get('nextContent').properties;
    const contentLabels = record.get('contentLabels');
    const questions = record.get('questions').map(q => ({
      id: q.properties.questionId,
      text: q.properties.text
    }));

    const type = contentLabels.includes('Chapter') ? 'content' : 'subcontent';

    return {
      type,
      id: content.chapterId || content.subContentId,
      title: content.title,
      text: content.content,
      questions,
      currentProgress: await this.getProgressCount(courseId, userId),
      totalItems: await this.getTotalItemsCount(courseId)
    };
  }

  // Helper methods
  private async getProgressCount(courseId: string, userId: string): Promise<number> {
    const result = await this.neo4jService.read(
      `MATCH (u:User {userId: $userId})-[:FINISHED]->(finished)
     WHERE (finished:Chapter)-[:BELONGS_TO]->(:Course {courseId: $courseId}) OR
           (finished:SubContent)-[:BELONGS_TO]->(:Course {courseId: $courseId})
     RETURN COUNT(DISTINCT finished) AS count`,
      { userId, courseId }
    );
    return result.records[0].get('count').toNumber();
  }

  private async getTotalItemsCount(courseId: string): Promise<number> {
    const result = await this.neo4jService.read(
      `MATCH (c:Course {courseId: $courseId})-[:HAS_CHAPTER]->(chapter:Chapter)
     OPTIONAL MATCH (chapter)-[:HAS_SUBCONTENT*]->(subcontent:SubContent)
     WITH COLLECT(chapter) + COLLECT(subcontent) AS allContents
     UNWIND allContents AS content
     RETURN COUNT(DISTINCT content) AS total`,
      { courseId }
    );
    return result.records[0].get('total').toNumber();
  }

  private async getUserProgress(courseId: string, userId: string): Promise<{ finishedCount: number }> {
    const result = await this.neo4jService.read(
      `MATCH (u:User {userId: $userId})-[:FINISHED]->(content)
     WHERE (content)-[:BELONGS_TO]->(:Course {courseId: $courseId})
     RETURN COUNT(content) AS finishedCount`,
      { userId, courseId }
    );

    return {
      finishedCount: result.records[0].get('finishedCount').toNumber()
    };
  }

  private async getNextUnfinishedChapter(courseId: string, userId: string): Promise<LearnResponseDto> {
    // Find the earliest chapter that hasn't been finished
    const result = await this.neo4jService.read(
      `MATCH (u:User {userId: $userId})
     MATCH (c:Course {courseId: $courseId})-[:HAS_CHAPTER]->(chapter:Chapter)
     WHERE NOT (u)-[:FINISHED]->(chapter)
     WITH u, chapter ORDER BY chapter.createdAt LIMIT 1
     OPTIONAL MATCH (chapter)-[:HAS_QUESTION]->(question:Question)
     WHERE NOT (u)-[:ANSWERED]->(question)
     RETURN chapter, COLLECT(DISTINCT question)[0..5] AS questions`,
      { courseId, userId }
    );

    if (result.records.length === 0) {
      // If all chapters are finished, check for unfinished subcontent
      return this.getNextUnfinishedSubContent(courseId, userId);
    }

    const record = result.records[0];
    const chapter = record.get('chapter').properties;
    const questions = record.get('questions').map(q => ({
      id: q.properties.questionId,
      text: q.properties.text
    }));

    return {
      type: 'content',
      id: chapter.chapterId,
      title: chapter.title,
      text: chapter.content,
      questions,
      currentProgress: await this.getProgressCount(courseId, userId),
      totalItems: await this.getTotalItemsCount(courseId)
    };
  }

  private async getNextUnfinishedSubContent(courseId: string, userId: string): Promise<LearnResponseDto> {
    // Find the earliest subcontent that hasn't been finished
    const result = await this.neo4jService.read(
      `MATCH (u:User {userId: $userId})
     MATCH (c:Course {courseId: $courseId})-[:HAS_CHAPTER]->(chapter:Chapter)
     MATCH (chapter)-[:HAS_SUBCONTENT]->(subcontent:SubContent)
     WHERE NOT (u)-[:FINISHED]->(subcontent)
     WITH u, subcontent ORDER BY subcontent.createdAt LIMIT 1
     OPTIONAL MATCH (subcontent)-[:HAS_QUESTION]->(question:Question)
     WHERE NOT (u)-[:ANSWERED]->(question)
     RETURN subcontent, COLLECT(DISTINCT question)[0..5] AS questions`,
      { courseId, userId }
    );

    if (result.records.length === 0) {
      throw new NotFoundException('No unfinished content found in this course');
    }

    const record = result.records[0];
    const subcontent = record.get('subcontent').properties;
    const questions = record.get('questions').map(q => ({
      id: q.properties.questionId,
      text: q.properties.text
    }));

    return {
      type: 'subcontent',
      id: subcontent.subContentId,
      title: subcontent.title,
      text: subcontent.content,
      questions,
      currentProgress: await this.getProgressCount(courseId, userId),
      totalItems: await this.getTotalItemsCount(courseId)
    };
  }



  // Finish
  // src/courses/courses.service.ts
  async markContentAsFinished(
    courseId: string,
    userId: string,
    contentId: string,
    type: 'content' | 'subcontent'
  ): Promise<void> {
    try {

      const label = type === 'content' ? 'Chapter' : 'SubContent';
      const idProperty = type === 'content' ? 'chapterId' : 'subContentId';

      // Verify content exists and belongs to course
      const contentExists = await this.neo4jService.read(
        `MATCH (c:Course {courseId: $courseId})-[:HAS_CHAPTER]->()-[:HAS_SUBCONTENT*0..1]->(content:${label} {${idProperty}: $contentId})
     RETURN COUNT(content) > 0 AS exists`,
        { courseId, contentId }
      );

      if (!contentExists.records[0].get('exists')) {
        throw new NotFoundException('Content not found in this course');
      }

      // Mark content as finished
      await this.neo4jService.write(
        `MATCH (u:User {userId: $userId})
     MATCH (content:${label} {${idProperty}: $contentId})
     WHERE NOT (u)-[:FINISHED]->(content)
     MERGE (u)-[:FINISHED {at: datetime()}]->(content)`,
        { userId, contentId }
      );

      // Mark all questions under this content as answered
      await this.neo4jService.write(
        `MATCH (u:User {userId: $userId})
     MATCH (content:${label} {${idProperty}: $contentId})
     OPTIONAL MATCH (content)-[:HAS_QUESTION]->(q1:Question)
     OPTIONAL MATCH (content)-[:HAS_SUBCONTENT*]->(sub)-[:HAS_QUESTION]->(q2:Question)
     WITH u, collect(DISTINCT q1) + collect(DISTINCT q2) AS questions
     UNWIND questions AS q
     WITH u, q
     WHERE q IS NOT NULL AND NOT (u)-[:ANSWERED]->(q)
     MERGE (u)-[:ANSWERED {at: datetime()}]->(q)`,
        { userId, contentId }
      );
    } catch (error) {
      throw new InternalServerErrorException(error)
    }
  }
}