// courses/courses.controller.ts
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { CourseResponseDto } from './dto/course-response.dto';
import { LearnResponseDto } from './dto/learn-response.dto';
import { FinishContentDto } from './dto/finish-content.dto';
import { UUIDTypes } from 'uuid';

@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) { }

  @Post()
  @UseGuards(AuthGuard)
  async createCourse(@Body() createCourseDto: CreateCourseDto, @Req() req) {
    const userId = req.user.sub; // From JWT
    return this.coursesService.createOrEnrollCourse(createCourseDto, userId);
  }

  @Get('available')
  @UseGuards(AuthGuard)
  async getAvailableCourses(@Req() req): Promise<CourseResponseDto[]> {
    const userId = req.user.sub;
    return this.coursesService.getAvailableCourses(userId);
  }

  @Get('enrolled')
  @UseGuards(AuthGuard)
  async getEnrolledCourses(@Req() req): Promise<CourseResponseDto[]> {
    const userId = req.user.sub;
    return this.coursesService.getEnrolledCourses(userId);
  }

  @Get('learn/:courseId')
  @UseGuards(AuthGuard)
  async getLearningContent(
    @Param('courseId') courseId: string,
    @Query('questionId') questionId: UUIDTypes,
    @Req() req
  ): Promise<LearnResponseDto> {
    const userId = req.user.sub;
    return this.coursesService.getLearningContent(courseId, userId, questionId);
  }

  @Post('finish-content')
  @UseGuards(AuthGuard)
  async finishContent(
    @Body() finishContentDto: FinishContentDto,
    @Req() req
  ): Promise<{
    success: boolean;
    completed: boolean;
    totalContent: number;
    progress: number;
    progressPercentage: number;
  }> {
    const userId = req.user.sub;
    const { courseId, contentId, type } = finishContentDto;

    const {
      totalProgress,
      completed,
      totalContent,
      progress,
      progressPercentage
    } = await this.coursesService.markContentAsFinished(
      courseId,
      userId,
      contentId,
      type
    );

    return {
      success: true,
      completed,
      totalContent,
      progress,
      progressPercentage
    };
  }


  @Post('enroll')
  @UseGuards(AuthGuard)
  async enrollInCourse(
    @Body() body: { courseId: string },
    @Req() req
  ): Promise<{ success: boolean }> {
    const userId = req.user.sub;
    const { courseId } = body;

    await this.coursesService.enrollInCourse(courseId, userId);

    return { success: true };
  }


  @Delete(':courseId/progress')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async resetProgress(
    @Param('courseId') courseId: string,
    @Request() req: any
  ) {
    return this.coursesService.resetCourseProgress(courseId, req.user.sub);
  }

}