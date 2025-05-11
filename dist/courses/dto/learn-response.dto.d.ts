export declare class LearnResponseDto {
    type: 'content' | 'subcontent' | 'question';
    id: string;
    title?: string;
    text?: string;
    recommendedQuestions?: any;
    requestedQuestion?: any;
    question?: {
        id: string;
        text: string;
        answer?: string;
    };
    questions?: {
        id: string;
        text: string;
    }[];
    currentProgress: number;
    totalItems: number;
}
