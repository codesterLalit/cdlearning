// courses/course-learning.service.ts
import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { Neo4jService } from 'nest-neo4j';
import { LearnResponseDto } from './dto/learn-response.dto';
import { CourseProgressService } from './course-progress.service';

@Injectable()
export class CourseLearningService {
  constructor(private readonly neo4jService: Neo4jService, private readonly courseProgressService: CourseProgressService) {}

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
    const progress = await this.courseProgressService.getUserProgress(courseId, userId);
    const totalCount = await this.courseProgressService.getTotalItemsCount(courseId)

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
       LIMIT 6`,
      { userId, courseId, currentContentId }
    );
  
    let questions = result.records.map(r => ({
      id: r.get('q').properties.questionId,
      text: r.get('q').properties.text
    }));
  
    let currentContentResult = await this.neo4jService.read(`
        MATCH (sc)
            WHERE 
            (sc:SubContent AND sc.subContentId = $contentId) OR 
            (sc:Chapter AND sc.chapterId = $contentId)
            MATCH (sc)-[:HAS_QUESTION]->(q:Question)
            RETURN q
        `, {contentId: currentContentId})


        let currentContentQuestions = currentContentResult.records.map(r => (r.get('q').properties.questionId));
          console.log(currentContentQuestions)
        
    // If we didn't get enough questions, get from current content
    if (questions.length < 6 && currentContentId) {
      result = await this.neo4jService.read(
        `MATCH (u:User {userId: $userId})-[:ENROLLED_IN]->(c:Course {courseId: $courseId})
         MATCH (content {chapterId: $currentContentId})-[:HAS_QUESTION]->(q:Question)
         WHERE NOT (u)-[:ANSWERED]->(q)
         RETURN q
         ORDER BY q.text
         LIMIT ${6 - questions.length}`,
        { userId, courseId, currentContentId }
      );
  
      questions = questions.concat(result.records.map(r => ({
        id: r.get('q').properties.questionId,
        text: r.get('q').properties.text
      })));
    }
  
    // If we still didn't get enough questions, get from next content in sequence
    if (questions.length < 6) {
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
         LIMIT ${6 - questions.length}`,
        { userId, courseId }
      );
  
      questions = questions.concat(result.records.map(r => ({
        id: r.get('q').properties.questionId,
        text: r.get('q').properties.text
      })));
    }
    
    questions = questions.filter((question=> !currentContentQuestions.includes(question.id)))
    let finalQuestions = questions.slice(0, 5)
    return finalQuestions;
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
        currentProgress: (await this.courseProgressService.getUserProgress(courseId, userId)).finishedCount,
        totalItems: await this.courseProgressService.getTotalItemsCount(courseId),
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
        currentProgress: (await this.courseProgressService.getUserProgress(courseId, userId)).finishedCount,
        totalItems: await this.courseProgressService.getTotalItemsCount(courseId),
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
        totalItems: await this.courseProgressService.getTotalItemsCount(courseId),
        courseHierarchy: hierarchy
      };
    } catch (error) {
      console.error(error);
      throw new InternalServerErrorException(error);
    }
  }
}