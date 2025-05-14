// courses/courses.module.ts
import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { Neo4jModule } from 'nest-neo4j';
import { JwtModule } from '@nestjs/jwt';
import { CourseProgressService } from './course-progress.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [Neo4jModule, JwtModule, ConfigModule],
  controllers: [CoursesController],
  providers: [CoursesService, CourseProgressService],
})
export class CoursesModule {}