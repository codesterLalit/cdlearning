// courses/courses.controller.ts
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { CourseResponseDto } from './dto/course-response.dto';
import { LearnResponseDto } from './dto/learn-response.dto';
import { FinishContentDto } from './dto/finish-content.dto';

@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) { }

  @Post()
  @UseGuards(AuthGuard)
  async createCourse(@Body() createCourseDto: CreateCourseDto, @Req() req) {
    const userId = req.user.sub; // From JWT
    return this.coursesService.creation.createOrEnrollCourse(createCourseDto, userId);
  }

  @Get('available')
  @UseGuards(AuthGuard)
  async getAvailableCourses(@Req() req): Promise<CourseResponseDto[]> {
    const userId = req.user.sub;
    return this.coursesService.enrollment.getAvailableCourses(userId);
  }

  @Get('enrolled')
  @UseGuards(AuthGuard)
  async getEnrolledCourses(@Req() req): Promise<CourseResponseDto[]> {
    const userId = req.user.sub;
    return this.coursesService.enrollment.getEnrolledCourses(userId);
  }

  @Get('learn/:courseId')
  @UseGuards(AuthGuard)
  async getLearningContent(
    @Param('courseId') courseId: string,
    @Query('questionId') questionId: string,
    @Query('contentId') contentId: string,
    @Req() req
  ): Promise<LearnResponseDto> {
    const userId = req.user.sub;
    return this.coursesService.learning.getLearningContent(courseId, userId, questionId, contentId);
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
    lastInteracted: number | string
  }> {
    const userId = req.user.sub;
    const { courseId, contentId, type } = finishContentDto;

    const {
      totalProgress,
      completed,
      totalContent,
      progress,
      progressPercentage,
      lastInteracted
    } = await this.coursesService.progress.markContentAsFinished(
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
      progressPercentage,
      lastInteracted
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

    await this.coursesService.enrollment.enrollInCourse(courseId, userId);

    return { success: true };
  }


  @Delete(':courseId/progress')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async resetProgress(
    @Param('courseId') courseId: string,
    @Request() req: any
  ) {
    return this.coursesService.progress.resetCourseProgress(courseId, req.user.sub);
  }

}