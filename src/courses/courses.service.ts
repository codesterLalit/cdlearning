// courses/courses.service.ts
import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Neo4jService } from 'nest-neo4j';
import { CreateCourseDto } from './dto/create-course.dto';
import * as levenshtein from 'fastest-levenshtein';
import { UUIDTypes, v4 as uuidv4 } from 'uuid';
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
      
      const progress = await this.getUserProgress(course.courseId, userId);
      const totalItems = await this.getTotalItemsCount(course.courseId);
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

  async getLearningContent(courseId: string, userId: string, questionId?: string, contentId?: string): Promise<LearnResponseDto> {
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
    const totalCount = await this.getTotalItemsCount(courseId)

    if(progress.finishedCount == totalCount) {
      const hierarchy = await this.getCourseHierarchy(courseId);
      return {
          type: 'content',
          id: '',
          title: '',
          text: '',
          recommendedQuestions: [],
          currentProgress: progress.finishedCount,
          totalItems: totalCount,
          courseHierarchy: hierarchy
      }
    }

    if (progress.finishedCount === 0) {
      return this.getFirstChapterContent(courseId, userId);
    }

    return this.getNextUnfinishedItem(courseId, userId);
  }

  private async getCourseHierarchy(courseId: string, currentContentId?: string): Promise<LearnResponseDto['courseHierarchy']> {
    const result = await this.neo4jService.read(
      `MATCH (c:Course {courseId: $courseId})-[:HAS_CHAPTER]->(chapter:Chapter)
        OPTIONAL MATCH (chapter)-[:HAS_SUBCONTENT]->(subcontent:SubContent)
        RETURN chapter, subcontent
        ORDER BY chapter.serialNumber, subcontent.serialNumber`,
      { courseId }
    );

    const hierarchy: LearnResponseDto['courseHierarchy'] = [];

    result.records.forEach(record => {
      const chapter = record.get('chapter');
      const subcontent = record.get('subcontent');

      if (chapter) {
        const chapterId = chapter.properties.chapterId;
        if (!hierarchy.some(item => item.id === chapterId)) {
          hierarchy.push({
            id: chapterId,
            type: 'content',
            title: chapter.properties.title,
            serialNumber: chapter.properties.serialNumber,
            parentId: undefined,
            current: currentContentId === chapterId
          });
        }
      }

      if (subcontent) {
        const subContentId = subcontent.properties.subContentId;
        if (!hierarchy.some(item => item.id === subContentId)) {
          hierarchy.push({
            id: subContentId,
            type: 'subcontent',
            title: subcontent.properties.title,
            serialNumber: subcontent.properties.serialNumber,
            parentId: chapter?.properties.chapterId,
            current: currentContentId === subContentId
          });
        }
      }
    });

    return hierarchy;
  }

  private async getRecommendedQuestions(courseId: string, userId: string, currentContentId?: string): Promise<{ id: string; text: string }[]> {
    // First try to get questions from current content's subcontents
    let result = await this.neo4jService.read(
      `MATCH (u:User {userId: $userId})-[:ENROLLED_IN]->(c:Course {courseId: $courseId})
       MATCH (content {chapterId: $currentContentId})-[:HAS_SUBCONTENT]->(subcontent)-[:HAS_QUESTION]->(q:Question)
       WHERE NOT (u)-[:ANSWERED]->(q)
       RETURN q
       ORDER BY subcontent.serialNumber, q.text
       LIMIT 5`,
      { userId, courseId, currentContentId }
    );

    let questions = result.records.map(r => ({
      id: r.get('q').properties.questionId,
      text: r.get('q').properties.text
    }));

    // If we didn't get enough questions, get from current content
    if (questions.length < 5 && currentContentId) {
      result = await this.neo4jService.read(
        `MATCH (u:User {userId: $userId})-[:ENROLLED_IN]->(c:Course {courseId: $courseId})
         MATCH (content {chapterId: $currentContentId})-[:HAS_QUESTION]->(q:Question)
         WHERE NOT (u)-[:ANSWERED]->(q)
         RETURN q
         ORDER BY q.text
         LIMIT ${5 - questions.length}`,
        { userId, courseId, currentContentId }
      );

      questions = questions.concat(result.records.map(r => ({
        id: r.get('q').properties.questionId,
        text: r.get('q').properties.text
      })));
    }

    // If we still didn't get enough questions, get from next content in sequence
    if (questions.length < 5) {
      const currentContent = currentContentId 
        ? await this.neo4jService.read(
            `MATCH (c:Course {courseId: $courseId})-[:HAS_CHAPTER]->(content)
             WHERE content.chapterId = $currentContentId OR content.subContentId = $currentContentId
             RETURN content.serialNumber AS serialNumber, labels(content) AS labels`,
            { courseId, currentContentId }
          )
        : { records: [] };

      const currentSerial = currentContent.records[0]?.get('serialNumber') || 0;
      const isChapter = currentContent.records[0]?.get('labels')?.includes('Chapter');

      result = await this.neo4jService.read(
        `MATCH (u:User {userId: $userId})-[:ENROLLED_IN]->(c:Course {courseId: $courseId})
         MATCH (c)-[:HAS_CHAPTER]->(chapter)-[:HAS_SUBCONTENT*0..1]->(content)-[:HAS_QUESTION]->(q:Question)
         WHERE NOT (u)-[:ANSWERED]->(q)
           AND (
             (chapter.serialNumber > ${currentSerial})
             OR (chapter.serialNumber = ${currentSerial} AND ${isChapter ? 'true' : 'false'})
           )
         RETURN q, content.serialNumber AS contentSerial
         ORDER BY contentSerial, q.text
         LIMIT ${5 - questions.length}`,
        { userId, courseId }
      );

      questions = questions.concat(result.records.map(r => ({
        id: r.get('q').properties.questionId,
        text: r.get('q').properties.text
      })));
    }

    return questions;
  }

  private async getNextUnfinishedItem(courseId: string, userId: string): Promise<LearnResponseDto> {
    try {
      const result = await this.neo4jService.read(
        `MATCH (u:User {userId: $userId})
         MATCH (c:Course {courseId: $courseId})-[:HAS_CHAPTER]->(chapter:Chapter)
         OPTIONAL MATCH (chapter)-[:HAS_SUBCONTENT]->(subcontent:SubContent)
         
         WITH u, c, COLLECT(chapter) + COLLECT(subcontent) AS allContents
         UNWIND allContents AS content
         WITH u, content
         WHERE content IS NOT NULL
            AND NOT (u)-[:FINISHED]->(content)
         
         WITH u, content 
         ORDER BY content.serialNumber 
         LIMIT 1
         
         RETURN content, labels(content) AS contentLabels`,
        { courseId, userId }
      );

      if (result.records.length === 0) {
        throw new NotFoundException('No unfinished content found in this course');
      }

      const record = result.records[0];
      const content = record.get('content').properties;
      const contentLabels = record.get('contentLabels');
      const type = contentLabels.includes('Chapter') ? 'content' : 'subcontent';
      const id = content.chapterId || content.subContentId;

      const questions = await this.getRecommendedQuestions(courseId, userId, id);
      const hierarchy = await this.getCourseHierarchy(courseId, id);

      return {
        type,
        id,
        title: content.title,
        text: content.content,
        recommendedQuestions: questions,
        currentProgress: (await this.getUserProgress(courseId, userId)).finishedCount,
        totalItems: await this.getTotalItemsCount(courseId),
        courseHierarchy: hierarchy
      };
    } catch (error) {
      console.error(error);
      throw new InternalServerErrorException('Failed to fetch learning content');
    }
  }

  private async getQuestionWithAnswer(courseId: string, userId: string, questionId: string): Promise<LearnResponseDto> {
    try {
      const result = await this.neo4jService.read(
        `MATCH (u:User {userId: $userId})-[:ENROLLED_IN]->(c:Course {courseId: $courseId})
         MATCH (q:Question {questionId: $questionId})-[:HAS_ANSWER]->(a:Answer)
         MATCH (parent)-[:HAS_QUESTION]->(q)
         RETURN q, a, parent, labels(parent) AS parentLabels`,
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
      const type = parentLabels.includes('Chapter') ? 'content' : 'subcontent';
      const id = parent.chapterId || parent.subContentId;

      const questions = await this.getRecommendedQuestions(courseId, userId, id);
      const hierarchy = await this.getCourseHierarchy(courseId, id);

      return {
        type,
        id,
        title: parent.title,
        text: parent.content,
        recommendedQuestions: questions,
        requestedQuestion: {
          id: questionId,
          text: question.text,
          answer: answer.text
        },
        currentProgress: (await this.getUserProgress(courseId, userId)).finishedCount,
        totalItems: await this.getTotalItemsCount(courseId),
        courseHierarchy: hierarchy
      };
    } catch (error) {
      throw new InternalServerErrorException(error);
    }
  }

  private async getFirstChapterContent(courseId: string, userId: string): Promise<LearnResponseDto> {
    try {
      const result = await this.neo4jService.read(
        `MATCH (u:User {userId: $userId})
         MATCH (c:Course {courseId: $courseId})-[:HAS_CHAPTER]->(chapter:Chapter)
         WITH u, chapter 
         ORDER BY chapter.serialNumber 
         LIMIT 1
         RETURN chapter`,
        { courseId, userId }
      );

      if (result.records.length === 0) {
        throw new NotFoundException('No chapters found in this course');
      }

      const record = result.records[0];
      const chapter = record.get('chapter').properties;
      const questions = await this.getRecommendedQuestions(courseId, userId, chapter.chapterId);
      const hierarchy = await this.getCourseHierarchy(courseId, chapter.chapterId);

      return {
        type: 'content',
        id: chapter.chapterId,
        title: chapter.title,
        text: chapter.content,
        recommendedQuestions: questions,
        currentProgress: 0,
        totalItems: await this.getTotalItemsCount(courseId),
        courseHierarchy: hierarchy
      };
    } catch (error) {
      console.error(error);
      throw new InternalServerErrorException(error);
    }
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
       WHERE (content)-[:BELONGS_TO]->(:Course {courseId: $courseId}) OR
             (content)-[:BELONGS_TO]->(:Chapter)-[:BELONGS_TO]->(:Course {courseId: $courseId}) OR
             (content)-[:BELONGS_TO]->(:SubContent)-[:BELONGS_TO*]->(:Course {courseId: $courseId})
       RETURN COUNT(DISTINCT content) AS finishedCount`,
      { userId, courseId }
    );

    return {
      finishedCount: result.records[0].get('finishedCount').toNumber()
    };
  }

  async markContentAsFinished(
    courseId: string,
    userId: string,
    contentId: string,
    type: 'content' | 'subcontent'
  ): Promise<{
    totalProgress: number;
    completed: boolean;
    totalContent: number;
    progress: number;
    progressPercentage: number;
    lastInteracted: string | number;
  }> {
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
  
    // Use a single transaction for all updates
    const result = await this.neo4jService.write(
      `MATCH (u:User {userId: $userId})
       MATCH (content:${label} {${idProperty}: $contentId})
       WHERE NOT (u)-[:FINISHED]->(content)
       
       // Mark content as finished
       MERGE (u)-[:FINISHED {at: datetime()}]->(content)
       
       // Mark connected questions as answered
       WITH u, content
       MATCH (content)-[:HAS_QUESTION]->(q:Question)
       WHERE NOT (u)-[:ANSWERED]->(q)
       MERGE (u)-[:ANSWERED {at: datetime()}]->(q)
       
       // Update course interaction time
       WITH u
       MATCH (u)-[r:ENROLLED_IN]->(c:Course {courseId: $courseId})
       SET r.lastInteracted = datetime()
       
       // Return progress data
       WITH u, c
       MATCH (u)-[:FINISHED]->(finishedContent)
       WHERE (finishedContent)-[:BELONGS_TO*]->(c)
       WITH COUNT(DISTINCT finishedContent) AS finishedCount
       
       MATCH (c:Course {courseId: $courseId})
       OPTIONAL MATCH (c)-[:HAS_CHAPTER]->(ch:Chapter)
       OPTIONAL MATCH (ch)-[:HAS_SUBCONTENT*]->(sc:SubContent)
       WITH finishedCount, COUNT(DISTINCT ch) + COUNT(DISTINCT sc) AS totalContent
       
       RETURN finishedCount, totalContent, datetime() AS lastInteracted`,
      { userId, contentId, courseId }
    );
  
    const record = result.records[0];
    const finishedCount = record.get('finishedCount').toInt();
    const totalContent = record.get('totalContent').toInt();
    const lastInteracted = formatNeo4jDate(record.get('lastInteracted'));
  
    const progressPercentage = totalContent > 0 
      ? Math.round((finishedCount / totalContent) * 100) 
      : 0;
  
    return {
      totalProgress: finishedCount,
      completed: finishedCount >= totalContent,
      totalContent,
      progress: finishedCount,
      progressPercentage,
      lastInteracted
    };
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

  async resetCourseProgress(courseId: string, userId: string): Promise<{ message: string }> {
    // Verify user is enrolled in the course
    const isEnrolled = await this.neo4jService.read(
      `MATCH (u:User {userId: $userId})-[:ENROLLED_IN]->(c:Course {courseId: $courseId})
       RETURN COUNT(u) > 0 AS enrolled`,
      { userId, courseId }
    );

    if (!isEnrolled.records[0].get('enrolled')) {
      throw new NotFoundException('User is not enrolled in this course');
    }

    try {
      // Delete all FINISHED relationships for Chapters and SubContents in this course
      await this.neo4jService.write(
        `MATCH (u:User {userId: $userId})-[f:FINISHED]->(content)
         WHERE (content:Chapter)-[:BELONGS_TO]->(:Course {courseId: $courseId})
            OR (content:SubContent)-[:BELONGS_TO]->(:Chapter)-[:BELONGS_TO]->(:Course {courseId: $courseId})
         DELETE f`,
        { userId, courseId }
      );

      // Delete all ANSWERED relationships for Questions in this course
      // Including questions from Chapters and SubContents
      await this.neo4jService.write(
        `MATCH (u:User {userId: $userId})-[a:ANSWERED]->(q:Question)
         WHERE (q)<-[:HAS_QUESTION]-(:Chapter)-[:BELONGS_TO]->(:Course {courseId: $courseId})
            OR (q)<-[:HAS_QUESTION]-(:SubContent)-[:BELONGS_TO]->(:Chapter)-[:BELONGS_TO]->(:Course {courseId: $courseId})
         DELETE a`,
        { userId, courseId }
      );

      return { message: 'Course progress has been reset successfully' };
    } catch (error) {
      console.error('Error resetting course progress:', error);
      throw new InternalServerErrorException('Failed to reset course progress');
    }
  }
}