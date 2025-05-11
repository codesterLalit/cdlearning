// courses/dto/learn-response.dto.ts
export class LearnResponseDto {
    type: 'content' | 'subcontent' | 'question';
    id: string;
    title?: string;
    text?: string;
    recommendedQuestions?:any;
    requestedQuestion?:any;
    question?: {
      id: string;
      text: string;
      answer?: string; // Only included when showing answer
    };
    questions?: {
      id: string;
      text: string;
    }[];
    currentProgress: number;
    totalItems: number;
  }