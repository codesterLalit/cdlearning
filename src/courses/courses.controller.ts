// courses/courses.controller.ts
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
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
    @Query('questionId') questionId: string,
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
  ): Promise<{ success: boolean }> {
    const userId = req.user.sub;
    await this.coursesService.markContentAsFinished(
      finishContentDto.courseId,
      userId,
      finishContentDto.contentId,
      finishContentDto.type
    );
    return { success: true };
  }
}