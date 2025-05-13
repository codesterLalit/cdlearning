// courses/course-progress.service.ts
import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { Neo4jService } from 'nest-neo4j';
import { formatNeo4jDate } from 'src/common/utils/neo4j-date-util';

@Injectable()
export class CourseProgressService {
  constructor(private readonly neo4jService: Neo4jService) {}

   async getTotalItemsCount(courseId: string): Promise<number> {
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

async getUserProgress(courseId: string, userId: string): Promise<{ finishedCount: number }> {
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