import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class FinishContentDto {
    @IsString()
    @IsNotEmpty()
    courseId: string;
  
    @IsString()
    @IsNotEmpty()
    contentId: string;
  
    @IsEnum(['content', 'subcontent'])
    type: 'content' | 'subcontent';
  }