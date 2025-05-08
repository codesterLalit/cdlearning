// courses/courses.controller.ts
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CoursesService } from './courses.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { CourseResponseDto } from './dto/course-response.dto';

@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

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

}