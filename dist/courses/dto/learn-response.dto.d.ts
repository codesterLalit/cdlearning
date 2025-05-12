export declare class LearnResponseDto {
    type: 'content' | 'subcontent';
    id: string;
    title: string;
    text: string;
    recommendedQuestions: {
        id: string;
        text: string;
    }[];
    requestedQuestion?: {
        id: string;
        text: string;
        answer: string;
    };
    currentProgress: number;
    totalItems: number;
    courseHierarchy: {
        id: string;
        type: 'content' | 'subcontent';
        title: string;
        serialNumber: number;
        parentId?: string;
        current: boolean;
    }[];
}
