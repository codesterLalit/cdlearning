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

The response must strictly follow this JSON structure/schema:

{
  "Course": "Course Name",
  "complexity": "Surface Level | Exploring Level | Experimenter Level | Expert Level",
  "chapters": [
    {
      "title": "Chapter Title",
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
        contents: prompt,
      });
      return this.parseResponse(result.text);
    } catch (error) {
      console.error("Error generating content:", error);
      throw new Error("Failed to generate course content");
    }
  }

  private parseResponse(response: string) {
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
        console.error('Failed to parse response:', finalError);
        throw new Error('Invalid course content format');
      }
    }
  }
}