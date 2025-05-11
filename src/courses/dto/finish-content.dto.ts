import { IsNotEmpty, IsString, IsEnum, IsUUID } from 'class-validator';

export class FinishContentDto {
  @IsUUID()
  @IsNotEmpty()
  courseId: string;

  @IsUUID()
  @IsNotEmpty()
  contentId: string;

  @IsEnum(['content', 'subcontent'])
  @IsNotEmpty()
  type: 'content' | 'subcontent';
}