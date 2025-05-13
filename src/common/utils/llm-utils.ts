// src/courses/utils/course-generator.util.ts
import { GoogleGenAI } from '@google/genai';

export class CourseGenerator {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: 'AIzaSyBhm4YxIsiUJghqxa_mzoNpwJQqi1bWHAE' });
  }

  async generate(topic: string, complexityLevel: string) {
    const systemPrompt = `
You are an expert course creator and curriculum designer. I want you to create a course based on the topic I give you, and structure the response in strict JSON format.

There are four levels of complexity:
1. Surface Level – Keep the course basic and middle level.
2. Exploring Level – Make it more complex than Surface, but avoid formulas or highly technical material.
3. Experimenter Level – Introduce formulas and moderate technical complexity. Use examples where relevant.
4. Expert Level – Make it complex and use expert-level content suitable for professionals or advanced learners.

I want the course to be curiosity-driven. For each chapter and its sub-content:
- Include 2–4 *curiosity-igniting* questions that can only be answered by reading the chapter/sub-chapter content.
- Provide a detailed answer for each question.
- Make sure users must understand the content to answer the question fully.
- Content should be comprehensive.
- maintain the order of chapter based on serialNumber
- maintain order of sub_content with chapter serial number then order for example for chapter with serialNumber '1', sub_content's serial number should be 1.1 and so on.
- make course as Comprehensive and long as possible

The response must strictly follow this JSON structure/schema:

{
  "Course": "Course Name",
  "complexity": "Surface Level | Exploring Level | Experimenter Level | Expert Level",
  "chapters": [
    {
      "title": "Chapter Title",
      "serialNumber": 1,
      "content": "Chapter content...",
      "questions": [
        {
          "question": "A curiosity-based question",
          "answer": "A detailed answer based on the content"
        }
      ],
      "sub_content": [
        {
          "title": "Sub-section title",
          "content": "Sub-section content...",
          "serialNumber": 1.1,

          "questions": [
            {
              "question": "A curiosity-based question about this sub-topic",
              "answer": "A detailed answer based on the sub-content"
            }
          ]
        }
      ]
    }
  ]
}

Respond with only valid JSON. Do not include any commentary or explanation outside the JSON.
`;
    const userPrompt = `Here is the topic: "${topic}"\nHere is the complexity level: "${complexityLevel}"`;
    const prompt = `${systemPrompt}\n\n${userPrompt}`;

    try {
      const result = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash-001',
        contents: prompt
      });
      return this.parseResponse(result.text, prompt);
    } catch (error) {
      console.error("Error generating content:", error);
      throw new Error("Failed to generate course content");
    }
  }

  private async parseResponse(response: string, prompt: string, attemptCount = 1): Promise<any> {
    try {
      // First, try to parse directly in case it's clean JSON
      return JSON.parse(response);
    } catch (initialError) {
      try {
        // If direct parse fails, try to extract JSON from potential formatting
        let jsonString = response;
        
        // Handle markdown code blocks
        const codeBlockRegex = /```(?:json)?\n([\s\S]*?)\n```/;
        const codeBlockMatch = response.match(codeBlockRegex);
        if (codeBlockMatch) {
          jsonString = codeBlockMatch[1];
        }
        
        jsonString = jsonString.trim();
        
        // Extract JSON content
        if (!jsonString.startsWith('{')) {
          jsonString = jsonString.substring(jsonString.indexOf('{'));
        }
        if (!jsonString.endsWith('}')) {
          jsonString = jsonString.substring(0, jsonString.lastIndexOf('}') + 1);
        }
        
        const parsedData = JSON.parse(jsonString);
        
        // Validate structure
        if (!parsedData.Course || !parsedData.complexity || !Array.isArray(parsedData.chapters)) {
          throw new Error('Invalid course structure');
        }
        
        return parsedData;
      } catch (finalError) {
        // If we haven't reached 3 total attempts, retry the entire generation
        if (attemptCount < 3) {
          console.warn(`JSON parsing failed, retrying (attempt ${attemptCount}/3)...`);
          // Wait for a short time before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
          // Retry the entire generation process
          const newResult = await this.ai.models.generateContent({
            model: 'gemini-2.0-flash-001',
            contents: prompt,
          });
          return this.parseResponse(newResult.text, prompt, attemptCount + 1);
        }
        
        console.error('Failed to parse response after 3 total attempts:', finalError);
        throw new Error('Invalid course content format after 3 total attempts');
      }
    }
  }

  async validateTopic(topic: string): Promise<{ canBeCourse: boolean, reason: string }> {
    const validationPrompt = `
  You are an expert course evaluator. Given a topic, determine if it can logically be expanded into a comprehensive educational course with structured chapters and sub-sections.
  
  Respond only with a valid JSON in this format:
  {
    "canBeCourse": true | false,
    "reason": "Explanation (if canBeCourse is false, otherwise can be empty. Keep it short and precises not exceeding character count to 100.)"
  }
  
  Use your judgment to check:
  - Is the topic educational?
  - Can it be broken down into multiple learning segments?
  - Is there enough depth to generate content for at least a few chapters?
  
  Here is the topic: "${topic}"
  `;
  
    try {
      const result = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash-001',
        contents: validationPrompt
      });
  
      const response = result.text.trim();
  
      try {
        // Attempt to parse JSON directly
        return JSON.parse(response);
      } catch {
        // Try to extract JSON from markdown
        const codeBlockMatch = response.match(/```(?:json)?\n([\s\S]*?)\n```/);
        const jsonString = codeBlockMatch ? codeBlockMatch[1].trim() : response.trim();
  
        const json = JSON.parse(jsonString);
        if (typeof json.canBeCourse === 'boolean' && 'reason' in json) {
          return json;
        }
  
        throw new Error('Invalid structure in LLM response');
      }
    } catch (error) {
      console.error("Error validating topic:", error);
      return {
        canBeCourse: false,
        reason: 'LLM validation failed or returned invalid format'
      };
    }
  }
}