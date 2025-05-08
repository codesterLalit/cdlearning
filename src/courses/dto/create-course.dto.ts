import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export enum ComplexityLevel {
  SURFACE = 'Surface Level',
  EXPLORING = 'Exploring Level',
  EXPERIMENTER = 'Experimenter Level',
  EXPERT = 'Expert Level',
}

export class CreateCourseDto {
  @IsString()
  @IsNotEmpty()
  topic: string;

  @IsEnum(ComplexityLevel)
  complexity: ComplexityLevel;
}