import { ConfigService } from '@nestjs/config';
export declare class CourseGenerator {
    private configSerivce;
    private ai;
    constructor(configSerivce: ConfigService);
    generate(topic: string, complexityLevel: string): Promise<any>;
    private parseResponse;
    validateTopic(topic: string): Promise<{
        canBeCourse: boolean;
        reason: string;
    }>;
}
