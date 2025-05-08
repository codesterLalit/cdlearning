export declare enum ComplexityLevel {
    SURFACE = "Surface Level",
    EXPLORING = "Exploring Level",
    EXPERIMENTER = "Experimenter Level",
    EXPERT = "Expert Level"
}
export declare class CreateCourseDto {
    topic: string;
    complexity: ComplexityLevel;
}
